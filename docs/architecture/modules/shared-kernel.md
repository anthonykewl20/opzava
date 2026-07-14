# packages/shared-kernel - shared value primitives
> Part of the Opzava architecture (see ../README.md). Vocabulary: codebase-design.

## Overview
`@opzava/shared-kernel` is the lowest Opzava-owned layer: zero Opzava-runtime dependencies, consumed by every ports module and every concrete adapter.
It owns the canonical branded identifiers (`TenantId`, `OrgId`, `WorkspaceId`, `ProjectId`, `UserId`, `AgentEmployeeId`, `TaskId`), the `Money` value object, the `OpaqueExternalRef` shape, the `DomainError`/`Result` failure primitives, and the `Clock` seam.
Its key invariant is that every value type is constructible only through a validating factory, so any unvalidated primitive crossing a port signature is a type error, not a runtime hope.
This package is what makes the ports layer small: by concentrating identity, money, and failure semantics here, each port interface stays a thin typed surface.

## Modules

### shared-kernel barrel - `packages/shared-kernel/src/index.ts`
- **Interface (the seam):** five `export *` re-exports from `ids`, `money`, `refs`, `result`, and `time` at `packages/shared-kernel/src/index.ts:1-5`.
  The seam is the single import path `@opzava/shared-kernel`; the package `exports` map resolves `types` to `./src/index.ts` and `default` to `./dist/index.js` at `packages/shared-kernel/package.json:9-13`, so consumers type-check against source and run against the built bundle.
  No ordering, invariants, or error modes are introduced here.
- **Behind the seam (implementation):** none.
  The file is pure redirection; all behavior lives in the five child modules.
- **Adapters:** n/a (barrel, not a port).
  It is the canonical entry for the whole package, so the five child modules are the implicit export surface.
- **Depth:** shallow.
  Deletion test: deleting this file moves the import path, it does not concentrate or remove complexity.
  Callers would import each child directly.
- **Seams:** external seam is the package `exports` map; no internal seams beyond the five children.
  Coupling is total in the trivial sense: every child symbol passes through here.
- **Testing through the interface:** the test file imports through the barrel at `packages/shared-kernel/test/shared-kernel.test.ts:3-11`, so the barrel is exercised by every test even though it has no behavior of its own.
  No gap specific to this file.
- **Deepening opportunity:** none - already shallow by design.
  A barrel that hides five child modules behind one import is the intended shape; deepening would mean merging children, which would remove a useful navigation seam.

### ids - `packages/shared-kernel/src/ids/index.ts`
- **Interface (the seam):** seven branded opaque id types `TenantId`, `OrgId`, `WorkspaceId`, `ProjectId`, `UserId`, `AgentEmployeeId`, `TaskId` at `packages/shared-kernel/src/ids/index.ts:11-17`, plus a `make*` and `parse*` function per type at `packages/shared-kernel/src/ids/index.ts:47-101`.
  Invariant: a value is only assignable to an id type if it passed the shared regex `/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,127}$/` at `packages/shared-kernel/src/ids/index.ts:19` (alphanumeric first char, 2 to 128 chars total, only letters, digits, underscore, hyphen).
  Error mode: `make*` throws `DomainError` on invalid input; `parse*` returns `Result` with `code: "sharedKernel.invalidId"` at `packages/shared-kernel/src/ids/index.ts:21-27`.
  The throwing `make*` delegates to the `Result`-returning `parse*` and re-throws the error at `packages/shared-kernel/src/ids/index.ts:29-37`, so the two conventions are not duplicated logic.
- **Behind the seam (implementation):** branding is type-level only via `declare const ...Brand: unique symbol` at `packages/shared-kernel/src/ids/index.ts:3-9`, so the runtime value is an unboxed string with no allocation overhead.
  The whole surface (7 types, 14 functions) collapses onto two private helpers, `makeOpaqueId` and `parseOpaqueId` at `packages/shared-kernel/src/ids/index.ts:29-45`, which carry the only real validation logic.
  The per-type functions are one-line specializations that supply the type name.
- **Adapters:** n/a (value-object module, not a port).
  It is consumed directly by the ports layer: `AuthorizationPort` imports `OrgId, ProjectId, TenantId, UserId, WorkspaceId` at `packages/ports/src/authorization.ts:1`, `AuthPort` imports `OrgId, TenantId, UserId` at `packages/ports/src/auth.ts:1`, and `RealtimeTransportPort`, `OpenClawGatewayPort`, `ErrorCapturePort` import the same set at their first lines (verified by grep).
