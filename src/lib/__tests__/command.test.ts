import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock,
  },
}))

import { runCommand, runOpenClaw } from '@/lib/command'

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  stdin = {
    write: vi.fn(),
    end: vi.fn(),
  }
  kill = vi.fn()
}

describe('runCommand', () => {
  beforeEach(() => {
    spawnMock.mockReset()
    delete process.env.OPZAVA_ALLOW_HOST_OPENCLAW
  })

  it('refuses direct host OpenClaw command execution', async () => {
    await expect(runCommand('openclaw', ['gateway', 'status'])).rejects.toMatchObject({
      code: 'OPENCLAW_DOCKER_ONLY',
    })
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('resolves stdout/stderr on successful exit', async () => {
    const child = new FakeChild()
    spawnMock.mockReturnValue(child as any)

    const promise = runCommand('echo', ['ok'])
    child.stdout.emit('data', Buffer.from('hello'))
    child.stderr.emit('data', Buffer.from('warn'))
    child.emit('close', 0)

    await expect(promise).resolves.toEqual({ stdout: 'hello', stderr: 'warn', code: 0 })
  })

  it('refuses implicit host OpenClaw CLI execution', async () => {
    await expect(runOpenClaw(['gateway', 'status'])).rejects.toMatchObject({
      code: 'OPENCLAW_DOCKER_ONLY',
    })
    expect(spawnMock).not.toHaveBeenCalled()
  })
})
