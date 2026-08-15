import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export interface HashedRecoveryCode {
  readonly salt: string;
  readonly hash: string;
}

export function base32Encode(bytes: Uint8Array): string {
  let value = 0n;
  let bits = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
    bits += 8;
    while (bits >= 5) {
      output += base32Alphabet[Number((value >> BigInt(bits - 5)) & 31n)];
      bits -= 5;
    }
  }
  return bits === 0
    ? output
    : `${output}${base32Alphabet[Number((value << BigInt(5 - bits)) & 31n)]}`;
}

export function base32Decode(value: string): Buffer {
  const normalized = value.replace(/\s|-/g, "").toUpperCase();
  let accumulator = 0n;
  let bits = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = base32Alphabet.indexOf(character);
    if (index === -1) throw new Error("Invalid TOTP secret.");
    accumulator = (accumulator << 5n) | BigInt(index);
    bits += 5;
    if (bits >= 8) {
      bytes.push(Number((accumulator >> BigInt(bits - 8)) & 255n));
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpAt(secret: string, timeMs: number): string {
  const counter = Math.floor(timeMs / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(counterBuffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = ((digest[offset] ?? 0) & 127) << 24 |
    (digest[offset + 1] ?? 0) << 16 |
    (digest[offset + 2] ?? 0) << 8 |
    (digest[offset + 3] ?? 0);
  return String(binary % 1_000_000).padStart(6, "0");
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Opzava:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Opzava&algorithm=SHA1&digits=6&period=30`;
}

export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-30_000, 0, 30_000].some((offset) => {
    const candidateTime = now + offset;
    return candidateTime >= 0 && timingSafeEqual(Buffer.from(totpAt(secret, candidateTime)), Buffer.from(code));
  });
}

export function mfaEncryptionKey(): string | null {
  const key = process.env["BETTER_AUTH_SECRET"];
  return key === undefined || key.trim() === "" ? null : key;
}

const atRestSalt = "opzava/v1/identity-at-rest";
const atRestInfo = "opzava-identity-access";
const hkdfPrefix = "hkdf1:";

/**
 * MFA material must not be encrypted with BETTER_AUTH_SECRET directly.  Keeping
 * the legacy decrypt path lets existing factors survive this key separation;
 * every new enrollment writes the versioned HKDF-derived form.
 */
function atRestEncryptionKey(secret: string): string {
  return Buffer.from(hkdfSync("sha256", secret, atRestSalt, atRestInfo, 32)).toString("base64url");
}

/** Separate stable HMAC key for indexed external-identity email lookup. */
export function identityLookupKey(): string | null {
  const secret = mfaEncryptionKey();
  return secret === null
    ? null
    : Buffer.from(hkdfSync("sha256", secret, "opzava/v1/identity-lookup", "opzava-identity-access", 32)).toString("base64url");
}

export async function encryptTotpSecret(secret: string): Promise<string> {
  const key = mfaEncryptionKey();
  if (key === null) throw new Error("BETTER_AUTH_SECRET is required for MFA.");
  return `${hkdfPrefix}${await symmetricEncrypt({ key: atRestEncryptionKey(key), data: secret })}`;
}

export async function decryptTotpSecret(secret: string): Promise<string> {
  const key = mfaEncryptionKey();
  if (key === null) throw new Error("BETTER_AUTH_SECRET is required for MFA.");
  return secret.startsWith(hkdfPrefix)
    ? symmetricDecrypt({ key: atRestEncryptionKey(key), data: secret.slice(hkdfPrefix.length) })
    : symmetricDecrypt({ key, data: secret });
}

function recoveryDigest(salt: string, code: string): string {
  return createHmac("sha256", salt).update(code.trim().toUpperCase()).digest("hex");
}

function recoveryCode(): string {
  const raw = base32Encode(randomBytes(6)).slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function generateRecoveryCodes(): { readonly codes: readonly string[]; readonly hashes: readonly HashedRecoveryCode[] } {
  const codes = Array.from({ length: 10 }, recoveryCode);
  return {
    codes,
    hashes: codes.map((code) => {
      const salt = randomBytes(16).toString("hex");
      return { salt, hash: recoveryDigest(salt, code) };
    })
  };
}

export function consumeRecoveryCode(
  hashes: readonly HashedRecoveryCode[],
  code: string
): readonly HashedRecoveryCode[] | null {
  const index = hashes.findIndex((candidate) => {
    const actual = Buffer.from(recoveryDigest(candidate.salt, code));
    const expected = Buffer.from(candidate.hash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
  return index === -1 ? null : hashes.filter((_, candidateIndex) => candidateIndex !== index);
}
