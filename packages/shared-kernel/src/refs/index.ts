import { DomainError, err, ok, type Result } from "../result/index.js";

export interface OpaqueExternalRefInput {
  readonly system: string;
  readonly kind: string;
  readonly value: string;
}

export interface OpaqueExternalRef {
  readonly system: string;
  readonly kind: string;
  readonly value: string;
}

function normalizePart(field: keyof OpaqueExternalRefInput, value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new DomainError({
      code: "sharedKernel.invalidOpaqueExternalRef",
      message: "OpaqueExternalRef parts must be non-empty.",
      details: { field }
    });
  }

  return normalized;
}

export function makeOpaqueExternalRef(input: OpaqueExternalRefInput): OpaqueExternalRef {
  return {
    system: normalizePart("system", input.system),
    kind: normalizePart("kind", input.kind),
    value: normalizePart("value", input.value)
  };
}

export function parseOpaqueExternalRef(input: unknown): Result<OpaqueExternalRef> {
  if (
    typeof input !== "object" ||
    input === null ||
    !("system" in input) ||
    !("kind" in input) ||
    !("value" in input)
  ) {
    return err(
      new DomainError({
        code: "sharedKernel.invalidOpaqueExternalRef",
        message: "OpaqueExternalRef must be an object with system, kind, and value."
      })
    );
  }

  const candidate = input as Partial<Record<keyof OpaqueExternalRefInput, unknown>>;

  if (
    typeof candidate.system !== "string" ||
    typeof candidate.kind !== "string" ||
    typeof candidate.value !== "string"
  ) {
    return err(
      new DomainError({
        code: "sharedKernel.invalidOpaqueExternalRef",
        message: "OpaqueExternalRef system, kind, and value must be strings."
      })
    );
  }

  try {
    return ok(makeOpaqueExternalRef(candidate as OpaqueExternalRefInput));
  } catch (error) {
    if (error instanceof DomainError) {
      return err(error);
    }

    throw error;
  }
}
