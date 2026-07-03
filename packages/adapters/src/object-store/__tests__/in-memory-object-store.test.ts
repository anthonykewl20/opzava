import { describe, expect, it } from "vitest";

import { InMemoryObjectStore } from "../in-memory-object-store.js";

async function collect(
  body: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>,
): Promise<string> {
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

    return Buffer.concat(chunks).toString("utf8");
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

describe("InMemoryObjectStore", () => {
  it("implements ObjectStorePort put/get/presign/delete against a fake store", async () => {
    const store = new InMemoryObjectStore({
      bucket: "task-evidence",
      now: () => new Date("2026-07-03T00:00:00.000Z"),
    });

    const put = await store.putObject({
      key: "org/workspace/task/file.txt",
      body: new TextEncoder().encode("evidence"),
      contentType: "text/plain",
      sizeBytes: 8,
    });
    expect(put).toMatchObject({
      ok: true,
      value: { ref: { bucket: "task-evidence", key: "org/workspace/task/file.txt" } },
    });

    const signedPut = await store.presignPutObject({
      key: "org/workspace/task/other.txt",
      contentType: "text/plain",
      sizeBytes: 5,
      expiresInSeconds: 60,
    });
    expect(signedPut).toMatchObject({
      ok: true,
      value: {
        method: "PUT",
        expiresAt: "2026-07-03T00:01:00.000Z",
      },
    });

    const get = await store.getObject({
      ref: { bucket: "task-evidence", key: "org/workspace/task/file.txt" },
    });
    expect(get.ok).toBe(true);
    if (!get.ok) {
      throw get.error;
    }
    expect(await collect(get.value.body)).toBe("evidence");

    const signedGet = await store.presignGetObject({
      ref: get.value.ref,
      expiresInSeconds: 60,
      filename: "file.txt",
    });
    expect(signedGet).toMatchObject({ ok: true, value: { method: "GET" } });

    await store.deleteObject({ ref: get.value.ref });
    const missing = await store.getObject({ ref: get.value.ref });
    expect(missing).toMatchObject({ ok: false, error: { code: "objectStore.notFound" } });
  });
});
