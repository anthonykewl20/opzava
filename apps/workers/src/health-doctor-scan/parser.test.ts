import { describe, expect, it } from "vitest";

import { MAX_DOCTOR_FINDINGS, MAX_DOCTOR_OUTPUT_BYTES, parseDoctorLintOutput } from "./parser.js";
import { DOCTOR_SAFE_SUMMARY_REGISTRY } from "./safe-summary-registry.js";
import { DOCTOR_SUPPRESSION_REGISTRY } from "./suppression-registry.js";

function output(findings: readonly Record<string, unknown>[], exitCode = 1) {
  return { exitCode, stdout: JSON.stringify({ ok: false, checksRun: 2, checksSkipped: 1, findings }) };
}

describe("parseDoctorLintOutput redaction boundary", () => {
  it("structurally discards every upstream free-form and location field", () => {
    const secrets = [
      "MESSAGE_SECRET", "SOURCE_SECRET", "/PATH_SECRET", "OCPATH_SECRET",
      "TARGET_SECRET", "REQUIREMENT_SECRET", "FIX_SECRET", "UNKNOWN_SECRET"
    ];
    const run = parseDoctorLintOutput(output([{
      checkId: "core/doctor/session-locks",
      severity: "warning",
      message: secrets[0], source: secrets[1], path: secrets[2], line: 42, column: 7,
      ocPath: secrets[3], target: secrets[4], requirement: secrets[5], fixHint: secrets[6],
      pluginPayload: secrets[7]
    }]));

    expect(run.status).toBe("succeeded");
    const persistedDto = JSON.stringify(run);
    for (const secret of secrets) expect(persistedDto).not.toContain(secret);
    expect(run.findings[0]).toEqual({
      checkId: "core/doctor/session-locks",
      severity: "warning",
      group: "Sessions",
      summary: "OpenClaw doctor found a session lock requiring attention.",
      detailState: "available",
      locationLabel: null,
      targetLabel: null,
      fixHint: null,
      suppressed: false,
      suppressionReason: null
    });
  });

  it("retains a structurally inapplicable finding with its suppression reason", () => {
    const run = parseDoctorLintOutput(output([{
      checkId: "core/doctor/gateway-daemon",
      severity: "warning",
      message: "UPSTREAM_SECRET"
    }]));

    expect(run.findings).toHaveLength(1);
    expect(run.findings[0]).toMatchObject({
      checkId: "core/doctor/gateway-daemon",
      severity: "warning",
      suppressed: true,
      suppressionReason: "OpenClaw runs as a container, not a system service."
    });
    expect(JSON.stringify(run)).not.toContain("UPSTREAM_SECRET");
  });

  it("leaves a registered safe-summary check unsuppressed", () => {
    const run = parseDoctorLintOutput(output([{
      checkId: "core/doctor/session-locks",
      severity: "warning"
    }]));

    expect(run.findings[0]).toMatchObject({
      checkId: "core/doctor/session-locks",
      suppressed: false,
      suppressionReason: null
    });
  });

  it("does not suppress prototype-colliding check ids", () => {
    for (const checkId of ["constructor"]) {
      const run = parseDoctorLintOutput(output([{ checkId, severity: "info", message: "SECRET" }]));
      expect(run.findings[0]).toMatchObject({ checkId, suppressed: false, suppressionReason: null });
      expect(JSON.stringify(run)).not.toContain("SECRET");
    }
  });

  it("uses the exact safe fallback for unknown and unsafe check ids", () => {
    for (const checkId of ["plugin.future-check", "../../SECRET", "X".repeat(129)]) {
      const run = parseDoctorLintOutput(output([{ checkId, severity: "error", message: "SECRET" }]));
      expect(run.findings[0]).toMatchObject({
        checkId: checkId === "plugin.future-check" ? checkId : "unknown",
        group: "Other",
        summary: "OpenClaw doctor reported a error finding in an unclassified check.",
        detailState: "redacted_unavailable",
        suppressed: false,
        suppressionReason: null
      });
      expect(JSON.stringify(run)).not.toContain("SECRET");
    }
  });

  it.each([0, 1])("treats exit %i as a parsed successful execution", (exitCode) => {
    expect(parseDoctorLintOutput(output([], exitCode))).toMatchObject({ status: "succeeded" });
  });

  it("maps exit 2, invalid JSON, oversized output, and finding overflow to unavailable", () => {
    expect(parseDoctorLintOutput({ exitCode: 2, stdout: "SECRET" })).toMatchObject({ failureCode: "doctor_exit_2" });
    expect(parseDoctorLintOutput({ exitCode: 0, stdout: "{" })).toMatchObject({ failureCode: "invalid_json" });
    expect(parseDoctorLintOutput({ exitCode: 0, stdout: "x".repeat(MAX_DOCTOR_OUTPUT_BYTES + 1) })).toMatchObject({ failureCode: "output_oversized" });
    expect(parseDoctorLintOutput(output(Array.from({ length: MAX_DOCTOR_FINDINGS + 1 }, () => ({})), 0))).toMatchObject({ failureCode: "invalid_envelope" });
  });

  it("rejects open severity and invalid envelope values instead of forwarding them", () => {
    expect(parseDoctorLintOutput(output([{ checkId: "safe", severity: "critical", message: "SECRET" }]))).toMatchObject({ status: "unavailable", failureCode: "invalid_envelope" });
    expect(parseDoctorLintOutput({ exitCode: 0, stdout: JSON.stringify({ checksRun: -1, checksSkipped: 0, findings: [] }) })).toMatchObject({ failureCode: "invalid_envelope" });
  });
});

describe("safe-summary registry", () => {
  it("contains only bounded safe ids, groups, and Opzava-owned summaries", () => {
    expect(Object.keys(DOCTOR_SAFE_SUMMARY_REGISTRY).length).toBeGreaterThan(0);
    for (const [checkId, entry] of Object.entries(DOCTOR_SAFE_SUMMARY_REGISTRY)) {
      expect(checkId).toMatch(/^[a-z0-9][a-z0-9._/-]{0,127}$/);
      expect(entry.group.length).toBeLessThanOrEqual(64);
      expect(entry.summary.length).toBeLessThanOrEqual(256);
      expect(entry.summary).toMatch(/^OpenClaw doctor found /);
    }
  });

  it("classifies every registered check with its exact checked-in template", () => {
    for (const [checkId, entry] of Object.entries(DOCTOR_SAFE_SUMMARY_REGISTRY)) {
      const finding = parseDoctorLintOutput(output([{
        checkId, severity: "info", message: "UPSTREAM_SECRET"
      }])).findings[0];
      expect(finding).toMatchObject({
        checkId, group: entry.group, summary: entry.summary, detailState: "available"
      });
      expect(JSON.stringify(finding)).not.toContain("UPSTREAM_SECRET");
    }
  });
});

describe("suppression registry", () => {
  it("contains only bounded safe ids, reasons, and non-empty review owners", () => {
    expect(Object.keys(DOCTOR_SUPPRESSION_REGISTRY).length).toBeGreaterThan(0);
    for (const [checkId, entry] of Object.entries(DOCTOR_SUPPRESSION_REGISTRY)) {
      expect(checkId).toMatch(/^[a-z0-9][a-z0-9._/-]{0,127}$/);
      expect(entry.reason.length).toBeGreaterThanOrEqual(1);
      expect(entry.reason.length).toBeLessThanOrEqual(64);
      expect(entry.reviewOwner.length).toBeGreaterThan(0);
    }
  });
});
