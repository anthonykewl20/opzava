import { describe, expect, it } from 'vitest'
import { buildCampaignSendJobs } from './campaign-send-jobs'

function plan() {
  return {
    campaignId: 'c1',
    sends: [
      {
        stepId: 's1',
        to: 'x@a.com',
        subject: 'Hi',
        html: '<p>1</p>',
        sendAt: '2026-06-17T00:00:00.000Z',
        idempotencyKey: 'campaign:c1:s1:x@a.com'
      },
      {
        stepId: 's2',
        to: 'x@a.com',
        subject: 'D2',
        html: '<p>2</p>',
        sendAt: '2026-06-18T00:00:00.000Z',
        idempotencyKey: 'campaign:c1:s2:x@a.com'
      }
    ]
  }
}

describe('buildCampaignSendJobs', () => {
  it('builds one queued job per planned send scheduled at its sendAt', () => {
    let n = 0
    const jobs = buildCampaignSendJobs(plan(), {
      workflowRunId: 'run',
      newId: () => `job_${++n}`
    })
    expect(jobs.length).toBe(2)
    expect(jobs[0].status).toBe('queued')
    expect(jobs[0].scheduledAt).toBe('2026-06-17T00:00:00.000Z')
    expect(jobs[1].scheduledAt).toBe('2026-06-18T00:00:00.000Z')
    expect(jobs[0].stepRunId).toBe('s1')
  })

  it('carries the per-send idempotency key and recipient payload', () => {
    let n = 0
    const jobs = buildCampaignSendJobs(plan(), {
      workflowRunId: 'run',
      newId: () => `job_${++n}`
    })
    expect(jobs[0].idempotencyKey).toBe('campaign:c1:s1:x@a.com')
    expect((jobs[0].payload as { to: string }).to).toBe('x@a.com')
  })

  it('starts each job queued with zero attempts', () => {
    let n = 0
    const jobs = buildCampaignSendJobs(plan(), {
      workflowRunId: 'run',
      newId: () => `job_${++n}`,
      maxAttempts: 5
    })
    expect(jobs[0].attemptCount).toBe(0)
    expect(jobs[0].maxAttempts).toBe(5)
    expect(jobs[0].lease).toBeNull()
  })
})