- **Depth:** deep.
  Deletion test: deleting this module would force every consumer to re-implement the regex, the brand phantom types, the throw/parse split, and the error wrapping for seven id types.
  The interface (two functions per type) is far smaller than the validation, branding, and failure-mapping behavior it guards.
- **Seams:** external seam is the typed id value plus the `make`/`parse` pair; internal seam is the two private helpers shared across all seven types.
  Coupling note: every id type shares one validation shape and one error `code`, so domain-specific id rules (for example a length difference between `TaskId` and `TenantId`) cannot be expressed here without forking the helpers.
- **Testing through the interface:** `packages/shared-kernel/test/shared-kernel.test.ts:13-23` exercises `makeTenantId`, `parseTenantId`, and `parseTaskId` on the happy path, the empty string, and a `/`-containing malformed value.
  Gaps: only two of seven id types are directly exercised, and the boundary cases (exactly 1 char, exactly 128 chars, 129 chars, leading underscore, leading hyphen) are not asserted.
- **Deepening opportunity:** none at the module level - already deep.
  One narrow improvement: the error `code` is shared across all seven types at `packages/shared-kernel/src/ids/index.ts:23`, but `details.name` already records which type failed at `packages/shared-kernel/src/ids/index.ts:25`, so callers branching on failure can recover the type only by inspecting `details`, not by switching on `code`.

### money - `packages/shared-kernel/src/money/index.ts`
- **Interface (the seam):** the `Money` class at `packages/shared-kernel/src/money/index.ts:26-92`, the `MoneyInput` shape at `packages/shared-kernel/src/money/index.ts:5-8`, and the branded `CurrencyCode` at `packages/shared-kernel/src/money/index.ts:3`.
  Static factories: `Money.create(input)` at `packages/shared-kernel/src/money/index.ts:35-48` and `Money.zero(currency)` at `packages/shared-kernel/src/money/index.ts:50-52`.
  Methods: `add`, `subtract` at `packages/shared-kernel/src/money/index.ts:54-70`, `equals` at `packages/shared-kernel/src/money/index.ts:72-74`, `toJSON` at `packages/shared-kernel/src/money/index.ts:76-81`.
  Invariants: `amountMinor` must be a `Number.isSafeInteger` at `packages/shared-kernel/src/money/index.ts:36`; `currency` must match `/^[A-Z]{3}$/` after `trim().toUpperCase()` at `packages/shared-kernel/src/money/index.ts:12-24`; arithmetic is only allowed between same-currency values at `packages/shared-kernel/src/money/index.ts:83-91`.
  Error modes are distinct codes per failure: `sharedKernel.invalidMoneyAmount`, `sharedKernel.invalidCurrency`, `sharedKernel.currencyMismatch` at `packages/shared-kernel/src/money/index.ts:17,37,85`.
  Every factory and arithmetic method throws `DomainError`; there is no `Result`-returning constructor.
- **Behind the seam (implementation):** the constructor is `private` at `packages/shared-kernel/src/money/index.ts:30`, so the only way to obtain a `Money` is through `create` or `zero`, which always run the integer and currency checks.
  `add` and `subtract` route back through `Money.create` at `packages/shared-kernel/src/money/index.ts:57,66`, so the safe-integer invariant is re-validated on the result and a sum that overflows the safe-integer range would throw `sharedKernel.invalidMoneyAmount` rather than silently corrupt.
  The `CurrencyCode` brand is applied only inside `makeCurrencyCode` at `packages/shared-kernel/src/money/index.ts:23`, so callers cannot construct a `CurrencyCode` without passing the regex.
  `equals` short-circuits with direct field comparison and does not re-validate, which is safe because both operands are already invariants-checked `Money` instances.
- **Adapters:** n/a (value-object module, not a port).
  No port in the authoritative map consumes `Money` directly, so its blast radius is limited to application code that handles amounts (unverified - no grep hit in `packages/ports`).
- **Depth:** deep.
  Deletion test: deleting this module would push currency normalization, integer discipline, currency-mismatch protection, and the overflow re-check into every call site, and the private-constraint guarantee would be lost.
  The public API is tiny relative to the invariants it enforces.
