import type { Result } from "@opzava/shared-kernel";

export interface ObjectStoreRef {
  readonly bucket: string;
  readonly key: string;
}

export interface ObjectStorePutInput {
  readonly key: string;
  readonly body: Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;
  readonly contentType: string;
  readonly sizeBytes?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface ObjectStoreGetInput {
  readonly ref: ObjectStoreRef;
}

export interface ObjectStoreDeleteInput {
  readonly ref: ObjectStoreRef;
}

export interface ObjectStorePresignPutInput {
  readonly key: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly expiresInSeconds: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface ObjectStorePresignGetInput {
  readonly ref: ObjectStoreRef;
  readonly expiresInSeconds: number;
  readonly filename?: string;
}

export interface ObjectStorePutResult {
  readonly ref: ObjectStoreRef;
  readonly etag: string | null;
}

export interface ObjectStoreGetResult {
  readonly ref: ObjectStoreRef;
  readonly body: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly etag: string | null;
}

export interface ObjectStorePresignedRequest {
  readonly ref: ObjectStoreRef;
  readonly url: string;
  readonly method: "GET" | "PUT";
  readonly headers: Readonly<Record<string, string>>;
  readonly expiresAt: string;
}

export interface ObjectStorePort {
  putObject(input: ObjectStorePutInput): Promise<Result<ObjectStorePutResult>>;
  getObject(input: ObjectStoreGetInput): Promise<Result<ObjectStoreGetResult>>;
  presignPutObject(input: ObjectStorePresignPutInput): Promise<Result<ObjectStorePresignedRequest>>;
  presignGetObject(input: ObjectStorePresignGetInput): Promise<Result<ObjectStorePresignedRequest>>;
  deleteObject(input: ObjectStoreDeleteInput): Promise<Result<void>>;
}
