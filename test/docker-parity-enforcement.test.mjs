import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const forbiddenPrimaryCommands = [
  /\bpnpm\s+(?:run\s+)?dev\b/,
  /\bpnpm\s+(?:run\s+)?start(?::standalone)?\b/,
  /\bnext\s+dev\b/,
  /\bnext\s+start\b/,
  /\bnode\s+.*\.next\/standalone\b/,
];

const forbiddenPermissionSamples = new Map([
  [
    'pnpm dev',
    [
      'pnpm dev',
      'pnpm run dev',
      '/usr/local/bin/pnpm dev',
      'env PORT=3000 pnpm run dev',
    ],
  ],
  [
    'pnpm start',
    [
      'pnpm start',
      'pnpm run start',
      'pnpm start:standalone',
      'env PORT=3000 /usr/local/bin/pnpm start',
    ],
  ],
  [
    'next dev',
    [
      'next dev',
      'npx next dev',
      './node_modules/.bin/next dev',
      'env PORT=3000 next dev --hostname 127.0.0.1',
    ],
  ],
  [
    'next start',
    [
      'next start',
      'npx next start',
      './node_modules/.bin/next start',
      'env PORT=3000 next start --hostname 0.0.0.0',
    ],
  ],
  [
    'node .next/standalone',
    [
      'node .next/standalone/server.js',
      'node ./.next/standalone/server.js',
      'node /app/.next/standalone/server.js',
      'env PORT=3000 node --trace-warnings .next/standalone/server.js',
    ],
  ],
]);

const allowedDevToolSamples = [
  'pnpm build',
  'pnpm test',
  'pnpm lint',
  'pnpm typecheck',
  'pnpm test:e2e',
  'pnpm test:docker:dokploy',
  'make up dev',
  'make up parity',
  'docker compose up',
];

async function readRepoFile(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function extractCommandsBlock(source, file) {
  const commandsBlock = source.match(/^## Commands\s*\n+```(?:bash|text)?\n(?<commands>[\s\S]*?)^```/m);

  assert.ok(commandsBlock?.groups?.commands, `${file} must contain a primary ## Commands fenced block`);

  return commandsBlock.groups.commands;
}

function uncommentedCommandLines(commandsBlock) {
  return commandsBlock
    .split('\n')
    .map((line) => line.split('#')[0].trim())
    .filter(Boolean)
    .join('\n');
}

function bashMatcherPattern(entry) {
  const match = entry.match(/^Bash\((?<pattern>.*)\)$/);
  return match?.groups?.pattern ?? null;
}

function escapeRegExp(value) {
  return value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}

function wildcardPatternToRegExp(pattern) {
  const body = pattern
    .split('*')
    .map(escapeRegExp)
    .join('.*');

  return new RegExp(`^${body}$`);
}

function matchesBashPermission(entry, command) {
  const pattern = bashMatcherPattern(entry);

  if (!pattern) {
    return false;
  }

  const normalizedPattern = pattern.replace(/\s+/g, ' ').trim();
  const normalizedCommand = command.replace(/\s+/g, ' ').trim();

  return wildcardPatternToRegExp(normalizedPattern).test(normalizedCommand);
}

function uncommentedLines(source) {
  return source
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

function extractYamlBlock(source, headerPattern, file) {
  const lines = source.split('\n');
  const startIndex = lines.findIndex((line) => headerPattern.test(line));

  assert.notEqual(startIndex, -1, `${file} must contain ${headerPattern}`);

  const block = [lines[startIndex]];

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (/^(?:[A-Za-z0-9_-]+:|  [A-Za-z0-9_-]+:)\s*$/.test(line)) {
      break;
    }

    block.push(line);
  }

  return block.join('\n');
}

test('agent command blocks keep app-runtime on Docker commands', async () => {
  for (const file of ['CLAUDE.md', 'AGENTS.md']) {
    const source = await readRepoFile(file);
    const commands = uncommentedCommandLines(extractCommandsBlock(source, file));

    for (const commandPattern of forbiddenPrimaryCommands) {
      assert.doesNotMatch(
        commands,
        commandPattern,
        `${file} must not list ${commandPattern} as a primary runnable app command`,
      );
    }

    assert.match(commands, /\bmake\s+up\s+dev\b/, `${file} must document the Docker dev app-runtime lane`);
    assert.match(commands, /\bmake\s+up\s+parity\b/, `${file} must document the Docker parity app-runtime lane`);
  }
});

test('claude settings deny forbidden host app-runtime commands without denying dev-tooling', async () => {
  const settings = JSON.parse(await readRepoFile('.claude/settings.json'));
  const deny = settings.permissions?.deny;

  assert.ok(Array.isArray(deny), '.claude/settings.json must define permissions.deny');
  assert.ok(deny.every((entry) => typeof entry === 'string'), 'permissions.deny entries must be strings');

  const bashDenyEntries = deny.filter((entry) => bashMatcherPattern(entry));

  for (const [label, samples] of forbiddenPermissionSamples) {
    for (const sample of samples) {
      assert.ok(
        bashDenyEntries.some((entry) => matchesBashPermission(entry, sample)),
        `permissions.deny must block ${label} sample: ${sample}`,
      );
    }
  }

  for (const sample of allowedDevToolSamples) {
    assert.equal(
      bashDenyEntries.some((entry) => matchesBashPermission(entry, sample)),
      false,
      `permissions.deny must not block dev-tooling or Docker command: ${sample}`,
    );
  }
});

test('base compose owns singular OpenClaw gateway wiring with the node home mount', async () => {
  const compose = await readRepoFile('docker-compose.yml');
  const gatewayDefinitions = compose.match(/^  mc-openclaw-gateway:\s*$/gm) ?? [];

  assert.equal(gatewayDefinitions.length, 1, 'docker-compose.yml must define mc-openclaw-gateway exactly once');

  const gatewayBlock = uncommentedLines(
    extractYamlBlock(compose, /^  mc-openclaw-gateway:\s*$/, 'docker-compose.yml'),
  );

  assert.match(
    gatewayBlock,
    /^\s+-\s+openclaw-data:\/home\/node\/\.openclaw\s*$/m,
    'mc-openclaw-gateway must mount OpenClaw state at /home/node/.openclaw',
  );
  assert.doesNotMatch(
    gatewayBlock,
    /^\s+-\s+[^#\n]*\/root\/\.openclaw\b/m,
    'mc-openclaw-gateway must not mount OpenClaw state under /root',
  );
});

test('package runtime start scripts are poisoned with the Docker redirect', async () => {
  const packageJson = JSON.parse(await readRepoFile('package.json'));

  for (const scriptName of ['start', 'start:standalone']) {
    const script = packageJson.scripts?.[scriptName];

    assert.equal(typeof script, 'string', `package.json scripts.${scriptName} must exist`);
    assert.match(script, /make up parity/, `${scriptName} must redirect operators to the Docker app-runtime`);
    assert.match(script, /process\.exit\(\s*1\s*\)|exit\s+1/, `${scriptName} must exit non-zero`);
    assert.doesNotMatch(script, /\bnext\s+start\b/, `${scriptName} must not start a host Next server`);
    assert.doesNotMatch(script, /scripts\/start-standalone\.sh/, `${scriptName} must not call the standalone wrapper`);
    assert.doesNotMatch(script, /\bnode\s+.*\.next\/standalone\b/, `${scriptName} must not run bare standalone server`);
  }
});
