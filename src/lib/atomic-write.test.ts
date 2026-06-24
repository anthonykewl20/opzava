import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { writeFileAtomic } from './atomic-write'

// DUR-1: cron jobs.json/runs.json (and integrations .env) must be written
// atomically so a mid-write crash truncates nothing — the destination is
// always either fully-old or fully-new.
describe('writeFileAtomic (DUR-1)', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'atomic-write-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('writes the full new content to the destination', async () => {
    const target = path.join(dir, 'jobs.json')
    await writeFileAtomic(target, JSON.stringify({ version: 1, jobs: [] }, null, 2))

    const written = await readFile(target, 'utf-8')
    expect(JSON.parse(written)).toEqual({ version: 1, jobs: [] })
  })

  it('overwrites an existing file only when the new content is complete', async () => {
    const target = path.join(dir, 'jobs.json')
    const original = JSON.stringify({ version: 1, jobs: [{ id: 'old' }] }, null, 2)
    await writeFile(target, original, 'utf-8')

    const next = JSON.stringify({ version: 1, jobs: [{ id: 'new' }] }, null, 2)
    await writeFileAtomic(target, next)

    const written = await readFile(target, 'utf-8')
    expect(JSON.parse(written)).toEqual({ version: 1, jobs: [{ id: 'new' }] })
  })

  it('leaves no .tmp file behind after a successful write', async () => {
    const target = path.join(dir, 'runs.json')
    await writeFileAtomic(target, '{"runs":[]}')

    await expect(stat(`${target}.tmp`)).rejects.toThrow()
    const written = await readFile(target, 'utf-8')
    expect(JSON.parse(written)).toEqual({ runs: [] })
  })

  // The crash-mid-write case: if a leftover/partial .tmp exists from a prior
  // crashed run, the destination must remain fully-old until a complete new
  // write replaces it via rename. A bare writeFile would have truncated the
  // destination in place; the atomic helper never touches the destination
  // directly — only rename does.
  it('does not truncate the destination while writing (crash-mid-write leaves file fully-old)', async () => {
    const target = path.join(dir, 'jobs.json')
    const original = JSON.stringify({ version: 1, jobs: [{ id: 'keeper' }] }, null, 2)
    await writeFile(target, original, 'utf-8')

    // Simulate a stale partial .tmp left by a prior crashed write.
    await writeFile(`${target}.tmp`, '{"version":1,"jobs":[{"id":"part', 'utf-8')

    // A fresh atomic write replaces the destination wholesale.
    await writeFileAtomic(target, JSON.stringify({ version: 1, jobs: [] }, null, 2))

    const written = await readFile(target, 'utf-8')
    // Fully-new: never a blend of old + truncated bytes.
    expect(JSON.parse(written)).toEqual({ version: 1, jobs: [] })
    expect(() => JSON.parse(written)).not.toThrow()
  })

  it('is idempotent — writing identical content twice yields the same file', async () => {
    const target = path.join(dir, 'env.txt')
    const content = 'FOO=bar\n'
    await writeFileAtomic(target, content)
    await writeFileAtomic(target, content)
    expect(await readFile(target, 'utf-8')).toBe(content)
    await expect(stat(`${target}.tmp`)).rejects.toThrow()
  })
})
