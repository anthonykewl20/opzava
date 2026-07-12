import type { ObjectStorePort } from "@opzava/ports";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryObjectStore } from "../in-memory-object-store.js";
import { S3ObjectStoreAdapter } from "../s3-object-store.js";

type CommandInput = {
  readonly Bucket?: string;
  readonly Key?: string;
  readonly Body?: Uint8Array | AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
  readonly ContentType?: string;
};

interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType: string | null;
  readonly etag: string;
}

const s3Mock = vi.hoisted(() => {
  class PutObjectCommand {
    public readonly input: CommandInput;

    public constructor(input: CommandInput) {
      this.input = input;
    }
  }

  class GetObjectCommand {
    public readonly input: CommandInput;

    public constructor(input: CommandInput) {
      this.input = input;
    }
  }

  class DeleteObjectCommand {
    public readonly input: CommandInput;

    public constructor(input: CommandInput) {
      this.input = input;
    }
  }

  return {
    objects: new Map<string, StoredObject>(),
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  };
});

async function collectBytes(
  body: Uint8Array | AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      chunks.push(chunk.value);
    }

    return Buffer.concat(chunks);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: s3Mock.PutObjectCommand,
  GetObjectCommand: s3Mock.GetObjectCommand,
  DeleteObjectCommand: s3Mock.DeleteObjectCommand,
  S3Client: class S3Client {
    public async send(
      command:
        | InstanceType<typeof s3Mock.PutObjectCommand>
        | InstanceType<typeof s3Mock.GetObjectCommand>
        | InstanceType<typeof s3Mock.DeleteObjectCommand>,
    ) {
      const bucket = command.input.Bucket ?? "";
      const key = command.input.Key ?? "";
      const objectKey = `${bucket}/${key}`;

      if (command instanceof s3Mock.PutObjectCommand) {
        const body = await collectBytes(command.input.Body ?? new Uint8Array());
        const etag = `"${body.byteLength}:${key}"`;
        s3Mock.objects.set(objectKey, {
          body,
          contentType: command.input.ContentType ?? null,
          etag,
        });

        return { ETag: etag };
      }

      if (command instanceof s3Mock.GetObjectCommand) {
        const object = s3Mock.objects.get(objectKey);
        if (object === undefined) {
          throw new Error("NoSuchKey");
        }

        return {
          Body: (async function* body() {
            yield object.body;
          })(),
          ContentType: object.contentType,
          ContentLength: object.body.byteLength,
          ETag: object.etag,
        };
      }

      s3Mock.objects.delete(objectKey);
      return {};
    }
  },
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: (_client: unknown, command: { readonly input: CommandInput }) =>
    Promise.resolve(`https://signed.example/${command.input.Bucket}/${command.input.Key}`),
}));

async function collectText(
  body: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
): Promise<string> {
  return Buffer.from(await collectBytes(body)).toString("utf8");
}

const stores: ReadonlyArray<{
  readonly name: string;
  readonly create: () => ObjectStorePort;
}> = [
  {
    name: "InMemoryObjectStore",
    create: () =>
      new InMemoryObjectStore({
        bucket: "task-evidence",
        now: () => new Date("2026-07-03T00:00:00.000Z"),
      }),
  },
  {
    name: "S3ObjectStoreAdapter",
    create: () =>
      new S3ObjectStoreAdapter({
        bucket: "task-evidence",
        region: "test-region",
        endpoint: "https://s3.example",
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      }),
  },
];

describe.each(stores)("ObjectStorePort contract: $name", ({ create }) => {
  beforeEach(() => {
    s3Mock.objects.clear();
  });

  it("round-trips a zero-byte body", async () => {
    const store = create();

    const put = await store.putObject({
      key: "empty.txt",
      body: new Uint8Array(),
      contentType: "text/plain",
      sizeBytes: 0,
    });
    expect(put).toMatchObject({
      ok: true,
      value: { ref: { bucket: "task-evidence", key: "empty.txt" } },
    });
    if (!put.ok) {
      throw put.error;
    }

    const get = await store.getObject({ ref: put.value.ref });
    expect(get).toMatchObject({
      ok: true,
      value: {
        ref: put.value.ref,
        contentType: "text/plain",
        sizeBytes: 0,
      },
    });
    if (!get.ok) {
      throw get.error;
    }
    expect(await collectText(get.value.body)).toBe("");
  });

  it("round-trips a small body", async () => {
    const store = create();

    const put = await store.putObject({
      key: "org/workspace/task/file.txt",
      body: new TextEncoder().encode("evidence"),
      contentType: "text/plain",
      sizeBytes: 8,
    });
    expect(put.ok).toBe(true);
    if (!put.ok) {
      throw put.error;
    }

    const get = await store.getObject({ ref: put.value.ref });
    expect(get.ok).toBe(true);
    if (!get.ok) {
      throw get.error;
    }
    expect(get.value.ref).toEqual({ bucket: "task-evidence", key: "org/workspace/task/file.txt" });
    expect(get.value.contentType).toBe("text/plain");
    expect(get.value.sizeBytes).toBe(8);
    expect(await collectText(get.value.body)).toBe("evidence");
  });

  it("returns the presign input shape", async () => {
    const store = create();
    const put = await store.putObject({
      key: "signed.txt",
      body: new TextEncoder().encode("signed"),
      contentType: "text/plain",
      sizeBytes: 6,
    });
    expect(put.ok).toBe(true);
    if (!put.ok) {
      throw put.error;
    }

    await expect(
      store.presignPutObject({
        key: "upload.txt",
        contentType: "text/plain",
        sizeBytes: 6,
        expiresInSeconds: 60,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        ref: { bucket: "task-evidence", key: "upload.txt" },
        method: "PUT",
        headers: { "content-type": "text/plain" },
      },
    });

    await expect(
      store.presignGetObject({
        ref: put.value.ref,
        expiresInSeconds: 60,
        filename: "signed.txt",
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        ref: put.value.ref,
        method: "GET",
        headers: {},
      },
    });
  });

  it("returns a missing result after delete", async () => {
    const store = create();
    const put = await store.putObject({
      key: "delete-me.txt",
      body: new TextEncoder().encode("delete"),
      contentType: "text/plain",
      sizeBytes: 6,
    });
    expect(put.ok).toBe(true);
    if (!put.ok) {
      throw put.error;
    }

    await expect(store.deleteObject({ ref: put.value.ref })).resolves.toMatchObject({ ok: true });
    await expect(store.getObject({ ref: put.value.ref })).resolves.toMatchObject({ ok: false });
  });
});
