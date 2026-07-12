import type { ErrorCapturePort } from "@opzava/ports";
import { ok } from "@opzava/shared-kernel";

// Built-in no-op adapter until ADR-013 GlitchTip wiring provides the real sink.
export const defaultErrorCapturePort: ErrorCapturePort = {
  async capture() {
    return ok(undefined);
  },
};
