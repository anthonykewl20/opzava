"use server";

import { revalidatePath } from "next/cache";

import { formFailureState, initialFormActionState, type FormActionState } from "@/lib/action-state";
import { admitsAdminControlCenter } from "@/lib/admin-registry";
import { requireContext } from "@/lib/authed-action";
import {
  defaultDoctorScanClient,
  readDoctorScanScope,
  type DoctorScanLatest,
} from "@/lib/doctor-scan";

function errorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown";
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : "unknown";
}

function doctorScanFailureState(error: unknown): FormActionState {
  const code = errorCode(error);
  const normalizedCode = code.toLowerCase();
  if (
    normalizedCode.includes("cooldown") ||
    normalizedCode.includes("conflict") ||
    normalizedCode.includes("inflight") ||
    normalizedCode.includes("in_flight")
  ) {
    return formFailureState("Scanned recently — available again soon.");
  }
  return formFailureState(`Doctor scan could not be started (${code}).`);
}

function doctorScanResultState(result: DoctorScanLatest): FormActionState {
  return result.inProgress
    ? initialFormActionState
    : formFailureState("Scanned recently — available again soon.");
}

export async function recheckDoctorScanAction(
  _previousState: FormActionState,
  _formData: FormData,
): Promise<FormActionState> {
  void _previousState;
  void _formData;
  try {
    const context = await requireContext();
    if (!admitsAdminControlCenter(context.roleKeys)) {
      return formFailureState("You must be an administrator to re-check health.");
    }
  } catch {
    return formFailureState("You must be signed in as an administrator to re-check health.");
  }

  const scope = readDoctorScanScope(process.env);
  if (!scope.ok) {
    return formFailureState("Doctor scan is not configured.");
  }

  const result = await defaultDoctorScanClient().force(scope.value);
  if (!result.ok) {
    return doctorScanFailureState(result.error);
  }

  const state = doctorScanResultState(result.value);
  if (state.status === "error") return state;

  revalidatePath("/health");
  return state;
}
