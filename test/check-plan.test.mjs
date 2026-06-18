import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('opzava plan captures the broader AI team scope', async () => {
  const plan = await readFile(new URL('../docs/plans/opzava-start-plan.md', import.meta.url), 'utf8');

  assert.match(plan, /^# Opzava Start Plan/m);
  assert.match(plan, /Full brand name: `Opzava`/);
  assert.match(plan, /Machine slug: `opzava`/);
  assert.match(plan, /Content generation is the first department workflow, not the whole product/);
  assert.match(plan, /SEO Researcher/);
  assert.match(plan, /Cold Email Writer/);
  assert.match(plan, /Build the durable runner first/);
  assert.match(plan, /No auto-publish and no auto-send in the first milestone/);
});

test('ARD records the Mission Control base decision', async () => {
  const adr = await readFile(new URL('../docs/ard/0001-use-mission-control-as-base.md', import.meta.url), 'utf8');

  assert.match(adr, /^# ARD 0001: Use Mission Control As The Opzava Base/m);
  assert.match(adr, /Status: Accepted/);
  assert.match(adr, /Project repository: `https:\/\/github.com\/anthonykewl20\/opzava`/);
  assert.match(adr, /`builderz-labs\/mission-control`/);
  assert.match(adr, /Full brand name: `Opzava`/);
  assert.match(adr, /Machine slug: `opzava`/);
  assert.match(adr, /heavily customized/);
});

test('opzava plan requires implementation, R&D, and entropy-control layers', async () => {
  const plan = await readFile(new URL('../docs/plans/opzava-start-plan.md', import.meta.url), 'utf8');

  assert.match(plan, /Required Implementation Layers/);
  assert.match(plan, /Branding layer/);
  assert.match(plan, /docs\/plans\/opzava-implementation-layers\.md/);
  assert.match(plan, /Shared language layer/);
  assert.match(plan, /Local discovery layer/);
  assert.match(plan, /Measurement layer/);
  assert.match(plan, /Entropy-control layer/);
  assert.match(plan, /Garbage-collection layer/);
  assert.match(plan, /Restart, retry, replay, approval-blocking, and duplicate external-action tests pass/);
});

test('implementation layers define discovery, benchmarks, contracts, TDD, and garbage collection', async () => {
  const layers = await readFile(new URL('../docs/plans/opzava-implementation-layers.md', import.meta.url), 'utf8');

  assert.match(layers, /^# Opzava Implementation Layers/m);
  assert.match(layers, /Layer 0: Shared Context And Golden Principles/);
  assert.match(layers, /Layer 1: Base Acquisition And Upstream Audit/);
  assert.match(layers, /Layer 3: Measurement And Benchmark Baseline/);
  assert.match(layers, /Layer 4: Contract And Data Model Layer/);
  assert.match(layers, /Layer 5: Durable Runner Layer/);
  assert.match(layers, /Layer 8: Admin Settings And Secret Management Layer/);
  assert.match(layers, /Layer 10: Complexity And Entropy Controls/);
  assert.match(layers, /Layer 11: TDD And Feedback Loop/);
  assert.match(layers, /Layer 12: Garbage Collection Process/);
  assert.match(layers, /R&D Decision Loop/);
});

test('shared context and golden principles define language and anti-slop rules', async () => {
  const context = await readFile(new URL('../CONTEXT.md', import.meta.url), 'utf8');
  const principles = await readFile(new URL('../docs/golden-principles.md', import.meta.url), 'utf8');

  assert.match(context, /^# Opzava Context/m);
  assert.match(context, /Ubiquitous Language/);
  assert.match(context, /Forbidden Ambiguity/);
  assert.match(context, /AntiSlopReview/);
  assert.match(principles, /^# Opzava Golden Principles/m);
  assert.match(principles, /Do not build shallow modules/);
  assert.match(principles, /Do not accept generic AI slop as a final artifact/);
  assert.match(principles, /Run recurring scans for drift/);
});

test('R&D gate ARD is accepted and requires measured local evidence', async () => {
  const adr = await readFile(new URL('../docs/ard/0002-require-local-rnd-and-measurement-gates.md', import.meta.url), 'utf8');

  assert.match(adr, /^# ARD 0002: Require Local R&D And Measurement Gates/m);
  assert.match(adr, /Status: Accepted/);
  assert.match(adr, /Discovery notes in `docs\/discovery\/`/);
  assert.match(adr, /Benchmarks in `docs\/benchmarks\/`/);
  assert.match(adr, /Shared language in `CONTEXT\.md`/);
  assert.match(adr, /Golden principles in `docs\/golden-principles\.md`/);
  assert.match(adr, /Complexity, entropy, and garbage-collection checks/);
});

test('discovery and benchmark directories define evidence templates', async () => {
  const discovery = await readFile(new URL('../docs/discovery/README.md', import.meta.url), 'utf8');
  const benchmarks = await readFile(new URL('../docs/benchmarks/README.md', import.meta.url), 'utf8');

  assert.match(discovery, /^# Discovery Notes/m);
  assert.match(discovery, /Local Experiment/);
  assert.match(discovery, /Measurements/);
  assert.match(discovery, /captured provenance/);
  assert.match(benchmarks, /^# Benchmarks/m);
  assert.match(benchmarks, /Initial Measurements/);
  assert.match(benchmarks, /Anti-slop review duration/);
  assert.match(benchmarks, /Measure before optimizing/);
});

test('local baseline records measured app validation results', async () => {
  const baseline = await readFile(new URL('../docs/benchmarks/0001-local-baseline.md', import.meta.url), 'utf8');

  assert.match(baseline, /Warm dependency install/);
  assert.match(baseline, /Typecheck/);
  assert.match(baseline, /Lint/);
  assert.match(baseline, /Unit tests/);
  assert.match(baseline, /Production build/);
  assert.match(baseline, /Full app validation is now measured/);
  assert.doesNotMatch(baseline, /Dependency install is currently blocked/);
});

test('inherited configuration and secret handling inventory is documented', async () => {
  const inventory = await readFile(new URL('../docs/discovery/0003-inherited-config-and-secret-inventory.md', import.meta.url), 'utf8');

  assert.match(inventory, /^# 0003: Inherited Config And Secret Inventory/m);
  assert.match(inventory, /Status: CONFIRMED/);
  assert.match(inventory, /Dependency Map/);
  assert.match(inventory, /Hard-Coded Setting Inventory/);
  assert.match(inventory, /Secret Handling Inventory/);
  assert.match(inventory, /OpenClaw-First Assumptions/);
  assert.match(inventory, /Opzava Implications/);
  assert.match(inventory, /Do not build live provider adapters/);
});

test('plan requires admin-managed configuration and no hard-coded secrets', async () => {
  const plan = await readFile(new URL('../docs/plans/opzava-start-plan.md', import.meta.url), 'utf8');

  assert.match(plan, /No hard-coded secrets/);
  assert.match(plan, /admin settings/);
  assert.match(plan, /typed config validation/);
  assert.match(plan, /secret redaction/);
});

test('case study content system captures build evidence without AI slop', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const standards = await readFile(new URL('../docs/case-study/editorial-standard.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0001-foundation-contracts.md', import.meta.url), 'utf8');

  assert.match(readme, /^# Opzava Case Study/m);
  assert.match(readme, /Build-in-public source of truth/);
  assert.match(readme, /No invented outcomes/);
  assert.match(standards, /^# Case Study Editorial Standard/m);
  assert.match(standards, /Evidence Required/);
  assert.match(standards, /Stakes vs\. Speculation/);
  assert.match(standards, /Industry Counterfactual/);
  assert.match(standards, /Anti-Slop Rules/);
  assert.match(standards, /Secret Redaction/);
  assert.match(entry, /^# 0001: Foundation Contracts Before Runner Code/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /What We Built/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records durable runner contract progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0002-durable-runner-contracts.md', import.meta.url), 'utf8');

  assert.match(readme, /0002-durable-runner-contracts\.md/);
  assert.match(entry, /^# 0002: Durable Runner Contracts Before Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /What We Built/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records operational observability contract progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0003-operational-observability-contracts.md', import.meta.url), 'utf8');

  assert.match(readme, /0003-operational-observability-contracts\.md/);
  assert.match(entry, /^# 0003: Operational Observability Contracts Before Live Providers/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /ExternalCallRecord/);
  assert.match(entry, /CostEvent/);
  assert.match(entry, /AuditEvent/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records durable repository implementation progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0004-durable-runner-repository.md', import.meta.url), 'utf8');

  assert.match(readme, /0004-durable-runner-repository\.md/);
  assert.match(entry, /^# 0004: Durable Runner Repository Before Worker Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /SQLite-backed/);
  assert.match(entry, /transaction/);
  assert.match(entry, /replay/);
  assert.match(entry, /restart-safe recovery/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records runner migration integration progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0005-runner-migration-integration.md', import.meta.url), 'utf8');

  assert.match(readme, /0005-runner-migration-integration\.md/);
  assert.match(entry, /^# 0005: Runner Repository Migrations Through App Startup/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /schema_migrations/);
  assert.match(entry, /registerOpzavaRunnerMigrations/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records atomic lease acquisition progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0006-atomic-lease-acquisition.md', import.meta.url), 'utf8');

  assert.match(readme, /0006-atomic-lease-acquisition\.md/);
  assert.match(entry, /^# 0006: Atomic Lease Acquisition Before Worker Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /leaseNextJobForAttempt/);
  assert.match(entry, /attempt/);
  assert.match(entry, /priority/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records transactional attempt outcome progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0007-transactional-attempt-outcomes.md', import.meta.url), 'utf8');

  assert.match(readme, /0007-transactional-attempt-outcomes\.md/);
  assert.match(entry, /^# 0007: Transactional Attempt Outcomes Before Provider Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /recordAttemptSuccess/);
  assert.match(entry, /recordAttemptFailure/);
  assert.match(entry, /dead letter/);
  assert.match(entry, /retry/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records expired lease recovery execution progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0008-expired-lease-recovery-execution.md', import.meta.url), 'utf8');

  assert.match(readme, /0008-expired-lease-recovery-execution\.md/);
  assert.match(entry, /^# 0008: Expired Lease Recovery Before Worker Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /executeExpiredLeaseRecovery/);
  assert.match(entry, /retryable timeout failures/);
  assert.match(entry, /dead letters/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records worker boundary progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0009-worker-boundary-before-live-providers.md', import.meta.url), 'utf8');

  assert.match(readme, /0009-worker-boundary-before-live-providers\.md/);
  assert.match(entry, /^# 0009: Worker Boundary Before Live Providers/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createRunnerWorker/);
  assert.match(entry, /RunnerExecutionError/);
  assert.match(entry, /AbortSignal/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records retry policy progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0010-retry-policy-before-provider-adapters.md', import.meta.url), 'utf8');

  assert.match(readme, /0010-retry-policy-before-provider-adapters\.md/);
  assert.match(entry, /^# 0010: Retry Policy Before Provider Adapters/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createExponentialRetryPolicy/);
  assert.match(entry, /retryPolicy/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records runner operational event progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0011-runner-operational-events.md', import.meta.url), 'utf8');

  assert.match(readme, /0011-runner-operational-events\.md/);
  assert.match(entry, /^# 0011: Runner Operational Events Before Provider Adapters/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /runner\.attempt\.succeeded/);
  assert.match(entry, /runner\.recovery\.orphaned-lease/);
  assert.match(entry, /listOperationalEventsForWorkflowRun/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records provider adapter contract progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0012-provider-adapter-contracts.md', import.meta.url), 'utf8');

  assert.match(readme, /0012-provider-adapter-contracts\.md/);
  assert.match(entry, /^# 0012: Provider Adapter Contracts Before Live Calls/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /ProviderAdapter/);
  assert.match(entry, /SecretReference/);
  assert.match(entry, /ExternalCallRecord/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records provider execution event progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0013-provider-execution-events.md', import.meta.url), 'utf8');

  assert.match(readme, /0013-provider-execution-events\.md/);
  assert.match(entry, /^# 0013: Provider Execution Events Before Live Providers/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /executeProviderAdapterWithEvents/);
  assert.match(entry, /ExternalCallRecord/);
  assert.match(entry, /external-call/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records runner daemon loop progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0014-runner-daemon-loop.md', import.meta.url), 'utf8');

  assert.match(readme, /0014-runner-daemon-loop\.md/);
  assert.match(entry, /^# 0014: Runner Daemon Loop Before Production Process Wiring/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createRunnerDaemon/);
  assert.match(entry, /AbortSignal/);
  assert.match(entry, /idleDelayMs/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records admin settings contract progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0015-admin-settings-contracts.md', import.meta.url), 'utf8');

  assert.match(readme, /0015-admin-settings-contracts\.md/);
  assert.match(entry, /^# 0015: Admin Settings Contracts Before Runtime Wiring/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseOpzavaAdminSettings/);
  assert.match(entry, /SecretReference/);
  assert.match(entry, /redactOpzavaAdminSettingsForAudit/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records admin settings persistence progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0016-admin-settings-persistence.md', import.meta.url), 'utf8');

  assert.match(readme, /0016-admin-settings-persistence\.md/);
  assert.match(entry, /^# 0016: Admin Settings Persistence Before Runtime Wiring/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createAdminSettingsRepository/);
  assert.match(entry, /admin\.settings\.updated/);
  assert.match(entry, /changedPaths/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records runtime settings projection progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0017-runtime-settings-projections.md', import.meta.url), 'utf8');

  assert.match(readme, /0017-runtime-settings-projections\.md/);
  assert.match(entry, /^# 0017: Runtime Settings Projections Before Runtime Wiring/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /projectRunnerDaemonOptions/);
  assert.match(entry, /projectRetryPolicyOptions/);
  assert.match(entry, /projectProviderAdapterDefaults/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records runtime settings loader progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0018-runtime-settings-loader.md', import.meta.url), 'utf8');

  assert.match(readme, /0018-runtime-settings-loader\.md/);
  assert.match(entry, /^# 0018: Runtime Settings Loader Before Runtime Wiring/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createRuntimeSettingsLoader/);
  assert.match(entry, /not_persisted/);
  assert.match(entry, /projectRuntimeOptions/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records runtime runner daemon construction progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0019-runtime-runner-daemon-construction.md', import.meta.url), 'utf8');

  assert.match(readme, /0019-runtime-runner-daemon-construction\.md/);
  assert.match(entry, /^# 0019: Runtime Runner Daemon Construction Before Process Startup/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createRuntimeRunnerDaemon/);
  assert.match(entry, /loadRuntimeSettings/);
  assert.match(entry, /createRunnerDaemon/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records provider request runtime defaults progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0020-provider-request-runtime-defaults.md', import.meta.url), 'utf8');

  assert.match(readme, /0020-provider-request-runtime-defaults\.md/);
  assert.match(entry, /^# 0020: Provider Request Runtime Defaults Before Live Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createRuntimeProviderAdapterRequest/);
  assert.match(entry, /loadRuntimeSettings/);
  assert.match(entry, /parseProviderAdapterRequest/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records provider credential resolution boundary progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0021-provider-credential-resolution-boundary.md', import.meta.url), 'utf8');

  assert.match(readme, /0021-provider-credential-resolution-boundary\.md/);
  assert.match(entry, /^# 0021: Provider Credential Resolution Boundary Before Live Providers/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /resolveProviderCredentialForRequest/);
  assert.match(entry, /SecretReference/);
  assert.match(entry, /SecretResolutionFailure/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records provider execution preflight progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0022-provider-execution-preflight.md', import.meta.url), 'utf8');

  assert.match(readme, /0022-provider-execution-preflight\.md/);
  assert.match(entry, /^# 0022: Provider Execution Preflight Before Adapter Calls/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createProviderExecutionPreflight/);
  assert.match(entry, /runtime-settings-unavailable/);
  assert.match(entry, /secret-resolution-failed/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records preflight failure operational event progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0023-preflight-failure-operational-events.md', import.meta.url), 'utf8');

  assert.match(readme, /0023-preflight-failure-operational-events\.md/);
  assert.match(entry, /^# 0023: Preflight Failure Operational Events Before Adapter Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createProviderPreflightFailureOperationalEvent/);
  assert.match(entry, /provider\.preflight\.blocked/);
  assert.match(entry, /redacted/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records mock-only provider execution progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0024-mock-only-provider-execution.md', import.meta.url), 'utf8');

  assert.match(readme, /0024-mock-only-provider-execution\.md/);
  assert.match(entry, /^# 0024: Mock-Only Provider Execution Before Live Provider Approval/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /executeMockProviderAfterPreflight/);
  assert.match(entry, /provider\.execution\.blocked\.live-profile/);
  assert.match(entry, /executeProviderAdapterWithEvents/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records provider execution approval guard progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0025-provider-execution-approval-guard.md', import.meta.url), 'utf8');

  assert.match(readme, /0025-provider-execution-approval-guard\.md/);
  assert.match(entry, /^# 0025: Provider Execution Approval Guard Before Live Adapter Enablement/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /evaluateProviderExecutionApproval/);
  assert.match(entry, /approval-missing/);
  assert.match(entry, /approval-target-mismatch/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records provider approval operational event progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0026-provider-approval-operational-events.md', import.meta.url), 'utf8');

  assert.match(readme, /0026-provider-approval-operational-events\.md/);
  assert.match(entry, /^# 0026: Provider Approval Operational Events Before Live Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createProviderExecutionApprovalOperationalEvent/);
  assert.match(entry, /provider\.execution\.approval\.denied/);
  assert.match(entry, /provider\.execution\.approval\.allowed/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records live provider approval guard progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0027-live-provider-approval-guard.md', import.meta.url), 'utf8');

  assert.match(readme, /0027-live-provider-approval-guard\.md/);
  assert.match(entry, /^# 0027: Live Provider Approval Guard Before Live Adapter Execution/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /guardLiveProviderExecutionAfterPreflight/);
  assert.match(entry, /provider\.execution\.approval\.allowed/);
  assert.match(entry, /live-execution-disabled/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records live provider execution boundary progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0028-live-provider-execution-boundary.md', import.meta.url), 'utf8');

  assert.match(readme, /0028-live-provider-execution-boundary\.md/);
  assert.match(entry, /^# 0028: Live Provider Execution Boundary With Idempotency/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /executeApprovedLiveProviderActionOnce/);
  assert.match(entry, /already-executed/);
  assert.match(entry, /idempotency/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records provider execution cost event progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0029-provider-execution-cost-events.md', import.meta.url), 'utf8');

  assert.match(readme, /0029-provider-execution-cost-events\.md/);
  assert.match(entry, /^# 0029: Provider Execution Cost Events Before Live Wiring/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createProviderExecutionCostOperationalEvent/);
  assert.match(entry, /CostEvent/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records provider execution audit event progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0030-provider-execution-audit-events.md', import.meta.url), 'utf8');

  assert.match(readme, /0030-provider-execution-audit-events\.md/);
  assert.match(entry, /^# 0030: Provider Execution Audit Events Before Live Wiring/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createProviderExecutionAuditOperationalEvent/);
  assert.match(entry, /provider\.execution\.recorded/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records live provider execution wiring progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0031-live-provider-execution-wiring.md', import.meta.url), 'utf8');

  assert.match(readme, /0031-live-provider-execution-wiring\.md/);
  assert.match(entry, /^# 0031: Wiring Approval To Live Execution Through The Idempotent Boundary/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /guardLiveProviderExecutionAfterPreflight/);
  assert.match(entry, /executeApprovedLiveProviderActionOnce/);
  assert.match(entry, /already-executed/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records executed action audit receipt progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0032-executed-action-audit-receipt.md', import.meta.url), 'utf8');

  assert.match(readme, /0032-executed-action-audit-receipt\.md/);
  assert.match(entry, /^# 0032: Executed Live Actions Emit Their Audit Receipt/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createProviderExecutionAuditOperationalEvent/);
  assert.match(entry, /provider\.execution\.recorded/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records external-call idempotency lookup progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0033-external-call-idempotency-lookup.md', import.meta.url), 'utf8');

  assert.match(readme, /0033-external-call-idempotency-lookup\.md/);
  assert.match(entry, /^# 0033: Backing The Idempotency Lookup With A Real Query/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createExternalCallIdempotencyLookup/);
  assert.match(entry, /json_extract/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records atomic idempotency reservation progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0034-atomic-idempotency-reservation.md', import.meta.url), 'utf8');

  assert.match(readme, /0034-atomic-idempotency-reservation\.md/);
  assert.match(entry, /^# 0034: Atomic Idempotency Reservation/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createExternalCallReservation/);
  assert.match(entry, /ON CONFLICT/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records reserve-before-execute wiring progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0035-reserve-before-execute.md', import.meta.url), 'utf8');

  assert.match(readme, /0035-reserve-before-execute\.md/);
  assert.match(entry, /^# 0035: Reserve Before Execute/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /executeApprovedLiveProviderActionOnce/);
  assert.match(entry, /reserved-elsewhere/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records reservation lifecycle on failure progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0036-reservation-lifecycle-on-failure.md', import.meta.url), 'utf8');

  assert.match(readme, /0036-reservation-lifecycle-on-failure\.md/);
  assert.match(entry, /^# 0036: Reservation Lifecycle On Failure/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /releaseExternalCall/);
  assert.match(entry, /poison/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records success-only idempotency lookup progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0037-lookup-ignores-failed-calls.md', import.meta.url), 'utf8');

  assert.match(readme, /0037-lookup-ignores-failed-calls\.md/);
  assert.match(entry, /^# 0037: The Lookup Only Counts Successes/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /json_extract/);
  assert.match(entry, /succeeded/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module idea intake progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0038-content-module-idea-intake.md', import.meta.url), 'utf8');

  assert.match(readme, /0038-content-module-idea-intake\.md/);
  assert.match(entry, /^# 0038: Content Module: Idea Intake Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseIdeaIntake/);
  assert.match(entry, /src\/opzava\/modules\/content\//);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module keyword research progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0039-content-keyword-research-contract.md', import.meta.url), 'utf8');

  assert.match(readme, /0039-content-keyword-research-contract\.md/);
  assert.match(entry, /^# 0039: Content Module: Keyword Research Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseKeywordResearch/);
  assert.match(entry, /lineage/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module source capture progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0040-content-source-capture-contract.md', import.meta.url), 'utf8');

  assert.match(readme, /0040-content-source-capture-contract\.md/);
  assert.match(entry, /^# 0040: Content Module: Source Capture Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseSourceCapture/);
  assert.match(entry, /provenance/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module seo brief progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0041-content-seo-brief-contract.md', import.meta.url), 'utf8');

  assert.match(readme, /0041-content-seo-brief-contract\.md/);
  assert.match(entry, /^# 0041: Content Module: SEO Brief Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseSeoBrief/);
  assert.match(entry, /lineage/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module outline progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0042-content-outline-contract.md', import.meta.url), 'utf8');

  assert.match(readme, /0042-content-outline-contract\.md/);
  assert.match(entry, /^# 0042: Content Module: Outline Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseOutline/);
  assert.match(entry, /lineage/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module fact-check report progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0044-content-fact-check-report-contract.md', import.meta.url), 'utf8');

  assert.match(readme, /0044-content-fact-check-report-contract\.md/);
  assert.match(entry, /^# 0044: Content Module: Fact-Check Report Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseFactCheckReport/);
  assert.match(entry, /supported/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module brand review progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0045-content-brand-review-contract.md', import.meta.url), 'utf8');

  assert.match(readme, /0045-content-brand-review-contract\.md/);
  assert.match(entry, /^# 0045: Content Module: Brand Review Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseBrandReview/);
  assert.match(entry, /voice/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module article draft progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0043-content-article-draft-contract.md', import.meta.url), 'utf8');

  assert.match(readme, /0043-content-article-draft-contract\.md/);
  assert.match(entry, /^# 0043: Content Module: Article Draft Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseArticleDraft/);
  assert.match(entry, /provenance/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module anti-slop review progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0046-content-anti-slop-review-contract.md', import.meta.url), 'utf8');

  assert.match(readme, /0046-content-anti-slop-review-contract\.md/);
  assert.match(entry, /^# 0046: Content Module: Anti-Slop Review Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseAntiSlopReview/);
  assert.match(entry, /slop/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content module wordpress draft request progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0047-content-wordpress-draft-request-contract.md', import.meta.url), 'utf8');

  assert.match(readme, /0047-content-wordpress-draft-request-contract\.md/);
  assert.match(entry, /^# 0047: Content Module: WordPress Draft Request Contract/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /parseWordpressDraftRequest/);
  assert.match(entry, /draft/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content workflow definition progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0048-content-workflow-definition.md', import.meta.url), 'utf8');

  assert.match(readme, /0048-content-workflow-definition\.md/);
  assert.match(entry, /^# 0048: Content Workflow Definition/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /getContentWorkflowDefinition/);
  assert.match(entry, /approval-gate/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content artifact envelope progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0049-content-artifact-envelope.md', import.meta.url), 'utf8');

  assert.match(readme, /0049-content-artifact-envelope\.md/);
  assert.match(entry, /^# 0049: Content Artifact Envelope/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /createContentArtifact/);
  assert.match(entry, /lineage/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

test('case study records content step outputs progress', async () => {
  const readme = await readFile(new URL('../docs/case-study/README.md', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../docs/case-study/0050-content-step-outputs.md', import.meta.url), 'utf8');

  assert.match(readme, /0050-content-step-outputs\.md/);
  assert.match(entry, /^# 0050: Content Step Outputs/m);
  assert.match(entry, /Status: Draft/);
  assert.match(entry, /Industry Counterfactual/);
  assert.match(entry, /getContentStepOutput/);
  assert.match(entry, /What We Refused To Fake/);
  assert.match(entry, /Evidence/);
  assert.match(entry, /Validation/);
  assert.match(entry, /Next Case Study Thread/);
});