- **Seams:** external seam is the `Money` class; internal seam is the private `makeCurrencyCode` helper and the private constructor.
  Coupling note: `Money` depends only on `DomainError` at `packages/shared-kernel/src/money/index.ts:1`, so it has no kernel-internal coupling beyond `result`.
- **Testing through the interface:** `packages/shared-kernel/test/shared-kernel.test.ts:25-42` covers currency normalization (`"usd"` to `"USD"`), same-currency addition, fractional-minor rejection, and currency-mismatch rejection.
  Gaps: `subtract`, `equals`, `zero`, `toJSON` round-trip, and the safe-integer overflow re-validation path through `add`/`subtract` are not asserted.
- **Deepening opportunity:** add a `Result`-returning factory (for example `Money.parse(input)`) to match the `make`/`parse` convention that `ids` and `refs` use.
  Today every construction path throws at `packages/shared-kernel/src/money/index.ts:35-48`, so any caller building `Money` from untrusted input must wrap `create` in `try`/`catch` and re-wrap into a `Result` by hand, which is exactly the shallow call-site behavior a deep factory would absorb.

### refs - `packages/shared-kernel/src/refs/index.ts`
- **Interface (the seam):** `OpaqueExternalRefInput` and `OpaqueExternalRef` at `packages/shared-kernel/src/refs/index.ts:3-13`, plus `makeOpaqueExternalRef(input)` at `packages/shared-kernel/src/refs/index.ts:29-35` and `parseOpaqueExternalRef(input: unknown)` at `packages/shared-kernel/src/refs/index.ts:37-77`.
  Invariant: `system`, `kind`, and `value` must each be non-empty after `trim()` at `packages/shared-kernel/src/refs/index.ts:15-27`.
  Error mode: `make` throws `DomainError` with `code: "sharedKernel.invalidOpaqueExternalRef"` on any empty part; `parse` returns `Result` and additionally rejects non-object, missing-key, or non-string inputs at `packages/shared-kernel/src/refs/index.ts:38-66`.
  Ordering: `parse` narrows structure first, then delegates to `make` for content validation and catches `DomainError` to fold it into the `Result` at `packages/shared-kernel/src/refs/index.ts:68-76`, re-throwing anything that is not a `DomainError`.
- **Behind the seam (implementation):** `normalizePart` is the single private helper at `packages/shared-kernel/src/refs/index.ts:15-27` and is the only place the non-empty rule lives.
  Validation is weaker than `ids`: there is no character-class or length cap, so a `value` of arbitrary length or content passes as long as it is non-empty after trim.
- **Adapters:** n/a (value-object module, not a port).
  It is consumed by `OpenClawGatewayPort`, which imports `OpaqueExternalRef` at `packages/ports/src/openclaw-gateway.ts:2`, so it is the kernel's bridge to external-system identity (GitHub refs, OpenClaw session refs). (`EventBusPort` was the other consumer until it was deleted in #160.)
- **Depth:** moderate.
  Deletion test: deleting this module would move trim-and-non-empty validation and the structural-narrowing parse into the two port consumers, which is a real but small amount of behavior.
  The interface is short and the implementation is nearly as simple, so it does not meet the deep bar set by `ids` or `money`.
- **Seams:** external seam is the `OpaqueExternalRef` shape plus the make/parse pair; internal seam is `normalizePart`.
  Coupling note: `OpaqueExternalRefInput` at `packages/shared-kernel/src/refs/index.ts:3-7` is structurally identical to `OpaqueExternalRef` at `packages/shared-kernel/src/refs/index.ts:9-13`, so the Input type carries no information the output type does not.
- **Testing through the interface:** `packages/shared-kernel/test/shared-kernel.test.ts:44-61` covers the happy `make` and the empty-`kind` throw.
  Gaps: `parseOpaqueExternalRef` is not tested at all; the non-object, missing-key, and non-string branches at `packages/shared-kernel/src/refs/index.ts:38-66` have no coverage.
- **Deepening opportunity:** split the validation discipline.
  Today `refs` only checks non-empty at `packages/shared-kernel/src/refs/index.ts:18`, while `ids` enforces a strict regex and a 128-char cap at `packages/shared-kernel/src/ids/index.ts:19`.
  Because `OpaqueExternalRef.value` is what ports like `OpenClawGatewayPort` use to key external sessions, a length cap and character policy here would deepen the module and close a naive overlong-or-control-character input path.

