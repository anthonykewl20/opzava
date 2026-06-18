import { describe, it, expect, vi } from 'vitest'
import { createCampaignSendExecutor } from './campaign-send-executor'
import { type Job, type Attempt } from '@/opzava/platform/runner/contracts'
import { RunnerExecutionError } from '@/opzava/platform/runner/worker'

function makeJob(payload: unknown, jobId = 'job-1'): Job {
  return { jobId, payload } as unknown as Job
}

function makeAttempt(): Attempt {
  return {} as unknown as Attempt
}

const signal = new AbortController().signal

describe('createCampaignSendExecutor', () => {
  it('sends the email and reports the message id on success', async () => {
    const sender = vi.fn().mockResolvedValue({ ok: true, messageId: 'msg-1' })
    const onSent = vi.fn()
    const executor = createCampaignSendExecutor({ sender, onSent })
    await executor.execute(
      makeJob({ to: 'a@x.com', subject: 'Hi', html: '<p>h</p>' }),
      makeAttempt(),
      signal,
    )
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender).toHaveBeenCalledWith({ to: 'a@x.com', subject: 'Hi', html: '<p>h</p>' })
    expect(onSent).toHaveBeenCalledTimes(1)
    expect(onSent).toHaveBeenCalledWith({ jobId: 'job-1', to: 'a@x.com', messageId: 'msg-1' })
  })

  it('throws a provider-error when the send fails', async () => {
    const sender = vi.fn().mockResolvedValue({ ok: false, messageId: null })
    const executor = createCampaignSendExecutor({ sender })
    await expect(
      executor.execute(makeJob({ to: 'a@x.com', subject: 's', html: 'h' }), makeAttempt(), signal),
    ).rejects.toMatchObject({ name: 'RunnerExecutionError', errorClass: 'provider-error' })
    expect(sender).toHaveBeenCalledTimes(1)
  })

  it('throws a validation-error for a malformed payload and never calls the sender', async () => {
    const sender = vi.fn()
    const executor = createCampaignSendExecutor({ sender })
    let caught: unknown
    try {
      await executor.execute(makeJob({ to: 123, subject: 's' }, 'job-2'), makeAttempt(), signal)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(RunnerExecutionError)
    expect(caught).toMatchObject({ errorClass: 'validation-error' })
    expect(sender).not.toHaveBeenCalled()
  })
})
