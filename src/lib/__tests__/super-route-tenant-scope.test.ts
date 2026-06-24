import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * SEC-1: Every /api/super route that accepts or infers a tenant_id must assert
 * auth.user.tenant_id === target tenant_id and 403 otherwise. provision-job
 * GET-by-id must be scoped to the caller's tenant.
 *
 * These routes are mocked at the seam: requireRole (auth) is stubbed so the
 * caller's tenant_id is controlled, and the DB / super-admin helpers are
 * stubbed so we only assert the authorization decision (status code + that
 * privileged mutations are never reached cross-tenant).
 */

const requireRoleMock = vi.fn()
const listProvisionJobsMock = vi.fn()
const getProvisionJobMock = vi.fn()
const transitionProvisionJobStatusMock = vi.fn()
const createTenantDecommissionJobMock = vi.fn()
const prepareMock = vi.fn()

vi.mock('@/lib/auth', () => ({ requireRole: requireRoleMock }))
vi.mock('@/lib/super-admin', () => ({
  listProvisionJobs: listProvisionJobsMock,
  getProvisionJob: getProvisionJobMock,
  transitionProvisionJobStatus: transitionProvisionJobStatusMock,
  createTenantDecommissionJob: createTenantDecommissionJobMock,
}))
vi.mock('@/lib/db', () => ({
  getDatabase: vi.fn(() => ({ prepare: prepareMock })),
}))

function tenant1Admin() {
  return {
    user: {
      username: 'admin1',
      role: 'admin',
      tenant_id: 1,
      workspace_id: 1,
    },
  }
}

function tenant2Admin() {
  return {
    user: {
      username: 'admin2',
      role: 'admin',
      tenant_id: 2,
      workspace_id: 2,
    },
  }
}

describe('SEC-1 /api/super provision-jobs tenant scoping', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    listProvisionJobsMock.mockReturnValue({ jobs: [] })
  })

  describe('POST /api/super/provision-jobs', () => {
    function post(body: unknown) {
      return new NextRequest('http://localhost/api/super/provision-jobs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    it('403s when a tenant-1 admin POSTs {tenant_id:2}', async () => {
      requireRoleMock.mockReturnValue(tenant1Admin())
      // DB should never be consulted for the tenant lookup on a 403 path.
      prepareMock.mockImplementation(() => ({ get: vi.fn(() => ({ id: 2 })), run: vi.fn() }))

      const { POST } = await import('@/app/api/super/provision-jobs/route')
      const res = await POST(post({ tenant_id: 2, job_type: 'bootstrap' }))

      expect(res.status).toBe(403)
      // No insert may run cross-tenant.
      expect(prepareMock).not.toHaveBeenCalled()
    })

    it('allows a tenant-2 admin POSTing their own tenant_id', async () => {
      requireRoleMock.mockReturnValue(tenant2Admin())
      prepareMock.mockImplementation(() => ({ get: vi.fn(() => ({ id: 2 })), run: vi.fn(() => ({ lastInsertRowid: 9 })) }))

      const { POST } = await import('@/app/api/super/provision-jobs/route')
      const res = await POST(post({ tenant_id: 2, job_type: 'bootstrap' }))

      expect(res.status).toBe(201)
    })
  })

  describe('GET /api/super/provision-jobs', () => {
    it('403s when a tenant-1 admin requests ?tenant_id=2', async () => {
      requireRoleMock.mockReturnValue(tenant1Admin())

      const { GET } = await import('@/app/api/super/provision-jobs/route')
      const res = await GET(
        new NextRequest('http://localhost/api/super/provision-jobs?tenant_id=2'),
      )

      expect(res.status).toBe(403)
      // The privileged listing helper must not be invoked cross-tenant.
      expect(listProvisionJobsMock).not.toHaveBeenCalled()
    })

    it('scopes the listing to the caller tenant when no tenant_id is supplied', async () => {
      requireRoleMock.mockReturnValue(tenant1Admin())

      const { GET } = await import('@/app/api/super/provision-jobs/route')
      await GET(new NextRequest('http://localhost/api/super/provision-jobs'))

      expect(listProvisionJobsMock).toHaveBeenCalledTimes(1)
      const filterArg = listProvisionJobsMock.mock.calls[0][0]
      expect(filterArg.tenant_id).toBe(1)
    })

    it('allows listing when the caller owns the requested tenant_id', async () => {
      requireRoleMock.mockReturnValue(tenant2Admin())

      const { GET } = await import('@/app/api/super/provision-jobs/route')
      const res = await GET(
        new NextRequest('http://localhost/api/super/provision-jobs?tenant_id=2'),
      )

      expect(res.status).toBe(200)
      const filterArg = listProvisionJobsMock.mock.calls[0][0]
      expect(filterArg.tenant_id).toBe(2)
    })
  })
})

