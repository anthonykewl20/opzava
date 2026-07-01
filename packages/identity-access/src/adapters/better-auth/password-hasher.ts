import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const algorithm = "opzava_scrypt_v1";
const params = {
  n: 16384,
  r: 8,
  p: 1,
  keyLength: 64
} as const;
const maxmem = 64 * 1024 * 1024;

function encode(bytes: Buffer): string {
  return bytes.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function encodeParams(): string {
  return `N=${params.n},r=${params.r},p=${params.p},keylen=${params.keyLength}`;
}

function parseParams(value: string): typeof params | null {
  const parsed = Object.fromEntries(
    value.split(",").map((entry) => {
      const [key, rawValue] = entry.split("=");
      return [key, rawValue];
    })
  );

  if (
    parsed["N"] !== String(params.n) ||
    parsed["r"] !== String(params.r) ||
    parsed["p"] !== String(params.p) ||
    parsed["keylen"] !== String(params.keyLength)
  ) {
    return null;
  }

  return params;
}

// Manual promise wrapper: promisify(scrypt) resolves to the 3-arg overload type,
// which rejects an options object. The 5-arg (options + callback) overload lets us
// pin N/r/p/maxmem explicitly.
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      params.keyLength,
      { N: params.n, r: params.r, p: params.p, maxmem },
      (error, derivedKey) => {
        if (error) {
          reject(error);
        } else {
          resolve(derivedKey);
        }
      }
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `${algorithm}$${encodeParams()}$${encode(salt)}$${encode(hash)}`;
}

export async function verifyPassword(input: {
  readonly hash: string;
  readonly password: string;
}): Promise<boolean> {
  const [version, rawParams, rawSalt, rawHash] = input.hash.split("$");

  if (
    version !== algorithm ||
    rawParams === undefined ||
    rawSalt === undefined ||
    rawHash === undefined ||
    parseParams(rawParams) === null
  ) {
    return false;
  }

  const expected = decode(rawHash);
  const actual = await derive(input.password, decode(rawSalt));

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
