import type {
  ObjectStoreDeleteInput,
  ObjectStoreGetInput,
  ObjectStoreGetResult,
  ObjectStorePort,
  ObjectStorePresignedRequest,
  ObjectStorePresignGetInput,
  ObjectStorePresignPutInput,
  ObjectStorePutInput,
  ObjectStorePutResult,
  ObjectStoreRef,
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import { createHash } from "node:crypto";

interface StoredObject {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly etag: string;
}

export interface InMemoryObjectStoreOptions {
  readonly bucket: string;
  readonly now?: () => Date;
}

function objectStoreError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isWebReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<Uint8Array> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { readonly [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] ===
      "function"
  );
}

async function collectBody(input: ObjectStorePutInput["body"]): Promise<Uint8Array> {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (isWebReadableStream(input)) {
    const reader = input.getReader();
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
  if (!isAsyncIterable(input)) {
    return Buffer.concat(chunks);
  }

  for await (const chunk of input) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function etagFor(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

function asyncBody(body: Uint8Array): AsyncIterable<Uint8Array> {
  return (async function* yieldBody() {
    yield body;
  })();
}

export class InMemoryObjectStore implements ObjectStorePort {
  private readonly bucket: string;
  private readonly now: () => Date;
  private readonly objects = new Map<string, StoredObject>();

  public constructor(options: InMemoryObjectStoreOptions) {
    this.bucket = options.bucket;
    this.now = options.now ?? (() => new Date());
  }

  public async putObject(input: ObjectStorePutInput): Promise<Result<ObjectStorePutResult>> {
    try {
      const body = await collectBody(input.body);
      const etag = etagFor(body);
      this.objects.set(input.key, {
        body,
        contentType: input.contentType,
        etag,
      });

      return ok({
        ref: { bucket: this.bucket, key: input.key },
        etag,
      });
    } catch (error) {
      return err(objectStoreError("objectStore.putFailed", "Object could not be stored.", error));
    }
  }

  public async getObject(input: ObjectStoreGetInput): Promise<Result<ObjectStoreGetResult>> {
    const object = this.objects.get(input.ref.key);
    if (object === undefined || input.ref.bucket !== this.bucket) {
      return err(objectStoreError("objectStore.notFound", "Object was not found."));
    }

    return ok({
      ref: input.ref,
      body: asyncBody(object.body),
      contentType: object.contentType,
      sizeBytes: object.body.byteLength,
      etag: object.etag,
    });
  }

  public async presignPutObject(
    input: ObjectStorePresignPutInput,
  ): Promise<Result<ObjectStorePresignedRequest>> {
    return ok(
      this.presignedRequest(
        { bucket: this.bucket, key: input.key },
        "PUT",
        input.expiresInSeconds,
        {
          "content-type": input.contentType,
        },
      ),
    );
  }

  public async presignGetObject(
    input: ObjectStorePresignGetInput,
  ): Promise<Result<ObjectStorePresignedRequest>> {
    if (input.ref.bucket !== this.bucket || !this.objects.has(input.ref.key)) {
      return err(objectStoreError("objectStore.notFound", "Object was not found."));
    }

    return ok(this.presignedRequest(input.ref, "GET", input.expiresInSeconds, {}));
  }

  public async deleteObject(input: ObjectStoreDeleteInput): Promise<Result<void>> {
    if (input.ref.bucket === this.bucket) {
      this.objects.delete(input.ref.key);
    }

    return ok(undefined);
  }

  private presignedRequest(
    ref: ObjectStoreRef,
    method: "GET" | "PUT",
    expiresInSeconds: number,
    headers: Readonly<Record<string, string>>,
  ): ObjectStorePresignedRequest {
    return {
      ref,
      method,
      headers,
      url: `memory://${ref.bucket}/${encodeURIComponent(ref.key)}?method=${method}`,
      expiresAt: new Date(this.now().getTime() + expiresInSeconds * 1000).toISOString(),
    };
  }
}
