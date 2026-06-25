import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Engine-boundary gate for ARD 0007 (finding F2):
// Opzava runs two SEPARATE orchestration engines that share one database and process but
// no orchestration code, status vocabulary, or agent model:
//   * Engine A (inherited operator console): `agents` table, src/lib/**
//   * Engine B (opzava canonical product engine): `opzava_agent_roles` table, src/opzava/modules/team/**
// The decision is "separate engines, unified surfaces" with a ONE-WAY bridge
// (opzava role -> inherited runtime identity). No code path may reference both.
//
// This gate statically asserts that one-way boundary so the intentional separation
// cannot silently erode. See docs/architecture/engine-boundary.md.

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const teamModuleDir = join(repoRoot, 'src/opzava/modules/team');
const libDir = join(repoRoot, 'src/lib');

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (entry.isFile()) {
      const dotIndex = entry.name.lastIndexOf('.');
      const extension = dotIndex >= 0 ? entry.name.slice(dotIndex) : '';
      if (sourceExtensions.has(extension)) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

// An ES `import ... from '<spec>'` or CommonJS `require('<spec>')` whose specifier
// resolves into src/lib — either the `@/lib` path alias or a relative path that
// climbs into a `lib/` segment (e.g. `../../../lib/...`).
function importsInheritedLib(source) {
  const fromAlias = /\bfrom\s+['"]@\/lib(?:\/|['"])/;
  const fromRelative = /\bfrom\s+['"](?:\.\.?\/)+lib(?:\/|['"])/;
  const requireAlias = /\brequire\(\s*['"]@\/lib(?:\/|['"])/;
  const requireRelative = /\brequire\(\s*['"](?:\.\.?\/)+lib(?:\/|['"])/;
  return (
    fromAlias.test(source) ||
    fromRelative.test(source) ||
    requireAlias.test(source) ||
    requireRelative.test(source)
  );
}

// An ES import or CommonJS require whose specifier is the opzava team module,
// via the `@/opzava/modules/team` alias or a relative path ending in opzava/modules/team.
function importsTeamModule(source) {
  const fromAlias = /\bfrom\s+['"]@\/opzava\/modules\/team(?:\/|['"])/;
  const fromRelative = /\bfrom\s+['"](?:\.\.?\/)+opzava\/modules\/team(?:\/|['"])/;
  const requireAlias = /\brequire\(\s*['"]@\/opzava\/modules\/team(?:\/|['"])/;
  const requireRelative = /\brequire\(\s*['"](?:\.\.?\/)+opzava\/modules\/team(?:\/|['"])/;
  return (
    fromAlias.test(source) ||
    fromRelative.test(source) ||
    requireAlias.test(source) ||
    requireRelative.test(source)
  );
}

// Any import/require of the opzava namespace from Engine A — alias (@/opzava/)
// or a relative climb into an opzava/ segment, in static `from`, dynamic
// import(), or require() form. ARD 0007 keeps the engines separate; only the
// sanctioned read/registration/maintenance seams below may cross A->B.
function importsOpzava(source) {
  const alias = /(?:from\s+|import\(\s*|require\(\s*)['"][^'"]*@\/opzava\//;
  const relative = /(?:from\s+|import\(\s*|require\(\s*)['"][^'"]*(?:\.\.\/)+opzava\//;
  return alias.test(source) || relative.test(source);
}

// The explicit, reviewed set of src/lib files permitted to import @/opzava.
// Each is a sanctioned Engine-A->Engine-B seam (read-only or coexistence):
//   - status-actions.ts: health-action provider-readiness (content resolvers + env secret resolver)
//   - logger.ts: log shipping into opzava observability
//   - db.ts: opzava runner migration registration + maintenance-boot bridge (ARD 0007 coexistence)
//   - auth.ts: device-token resolution (B1b) — resolveDeviceToken from core/auth, the fused
//     principal-binding seam so device tokens share one authz path with agent-scoped keys
// Adding a new crossing requires a deliberate entry here so the boundary stays machine-checkable.
const SANCTIONED_LIB_OPZAVA_IMPORTERS = new Set([
  'src/lib/status-actions.ts',
  'src/lib/logger.ts',
  'src/lib/db.ts',
  'src/lib/auth.ts',
]);

// SQL references to the inherited `agents` table. The word "agents" appears widely in
// prose, identifiers, and other table names (e.g. `opzava_agent_roles`), so we only flag
// it when it sits in a SQL clause position immediately after FROM / INTO / UPDATE / JOIN
// as a standalone token. `\bagents\b` will not match `opzava_agent_roles` (no trailing 's'
// on `agent`) nor `agent_runtimes`, etc.
function referencesInheritedAgentsTable(source) {
  return /\b(?:from|into|update|join)\s+agents\b/i.test(source);
}

function referencesOpzavaAgentRolesTable(source) {
  return /\bopzava_agent_roles\b/.test(source);
}

test('opzava team module (Engine B) does not reach into the inherited engine (Engine A)', async () => {
  const files = await collectSourceFiles(teamModuleDir);
  assert.ok(files.length > 0, 'expected source files under src/opzava/modules/team');

  const libImportViolations = [];
  const agentsTableViolations = [];
  let referencesOwnTable = false;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const rel = relative(repoRoot, file);

    if (importsInheritedLib(source)) {
      libImportViolations.push(rel);
    }
    if (referencesInheritedAgentsTable(source)) {
      agentsTableViolations.push(rel);
    }
    if (referencesOpzavaAgentRolesTable(source)) {
      referencesOwnTable = true;
    }
  }

  assert.deepEqual(
    libImportViolations,
    [],
    `team module must not import from src/lib (inherited Engine A); offenders: ${libImportViolations.join(', ')}`,
  );
  assert.deepEqual(
    agentsTableViolations,
    [],
    `team module must not reference the inherited \`agents\` SQL table; offenders: ${agentsTableViolations.join(', ')}`,
  );
  assert.ok(
    referencesOwnTable,
    'team module is expected to own the `opzava_agent_roles` table; none of its files reference it',
  );
});

test('inherited engine (Engine A, src/lib) does not reach into the opzava team module (Engine B)', async () => {
  const files = await collectSourceFiles(libDir);
  assert.ok(files.length > 0, 'expected source files under src/lib');

  const teamImportViolations = [];
  const opzavaRolesViolations = [];
  const unsanctionedOpzavaImports = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const rel = relative(repoRoot, file);

    if (importsTeamModule(source)) {
      teamImportViolations.push(rel);
    }
    if (referencesOpzavaAgentRolesTable(source)) {
      opzavaRolesViolations.push(rel);
    }
    // Any src/lib -> @/opzava crossing must be an explicitly sanctioned seam.
    if (importsOpzava(source) && !SANCTIONED_LIB_OPZAVA_IMPORTERS.has(rel)) {
      unsanctionedOpzavaImports.push(rel);
    }
  }

  assert.deepEqual(
    teamImportViolations,
    [],
    `src/lib must not import @/opzava/modules/team (inherited engine stays below the bridge); offenders: ${teamImportViolations.join(', ')}`,
  );
  assert.deepEqual(
    opzavaRolesViolations,
    [],
    `src/lib must not reference the \`opzava_agent_roles\` table (it belongs to Engine B); offenders: ${opzavaRolesViolations.join(', ')}`,
  );
  assert.deepEqual(
    unsanctionedOpzavaImports,
    [],
    `src/lib may import @/opzava only via the sanctioned seams (SANCTIONED_LIB_OPZAVA_IMPORTERS = status-actions, logger, db); unsanctioned offenders: ${unsanctionedOpzavaImports.join(', ')}`,
  );
});

test('engine-boundary doc records the one-way bridge and references ARD 0007', async () => {
  const doc = await readFile(new URL('../docs/architecture/engine-boundary.md', import.meta.url), 'utf8');

  assert.match(doc, /ARD 0007/);
  assert.match(doc, /opzava_agent_roles/);
  assert.match(doc, /\bagents\b/);
  assert.match(doc, /one-way/i);
  assert.match(doc, /role\s*(?:->|→)\s*runtime/i);
});