### result - `packages/shared-kernel/src/result/index.ts`
- **Interface (the seam):** `ErrorCode` at `packages/shared-kernel/src/result/index.ts:1`, `DomainErrorOptions` at `packages/shared-kernel/src/result/index.ts:3-8`, the `DomainError` class at `packages/shared-kernel/src/result/index.ts:10-20`, the `Ok<T>` and `Err<E>` shapes at `packages/shared-kernel/src/result/index.ts:22-30`, the `Result<T, E>` union at `packages/shared-kernel/src/result/index.ts:32`, and the `ok`/`err` helpers at `packages/shared-kernel/src/result/index.ts:34-40`.
  Invariant: a `Result` is a discriminated union on the boolean `ok` field; success carries `value`, failure carries `error: DomainError`.
  `DomainError` extends `Error`, carries `code` and readonly `details`, and forwards `cause` to the base `Error` at `packages/shared-kernel/src/result/index.ts:14-19`.
  Error mode: no runtime failure path of its own; it is the failure vocabulary the rest of the kernel and every port speaks.
- **Behind the seam (implementation):** almost nothing.
  `ok` and `err` are object literals at `packages/shared-kernel/src/result/index.ts:34-40`; `DomainError` only assigns fields.
  The depth comes from the convention this tiny surface encodes, not from lines of code.
  Note: `ErrorCode` is `${string}.${string} | string` at `packages/shared-kernel/src/result/index.ts:1`, so the dotted `namespace.reason` convention is a hint, not a compile-time guarantee; any string is still a valid `ErrorCode`.
