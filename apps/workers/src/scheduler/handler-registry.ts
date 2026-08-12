import type { OpenClawDoctorScanPort } from "../health-doctor-scan/orchestrator.js";
import type { ScheduledJobHandlerRegistry } from "./durable-scheduler.js";

export const DOCTOR_SCAN_JOB_KEY = "openclaw.doctor-scan";
export const DOCTOR_SCAN_SCOPE = "platform-gateway";

/**
 * Closed registry: persisted job keys never select imports, commands, URLs, or other dynamic work.
 * The doctor handler is admissible under the at-least-once contract because its distinct
 * platform_doctor_scan_lease independently fences execution and publication (ADR-021/ADR-022).
 */
export function createScheduledJobHandlerRegistry(
  doctorScanPort: Pick<OpenClawDoctorScanPort, "tick">,
): ScheduledJobHandlerRegistry {
  return new Map([
    [DOCTOR_SCAN_JOB_KEY, async (context) => { await doctorScanPort.tick(context); }],
  ]);
}
