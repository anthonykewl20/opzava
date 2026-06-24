import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// The daemon/heartbeat scripts default `MISSION_CONTROL_URL` to
// `http://localhost:3000` in code, but their `--help` text historically
// advertised port 3005. A user reading the help would then point their
// browser/curl at the wrong port. This guard pins the help-text default to
// match the code default so the drift cannot silently return.

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = [
  join(__dirname, '..', 'scripts', 'notification-daemon.sh'),
  join(__dirname, '..', 'scripts', 'agent-heartbeat.sh'),
];

async function read(path) {
  return readFile(path, 'utf8');
}

test('help text never advertises port 3005 (code defaults to 3000)', async () => {
  for (const script of SCRIPTS) {
    const src = await read(script);
    assert.doesNotMatch(
      src,
      /localhost:3005/,
      `${script}: help text advertises localhost:3005 but the code default is localhost:3000 — fix the help string`,
    );
  }
});

test('each daemon script documents the matching code default (localhost:3000)', async () => {
  for (const script of SCRIPTS) {
    const src = await read(script);
    // Both the runtime default assignment and the help blurb must agree on 3000.
    assert.match(
      src,
      /localhost:3000/,
      `${script}: expected the documented/default Opzava base URL to be localhost:3000`,
    );
  }
});
