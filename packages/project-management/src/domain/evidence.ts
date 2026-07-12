import { DomainError, err, ok, type Result } from "@opzava/shared-kernel";

export const taskEvidenceTypes = [
  "screenshot",
  "e2e",
  "smoke",
  "real_world",
  "mutation",
  "verify_deep",
  "pr",
] as const;
export type TaskEvidenceType = (typeof taskEvidenceTypes)[number];

const taskEvidenceTypeSet = new Set<string>(taskEvidenceTypes);

function evidenceValidationError(code: string, message: string): DomainError {
  return new DomainError({ code, message });
}

export function parseTaskEvidenceType(value: unknown): Result<TaskEvidenceType> {
  if (typeof value === "string" && taskEvidenceTypeSet.has(value)) {
    return ok(value as TaskEvidenceType);
  }

  return err(
    evidenceValidationError(
      "projectManagement.invalidTaskEvidenceType",
      `Task evidence type must be one of: ${taskEvidenceTypes.join(", ")}.`,
    ),
  );
}
