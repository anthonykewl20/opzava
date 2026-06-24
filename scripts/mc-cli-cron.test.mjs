import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// mc-cli.cjs guards its main() behind require.main === module and exports `commands`,
// so requiring it does not launch the CLI (mirrors mc-mcp-server.cjs).
const { commands } = require('./mc-cli.cjs')

// E4: the CLI cron verbs must map to the /api/cron route's action vocabulary
// (add/toggle/trigger/remove). Previously they POSTed bodyFromFlags with no `action`
// and the route rejected every one with 400 "Invalid action".

test('cron list is a GET', () => {
  const r = commands.cron.list()
  assert.equal(r.method, 'GET')
  assert.equal(r.route, '/api/cron')
})

test('cron create/update map to action=add', () => {
  for (const verb of ['create', 'update']) {
    const r = commands.cron[verb]({ name: 'nightly' })
    assert.equal(r.method, 'POST')
    assert.equal(r.body.action, 'add', `${verb} should map to add`)
  }
})

test('cron pause/resume map to action=toggle', () => {
  for (const verb of ['pause', 'resume']) {
    const r = commands.cron[verb]({ name: 'nightly' })
    assert.equal(r.body.action, 'toggle', `${verb} should map to toggle`)
  }
})

test('cron run maps to action=trigger', () => {
  assert.equal(commands.cron.run({ name: 'nightly' }).body.action, 'trigger')
})

test('cron remove maps to action=remove', () => {
  assert.equal(commands.cron.remove({ name: 'nightly' }).body.action, 'remove')
})

test('the CLI action wins over any action flag in the body', () => {
  // action is spread first, then overridden — a stray --action flag cannot override
  // the verb's mapping.
  const r = commands.cron.create({ name: 'x', action: 'trigger' })
  assert.equal(r.body.action, 'add')
})
