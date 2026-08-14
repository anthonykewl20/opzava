import { createHash } from "node:crypto";
import { canonicalJson } from "./dev-ticket.js";
import type { ChangeRisk, DevTicketType, WorkArea } from "./classification.js";
import { changeRisks } from "./classification.js";

export const changeRiskPolicyVersion = "1";
const rules = Object.freeze([
  { id: "base_low", kind: "floor", risk: "low" },
  { id: "bug_medium", kind: "type", type: "bug", risk: "medium" },
  { id: "security_medium", kind: "work_area", workArea: "security", risk: "medium" },
  { id: "security_sensitive_high", kind: "work_area_pair", workAreas: ["security", "data_database|infrastructure"], risk: "high" },
  { id: "bug_security_high", kind: "type_work_area", type: "bug", workArea: "security", risk: "high" },
  { id: "active_dependencies_raise", kind: "raise", steps: 1 },
] as const);
export const changeRiskPolicyHash = createHash("sha256").update(canonicalJson(rules)).digest("hex");
export interface ChangeRiskEvaluation {
  readonly policyVersion: string;
  readonly policyHash: string;
  readonly normalizedInputs: { readonly type: DevTicketType; readonly workAreas: readonly WorkArea[]; readonly hasActiveDependencies: boolean };
  readonly matchedRuleIds: readonly string[];
  readonly minimumChangeRisk: ChangeRisk;
}
export function evaluateChangeRisk(inputs: { readonly type: DevTicketType; readonly workAreas: readonly WorkArea[]; readonly hasActiveDependencies: boolean }): ChangeRiskEvaluation {
  const workAreas = [...new Set(inputs.workAreas)].sort() as WorkArea[];
  const hasSecurity = workAreas.includes("security");
  const matchedRuleIds = ["base_low"];
  let floor = 0;
  const raiseTo = (risk: ChangeRisk, id: string) => { floor = Math.max(floor, changeRisks.indexOf(risk)); matchedRuleIds.push(id); };
  if (inputs.type === "bug") raiseTo("medium", "bug_medium");
  if (hasSecurity) raiseTo("medium", "security_medium");
  if (hasSecurity && (workAreas.includes("data_database") || workAreas.includes("infrastructure"))) raiseTo("high", "security_sensitive_high");
  if (inputs.type === "bug" && hasSecurity) raiseTo("high", "bug_security_high");
  if (inputs.hasActiveDependencies) { floor = Math.min(changeRisks.length - 1, floor + 1); matchedRuleIds.push("active_dependencies_raise"); }
  return Object.freeze({ policyVersion: changeRiskPolicyVersion, policyHash: changeRiskPolicyHash, normalizedInputs: Object.freeze({ type: inputs.type, workAreas: Object.freeze(workAreas), hasActiveDependencies: inputs.hasActiveDependencies }), matchedRuleIds: Object.freeze(matchedRuleIds), minimumChangeRisk: changeRisks[floor]! });
}