describe('SEC-1 /api/super/provision-jobs/[id] tenant scoping', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  describe('GET by id', () => {
    function ctx(id: string) {
      return { params: Promise.resolve({ id }) }
    }

    it('404s (scoped) when the job belongs to another tenant', async () => {
      requireRoleMock.mockReturnValue(tenant1Admin())
      getProvisionJobMock.mockReturnValue({ id: 7, tenant_id: 2 })

      const { GET } = await import('@/app/api/super/provision-jobs/[id]/route')
      const res = await GET(new NextRequest('http://localhost/api/super/provision-jobs/7'), ctx('7'))

      expect(res.status).toBe(404)
      expect(getProvisionJobMock).toHaveBeenCalledWith(7)
    })

    it('returns the job when it belongs to the caller tenant', async () => {
      requireRoleMock.mockReturnValue(tenant2Admin())
      getProvisionJobMock.mockReturnValue({ id: 7, tenant_id: 2, events: [] })

      const { GET } = await import('@/app/api/super/provision-jobs/[id]/route')
      const res = await GET(new NextRequest('http://localhost/api/super/provision-jobs/7'), ctx('7'))

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ job: { id: 7, tenant_id: 2, events: [] } })
    })
  })

  describe('POST (approve/reject/cancel)', () => {
    function ctx(id: string) {
      return { params: Promise.resolve({ id }) }
    }
    function postReq(id: string, action: string) {
      return new NextRequest(`http://localhost/api/super/provision-jobs/${id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
    }

    it('403s when the job belongs to another tenant', async () => {
      requireRoleMock.mockReturnValue(tenant1Admin())
      getProvisionJobMock.mockReturnValue({ id: 7, tenant_id: 2, status: 'queued' })

      const { POST } = await import('@/app/api/super/provision-jobs/[id]/route')
      const res = await POST(postReq('7', 'approve'), ctx('7'))

      expect(res.status).toBe(403)
      expect(transitionProvisionJobStatusMock).not.toHaveBeenCalled()
    })

    it('proceeds when the job belongs to the caller tenant', async () => {
      requireRoleMock.mockReturnValue(tenant2Admin())
      getProvisionJobMock.mockReturnValue({ id: 7, tenant_id: 2, status: 'queued' })
      transitionProvisionJobStatusMock.mockReturnValue({ id: 7, tenant_id: 2, status: 'approved' })

      const { POST } = await import('@/app/api/super/provision-jobs/[id]/route')
      const res = await POST(postReq('7', 'approve'), ctx('7'))

      expect(res.status).toBe(200)
      expect(transitionProvisionJobStatusMock).toHaveBeenCalledWith(7, 'admin2', 'approve', undefined)
    })
  })
})

describe('SEC-1 /api/super/tenants/[id]/decommission tenant scoping', () => {
  function ctx(id: string) {
    return { params: Promise.resolve({ id }) }
  }
  function postReq(id: string) {
    return new NextRequest(`http://localhost/api/super/tenants/${id}/decommission`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dry_run: true }),
    })
  }

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('403s when a tenant-1 admin targets tenant 2 via the path id', async () => {
    requireRoleMock.mockReturnValue(tenant1Admin())

    const { POST } = await import('@/app/api/super/tenants/[id]/decommission/route')
    const res = await POST(postReq('2'), ctx('2'))

    expect(res.status).toBe(403)
    expect(createTenantDecommissionJobMock).not.toHaveBeenCalled()
  })

  it('allows a tenant-2 admin to decommission their own tenant', async () => {
    requireRoleMock.mockReturnValue(tenant2Admin())
    createTenantDecommissionJobMock.mockReturnValue({ tenant: { id: 2 }, job: { id: 5 } })

    const { POST } = await import('@/app/api/super/tenants/[id]/decommission/route')
    const res = await POST(postReq('2'), ctx('2'))

    expect(res.status).toBe(201)
    expect(createTenantDecommissionJobMock).toHaveBeenCalledWith(2, expect.anything(), 'admin2')
  })
})
