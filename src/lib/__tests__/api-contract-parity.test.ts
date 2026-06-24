import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  collectOpenApiOperations,
  compareApiContractParity,
  extractHttpMethods,
  routeFileToApiPath,
  runApiContractParityCheck,
} from '@/lib/api-contract-parity'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('api-contract-parity helpers', () => {
  it('maps Next.js route files to OpenAPI-style API paths', () => {
    expect(routeFileToApiPath('src/app/api/agents/route.ts')).toBe('/api/agents')
    expect(routeFileToApiPath('src/app/api/tasks/[id]/route.ts')).toBe('/api/tasks/{id}')
    expect(routeFileToApiPath('src/app/api/files/[...slug]/route.ts')).toBe('/api/files/{slug}')
    expect(routeFileToApiPath('src/app/api/optional/[[...tail]]/route.ts')).toBe('/api/optional/{tail}')
  })

  it('extracts exported HTTP methods from route modules', () => {
    const source = `
      export const GET = async () => {}
      export const POST = async () => {}
      const internal = 'ignore me'
    `
    expect(extractHttpMethods(source).sort()).toEqual(['GET', 'POST'])
  })

  it('normalizes OpenAPI operations', () => {
    const operations = collectOpenApiOperations({
      paths: {
        '/api/tasks': { get: {}, post: {} },
        '/api/tasks/{id}': { delete: {}, patch: {} },
      },
    })
    expect(operations).toEqual([
      'DELETE /api/tasks/{id}',
      'GET /api/tasks',
      'PATCH /api/tasks/{id}',
      'POST /api/tasks',
    ])
  })

  it('reports mismatches with optional ignore list', () => {
    const report = compareApiContractParity({
      routeOperations: [
        { method: 'GET', path: '/api/tasks', sourceFile: 'a' },
        { method: 'POST', path: '/api/tasks', sourceFile: 'a' },
        { method: 'DELETE', path: '/api/tasks/{id}', sourceFile: 'b' },
      ],
      openapiOperations: ['GET /api/tasks', 'PATCH /api/tasks/{id}', 'DELETE /api/tasks/{id}'],
      ignore: ['PATCH /api/tasks/{id}'],
    })

    expect(report.missingInOpenApi).toEqual(['POST /api/tasks'])
    expect(report.missingInRoutes).toEqual([])
    expect(report.ignoredOperations).toEqual(['PATCH /api/tasks/{id}'])
  })

  it('detects a path-param rename between a route and its OpenAPI spec', () => {
    // SCR-8: route /api/agents/[agentId] normalizes to /api/agents/{agentId};
    // OpenAPI declares /api/agents/{id}. Same shape, different param name.
    // The literal-string check used to flag each as missing-in-the-other and
    // hide the real cause. The parity check must recognize the shape match and
    // fail explicitly on the param-name mismatch, naming both names.
    const report = compareApiContractParity({
      routeOperations: [
        { method: 'GET', path: '/api/agents/{agentId}', sourceFile: 'a' },
        { method: 'GET', path: '/api/tasks', sourceFile: 'b' },
      ],
      openapiOperations: ['GET /api/agents/{id}', 'GET /api/tasks'],
    })

    // Shape-matched renames must NOT be double-counted as missing in either set.
    expect(report.missingInOpenApi).toEqual([])
    expect(report.missingInRoutes).toEqual([])
    // The rename is surfaced explicitly with both param names.
    expect(report.paramMismatches).toEqual([
      {
        method: 'GET',
        path: '/api/agents/{agentId}',
        openapiPath: '/api/agents/{id}',
        routeParam: 'agentId',
        openapiParam: 'id',
      },
    ])
    expect(report.ok).toBe(false)
  })

  it('does not flag matching param names as a mismatch', () => {
    const report = compareApiContractParity({
      routeOperations: [{ method: 'GET', path: '/api/tasks/{id}/steps/{stepId}', sourceFile: 'a' }],
      openapiOperations: ['GET /api/tasks/{id}/steps/{stepId}'],
    })

    expect(report.paramMismatches).toEqual([])
    expect(report.missingInOpenApi).toEqual([])
    expect(report.missingInRoutes).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('does not shape-match paths with a different number of segments', () => {
    const report = compareApiContractParity({
      routeOperations: [{ method: 'GET', path: '/api/tasks/{id}', sourceFile: 'a' }],
      openapiOperations: ['GET /api/tasks/{id}/steps/{stepId}'],
    })

    expect(report.paramMismatches).toEqual([])
    expect(report.missingInOpenApi).toEqual(['GET /api/tasks/{id}'])
    expect(report.missingInRoutes).toEqual(['GET /api/tasks/{id}/steps/{stepId}'])
  })

  it('scans a project root and compares route operations to openapi', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-contract-'))
    tempDirs.push(root)

    const routeDir = path.join(root, 'src/app/api/tasks/[id]')
    fs.mkdirSync(routeDir, { recursive: true })
    fs.writeFileSync(path.join(root, 'src/app/api/tasks/route.ts'), 'export const GET = async () => {};\n', 'utf8')
    fs.writeFileSync(path.join(routeDir, 'route.ts'), 'export const DELETE = async () => {};\n', 'utf8')

    fs.writeFileSync(
      path.join(root, 'openapi.json'),
      JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/api/tasks': { get: {} },
          '/api/tasks/{id}': { delete: {}, patch: {} },
        },
      }),
      'utf8',
    )

    const report = runApiContractParityCheck({
      projectRoot: root,
      ignore: ['PATCH /api/tasks/{id}'],
    })

    expect(report.missingInOpenApi).toEqual([])
    expect(report.missingInRoutes).toEqual([])
    expect(report.ignoredOperations).toEqual(['PATCH /api/tasks/{id}'])
  })
})