- **Adapters:** n/a (kernel primitive, not a port).
  It is the single most-depended-on module in the inventory: every ports module imports `Result`, and several import `DomainError`-adjacent ids (verified by grep across `packages/ports/src/*.ts`, every file's first two import lines pull from `@opzava/shared-kernel`).
  The authoritative seam map shows the real-seam ports `ConnectionsProvisioningPort`, `AuthorizationPort`, `ObjectStorePort`, and `OpenClawGatewayPort` all rely on `Result`.
- **Depth:** deep.
  Deletion test: deleting this module would force every port and adapter to pick its own error and result shape, fragmenting the one failure convention the codebase shares.
  The interface is a few dozen lines; the blast radius is the whole monorepo.
- **Seams:** external seam is the `Result`/`DomainError` pair plus the two helpers; no internal seams.
  Coupling note: this is the most reused shared primitive in the inventory, so any change here has the widest blast radius of any kernel module.
- **Testing through the interface:** `packages/shared-kernel/test/shared-kernel.test.ts:63-65` asserts only that `ok("ready")` returns `{ ok: true, value: "ready" }`.
  Gaps: `err`, `DomainError` field assignment, `cause` forwarding, and the `Err` discriminant are not asserted.
- **Deepening opportunity:** none - already deep.
  One narrow note: tightening `ErrorCode` to `${string}.${string}` at `packages/shared-kernel/src/result/index.ts:1` would make the dotted convention enforceable, but is unverified safe because existing call sites may pass non-dotted strings (no grep exhaustively confirms otherwise).

### time - `packages/shared-kernel/src/time/index.ts`
- **Interface (the seam):** the `Clock` interface with a single method `now(): Date` at `packages/shared-kernel/src/time/index.ts:1-3`, and the default `systemClock` adapter at `packages/shared-kernel/src/time/index.ts:5-9`.
  Invariant: `now()` returns a fresh `Date` for the current wall clock.
  No ordering or error modes.
- **Behind the seam (implementation):** `systemClock.now` constructs `new Date()` at `packages/shared-kernel/src/time/index.ts:7`.
  There is no other behavior.
- **Adapters:** n/a per the inventory (one default adapter, no separate concrete adapter found).
  `systemClock` satisfies `Clock` structurally at `packages/shared-kernel/src/time/index.ts:5`, so by the "one adapter = hypothetical seam" rule this is a hypothetical seam: a test-injection point that has not yet accumulated a second implementation.
- **Depth:** shallow.
  Deletion test: deleting this module would move `new Date()` inline at call sites, which is a move, not a concentration of complexity.
  The interface is one method and the implementation is one line.
- **Seams:** external seam is the `Clock` interface; the only implementation is `systemClock`.
  Coupling note: the module has no kernel-internal dependencies and no `result` dependency.
- **Testing through the interface:** no tests.
  The test file at `packages/shared-kernel/test/shared-kernel.test.ts` does not import `Clock` or `systemClock`, matching the inventory's "Tests: none found".
  The interface is the test surface: a fake `Clock` is the natural seam for time-sensitive application tests, but none exists in this package.
- **Deepening opportunity:** none - intentionally minimal.
  The value of this module is the seam it offers for deterministic time in tests, not behavior; depth will arrive when a real second adapter (for example a frozen or logical clock) is added.

## Cross-cutting notes
- Depth heat: deep modules are `ids`, `money`, and `result`; moderate is `refs`; shallow are the barrel and `time`.
  The kernel leans deep where it carries invariants (`ids`, `money`) or convention (`result`), and shallow where it only offers a redirection or a one-method seam.
- Shared coupling and blast radius: `result` is the load-bearing dependency.
  `ids` and `refs` both import `DomainError`, `err`, `ok`, and `Result` from `result` at `packages/shared-kernel/src/ids/index.ts:1` and `packages/shared-kernel/src/refs/index.ts:1`, and `money` imports `DomainError` at `packages/shared-kernel/src/money/index.ts:1`.
  Upstream, every `packages/ports/src/*.ts` file imports `Result`, and the real-seam ports `ConnectionsProvisioningPort`, `AuthorizationPort`, `ObjectStorePort`, and `OpenClawGatewayPort` all transitively depend on this module.
  A breaking change to `result` is the single highest-blast-radius change in the kernel.
- Two error-handling conventions: `ids` and `refs` expose both a throwing `make*` and a `Result`-returning `parse*`, where `make` delegates to `parse` and re-throws (`packages/shared-kernel/src/ids/index.ts:29-37`, `packages/shared-kernel/src/refs/index.ts:68-76`).
  `money` exposes only a throwing `create` at `packages/shared-kernel/src/money/index.ts:35-48`, so the kernel is internally inconsistent about the throw-vs-Result split.
- Error-code granularity is uneven: `money` emits distinct codes per failure (`packages/shared-kernel/src/money/index.ts:17,37,85`), while `ids` uses one shared code with the type name in `details` (`packages/shared-kernel/src/ids/index.ts:23-25`) and `refs` uses one shared code for both structural and content failures (`packages/shared-kernel/src/refs/index.ts:21,47,62`).
  Callers that branch on `code` cannot distinguish failure causes uniformly across the kernel.
- Validation discipline diverges: `ids` enforces a regex and a 128-char cap (`packages/shared-kernel/src/ids/index.ts:19`), while `refs` enforces only non-empty after trim (`packages/shared-kernel/src/refs/index.ts:18`), even though both feed port signatures and `refs.value` keys external sessions in `OpenClawGatewayPort`.
- Patterns observed: agnostic-ports is enabled by this kernel, because every port stays small only by leaning on kernel primitives for identity, money, and failure.
  The private-constructor-plus-validating-factory pattern in `money` at `packages/shared-kernel/src/money/index.ts:30,35` is the cleanest example in the package of the deletion-test-favored deep shape.
  No RLS, projections, tool-policy, or two-token logic belongs in this layer, and none is present.
- Friction clusters: the `refs` module is the weakest module by depth, test coverage (the `parse` branch is untested), and validation discipline, and it sits under two real/hot-path ports, so it is the most actionable cluster.
  The throw-only `money` factory is a smaller, localized inconsistency against the `ids`/`refs` convention.

## File map
- `packages/shared-kernel/src/index.ts` - barrel re-exporting the five child modules as `@opzava/shared-kernel`.
- `packages/shared-kernel/src/ids/index.ts` - seven branded opaque id types with shared `make`/`parse` factories.
- `packages/shared-kernel/src/money/index.ts` - `Money` value object with private constructor, currency normalization, and invariant-checked arithmetic.
- `packages/shared-kernel/src/refs/index.ts` - `OpaqueExternalRef` shape with make/parse and non-empty validation.
- `packages/shared-kernel/src/result/index.ts` - `DomainError`, `Result`, and `ok`/`err` failure primitives used by every port.
- `packages/shared-kernel/src/time/index.ts` - `Clock` seam and `systemClock` default adapter.
- `packages/shared-kernel/test/shared-kernel.test.ts` - single vitest file covering ids, money, refs, and result (not time).
- `packages/shared-kernel/package.json` - package exports mapping `types` to source and `default` to `dist`.
