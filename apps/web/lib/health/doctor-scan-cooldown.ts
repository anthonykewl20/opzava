export const doctorScanCooldownMs = 30_000;

export interface DoctorScanCooldown {
  readonly disabled: boolean;
  readonly secondsRemaining: number;
  readonly label: string;
}

export function doctorScanCooldown(
  runCheckedAt: string | null,
  nowMs: number,
): DoctorScanCooldown {
  if (runCheckedAt === null) {
    return { disabled: false, secondsRemaining: 0, label: "Re-check now" };
  }

  const checkedAtMs = Date.parse(runCheckedAt);
  const elapsedMs = nowMs - checkedAtMs;
  if (!Number.isFinite(checkedAtMs) || elapsedMs < 0 || elapsedMs >= doctorScanCooldownMs) {
    return { disabled: false, secondsRemaining: 0, label: "Re-check now" };
  }

  const secondsAgo = Math.floor(elapsedMs / 1_000);
  const secondsRemaining = Math.ceil((doctorScanCooldownMs - elapsedMs) / 1_000);
  return {
    disabled: true,
    secondsRemaining,
    label: `Scanned ${secondsAgo}s ago — available again in ${secondsRemaining}s`,
  };
}
