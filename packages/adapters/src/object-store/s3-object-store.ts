import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
} from "@opzava/ports";
import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

export interface S3ObjectStoreAdapterOptions {
  readonly bucket: string;
  readonly region: string;
  readonly endpoint?: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle?: boolean;
}

function objectStoreError(code: string, message: string, cause?: unknown): DomainError {
  return new DomainError({
    code,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

type PutObjectBody = NonNullable<PutObjectCommandInput["Body"]>;

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

function objectBody(input: ObjectStorePutInput["body"]): PutObjectBody {
  if (input instanceof Uint8Array) {
    return input;
  }

  if (isWebReadableStream(input)) {
    return Readable.fromWeb(input as NodeReadableStream<Uint8Array>);
  }

  return Readable.from(input);
}

function bodyFromOutput(output: GetObjectCommandOutput): ObjectStoreGetResult["body"] {
  const body = output.Body;
  if (body === undefined) {
    return (async function* emptyBody() {})();
  }

  if (isAsyncIterable(body)) {
    return body;
  }

  if (isWebReadableStream(body)) {
    return body;
  }

  const transformToWebStream = (body as { readonly transformToWebStream?: unknown })
    .transformToWebStream;
  if (typeof transformToWebStream === "function") {
    return transformToWebStream.call(body) as ReadableStream<Uint8Array>;
  }

  return (async function* unsupportedBody() {})();
}

export class S3ObjectStoreAdapter implements ObjectStorePort {
  private readonly bucket: string;
  private readonly client: S3Client;

  public constructor(options: S3ObjectStoreAdapterOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
      forcePathStyle: options.forcePathStyle ?? true,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  public async putObject(input: ObjectStorePutInput): Promise<Result<ObjectStorePutResult>> {
    try {
      const output = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: input.key,
          Body: objectBody(input.body),
          ContentType: input.contentType,
          ...(input.sizeBytes === undefined ? {} : { ContentLength: input.sizeBytes }),
          ...(input.metadata === undefined ? {} : { Metadata: input.metadata }),
        }),
      );

      return ok({
        ref: { bucket: this.bucket, key: input.key },
        etag: output.ETag ?? null,
      });
    } catch (error) {
      return err(objectStoreError("objectStore.putFailed", "Object could not be stored.", error));
    }
  }

  public async getObject(input: ObjectStoreGetInput): Promise<Result<ObjectStoreGetResult>> {
    try {
      const output = await this.client.send(
        new GetObjectCommand({
          Bucket: input.ref.bucket,
          Key: input.ref.key,
        }),
      );

      return ok({
        ref: input.ref,
        body: bodyFromOutput(output),
        contentType: output.ContentType ?? null,
        sizeBytes: output.ContentLength ?? null,
        etag: output.ETag ?? null,
      });
    } catch (error) {
      return err(objectStoreError("objectStore.getFailed", "Object could not be loaded.", error));
    }
  }

  public async presignPutObject(
    input: ObjectStorePresignPutInput,
  ): Promise<Result<ObjectStorePresignedRequest>> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ...(input.metadata === undefined ? {} : { Metadata: input.metadata }),
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn: input.expiresInSeconds,
      });

      return ok({
        ref: { bucket: this.bucket, key: input.key },
        method: "PUT",
        url,
        headers: { "content-type": input.contentType },
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      });
    } catch (error) {
      return err(
        objectStoreError(
          "objectStore.presignPutFailed",
          "Upload URL could not be prepared.",
          error,
        ),
      );
    }
  }

  public async presignGetObject(
    input: ObjectStorePresignGetInput,
  ): Promise<Result<ObjectStorePresignedRequest>> {
    try {
      const command = new GetObjectCommand({
        Bucket: input.ref.bucket,
        Key: input.ref.key,
        ...(input.filename === undefined
          ? {}
          : {
              ResponseContentDisposition: `attachment; filename="${input.filename.replaceAll(
                '"',
                "",
              )}"`,
            }),
      });
      const url = await getSignedUrl(this.client, command, {
        expiresIn: input.expiresInSeconds,
      });

      return ok({
        ref: input.ref,
        method: "GET",
        url,
        headers: {},
        expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      });
    } catch (error) {
      return err(
        objectStoreError(
          "objectStore.presignGetFailed",
          "Download URL could not be prepared.",
          error,
        ),
      );
    }
  }

  public async deleteObject(input: ObjectStoreDeleteInput): Promise<Result<void>> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: input.ref.bucket,
          Key: input.ref.key,
        }),
      );

      return ok(undefined);
    } catch (error) {
      return err(
        objectStoreError("objectStore.deleteFailed", "Object could not be deleted.", error),
      );
    }
  }
}
