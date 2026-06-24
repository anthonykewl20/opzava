import * as fs from 'node:fs'
import * as path from 'node:path'

export type ContractOperation = string

export interface RouteOperation {
  method: string
  path: string
  sourceFile: string
}

export interface ParamMismatch {
  method: string
  path: string
  openapiPath: string
  routeParam: string
  openapiParam: string
}

export interface ParityReport {
  ok: boolean
  routeOperations: ContractOperation[]
  openapiOperations: ContractOperation[]
  missingInOpenApi: ContractOperation[]
  missingInRoutes: ContractOperation[]
  paramMismatches: ParamMismatch[]
  ignoredOperations: ContractOperation[]
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'] as const

function toPosix(input: string): string {
  return input.split(path.sep).join('/')
}

function normalizeSegment(segment: string): string {
  if (segment.startsWith('[[...') && segment.endsWith(']]')) {
    return `{${segment.slice(5, -2)}}`
  }
  if (segment.startsWith('[...') && segment.endsWith(']')) {
    return `{${segment.slice(4, -1)}}`
  }
  if (segment.startsWith('[') && segment.endsWith(']')) {
    return `{${segment.slice(1, -1)}}`
  }
  return segment
}

export function routeFileToApiPath(routeFile: string, apiRoot = 'src/app/api'): string {
  const normalizedFile = toPosix(routeFile)
  const normalizedRoot = toPosix(apiRoot)
  const routeWithoutExt = normalizedFile.replace(/\/route\.tsx?$/, '')
  const relative = routeWithoutExt.startsWith(normalizedRoot)
    ? routeWithoutExt.slice(normalizedRoot.length)
    : routeWithoutExt

  const segments = relative
    .split('/')
    .filter(Boolean)
    .map(normalizeSegment)

  return `/api${segments.length ? `/${segments.join('/')}` : ''}`
}

export function extractHttpMethods(source: string): string[] {
  const methods = new Set<string>()
  for (const method of HTTP_METHODS) {
    const constExport = new RegExp(`export\\s+const\\s+${method}\\s*=`, 'm')
    const fnExport = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`, 'm')
    if (constExport.test(source) || fnExport.test(source)) methods.add(method)
  }
  return Array.from(methods)
}

function walkRouteFiles(dir: string, found: string[] = []): string[] {
  if (!fs.existsSync(dir)) return found
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkRouteFiles(fullPath, found)
    } else if (entry.isFile() && /route\.tsx?$/.test(entry.name)) {
      found.push(fullPath)
    }
  }
  return found
}

export function collectRouteOperations(projectRoot: string): RouteOperation[] {
  const apiRoot = path.join(projectRoot, 'src', 'app', 'api')
  const routeFiles = walkRouteFiles(apiRoot)

  const operations: RouteOperation[] = []
  for (const file of routeFiles) {
    const source = fs.readFileSync(file, 'utf8')
    const methods = extractHttpMethods(source)
    const apiPath = routeFileToApiPath(toPosix(path.relative(projectRoot, file)))
    for (const method of methods) {
      operations.push({ method, path: apiPath, sourceFile: file })
    }
  }

  return operations
}

export function collectOpenApiOperations(openapi: any): ContractOperation[] {
  const operations = new Set<ContractOperation>()
  const paths = openapi?.paths ?? {}
  for (const [rawPath, pathItem] of Object.entries(paths)) {
    const normalizedPath = String(rawPath)
    for (const method of Object.keys(pathItem as Record<string, unknown>)) {
      const upper = method.toUpperCase()
      if ((HTTP_METHODS as readonly string[]).includes(upper)) {
        operations.add(`${upper} ${normalizedPath}`)
      }
    }
  }
  return Array.from(operations).sort()
}

function toContractOperation(method: string, apiPath: string): ContractOperation {
  return `${method.toUpperCase()} ${apiPath}`
}

function normalizeOperation(operation: string): ContractOperation {
  const [method = '', ...pathParts] = operation.trim().split(' ')
  const normalizedMethod = method.toUpperCase()
  const normalizedPath = pathParts.join(' ').trim()
  return `${normalizedMethod} ${normalizedPath}` as ContractOperation
}

// A path segment is a param when wrapped in braces, e.g. "{id}". Returns the
// inner name for params, or null for literal segments.
function paramName(segment: string): string | null {
  if (segment.startsWith('{') && segment.endsWith('}')) return segment.slice(1, -1)
  return null
}

// Two paths are shape-compatible when they have the same number of segments
// and each segment pair is either literally equal or both params. Param NAMES
// are intentionally ignored here so a route [agentId] can line up with an
// OpenAPI {id}; the names are compared separately by paramMismatchesFor.
function isShapeCompatible(routePath: string, openapiPath: string): boolean {
  const routeSegments = routePath.split('/').filter(Boolean)
  const openapiSegments = openapiPath.split('/').filter(Boolean)
  if (routeSegments.length !== openapiSegments.length) return false
  for (let i = 0; i < routeSegments.length; i += 1) {
    const routeIsParam = paramName(routeSegments[i]) !== null
    const openapiIsParam = paramName(openapiSegments[i]) !== null
    if (routeIsParam && openapiIsParam) continue
    if (routeSegments[i] === openapiSegments[i]) continue
    return false
  }
  return true
}

// For a shape-compatible pair, collect each position where the param name
// differs. A route segment always provides the canonical name here because the
// caller passes the route path first.
function paramMismatchesFor(method: string, routePath: string, openapiPath: string): ParamMismatch[] {
  const routeSegments = routePath.split('/').filter(Boolean)
  const openapiSegments = openapiPath.split('/').filter(Boolean)
  const mismatches: ParamMismatch[] = []
  for (let i = 0; i < routeSegments.length; i += 1) {
    const routeName = paramName(routeSegments[i])
    const openapiName = paramName(openapiSegments[i])
    if (routeName !== null && openapiName !== null && routeName !== openapiName) {
      mismatches.push({
        method,
        path: routePath,
        openapiPath,
        routeParam: routeName,
        openapiParam: openapiName,
      })
    }
  }
  return mismatches
}

function splitOperation(operation: ContractOperation): { method: string; path: string } {
  const [method = '', ...pathParts] = operation.split(' ')
  return { method, path: pathParts.join(' ').trim() }
}

export function compareApiContractParity(params: {
  routeOperations: RouteOperation[]
  openapiOperations: ContractOperation[]
  ignore?: string[]
}): ParityReport {
  const ignored = new Set((params.ignore ?? []).map((x) => normalizeOperation(x)))
  const routeOperations = Array.from(new Set(params.routeOperations.map((op) => toContractOperation(op.method, op.path)))).sort()
  const openapiOperations = Array.from(new Set(params.openapiOperations.map((op) => normalizeOperation(op)))).sort()

  const routeSet = new Set(routeOperations)
  const openapiSet = new Set(openapiOperations)

  // Index openapi ops by method so shape-matching only compares same-method paths.
  const openapiByMethod = new Map<string, ContractOperation[]>()
  for (const op of openapiOperations) {
    const { method } = splitOperation(op)
    const list = openapiByMethod.get(method) ?? []
    list.push(op)
    openapiByMethod.set(method, list)
  }
  const routeByMethod = new Map<string, ContractOperation[]>()
  for (const op of routeOperations) {
    const { method } = splitOperation(op)
    const list = routeByMethod.get(method) ?? []
    list.push(op)
    routeByMethod.set(method, list)
  }

  const ignoredOperations: ContractOperation[] = []
  const missingInOpenApi: ContractOperation[] = []
  const paramMismatches: ParamMismatch[] = []
  const shapeMatchedRoute = new Set<ContractOperation>()
  const shapeMatchedOpenApi = new Set<ContractOperation>()

  for (const op of routeOperations) {
    if (ignored.has(op)) {
      ignoredOperations.push(op)
      continue
    }
    if (openapiSet.has(op)) {
      shapeMatchedRoute.add(op)
      continue
    }
    // No exact match: look for a same-method OpenAPI path with the same shape.
    const { method, path } = splitOperation(op)
    const candidates = openapiByMethod.get(method) ?? []
    const matched = candidates.find((candidate) => {
      if (openapiSet.has(op) && candidate === op) return true
      if (shapeMatchedOpenApi.has(candidate)) return false
      return isShapeCompatible(path, splitOperation(candidate).path)
    })
    if (matched) {
      shapeMatchedRoute.add(op)
      shapeMatchedOpenApi.add(matched)
      paramMismatches.push(...paramMismatchesFor(method, path, splitOperation(matched).path))
    } else {
      missingInOpenApi.push(op)
    }
  }

  const missingInRoutes: ContractOperation[] = []
  for (const op of openapiOperations) {
    if (ignored.has(op)) {
      if (!ignoredOperations.includes(op as ContractOperation)) ignoredOperations.push(op as ContractOperation)
      continue
    }
    if (routeSet.has(op) || shapeMatchedOpenApi.has(op)) continue
    // Defensive: a same-shape route that wasn't paired above (e.g. ordering).
    const { method, path } = splitOperation(op)
    const candidates = routeByMethod.get(method) ?? []
    const matched = candidates.find((candidate) => {
      if (shapeMatchedRoute.has(candidate)) return false
      return isShapeCompatible(splitOperation(candidate).path, path)
    })
    if (matched) {
      shapeMatchedOpenApi.add(op)
      // Avoid duplicate mismatch entries when the route side already recorded it.
      if (!paramMismatches.some((m) => m.method === method && m.openapiPath === path)) {
        paramMismatches.push(...paramMismatchesFor(method, splitOperation(matched).path, path))
      }
    } else {
      missingInRoutes.push(op as ContractOperation)
    }
  }

  paramMismatches.sort((a, b) =>
    a.method === b.method
      ? a.path === b.path
        ? a.routeParam.localeCompare(b.routeParam)
        : a.path.localeCompare(b.path)
      : a.method.localeCompare(b.method),
  )

  const ok = missingInOpenApi.length === 0 && missingInRoutes.length === 0 && paramMismatches.length === 0

  return {
    ok,
    routeOperations: routeOperations as ContractOperation[],
    openapiOperations: openapiOperations as ContractOperation[],
    missingInOpenApi,
    missingInRoutes,
    paramMismatches,
    ignoredOperations: ignoredOperations.sort(),
  }
}

export function loadOpenApiFile(projectRoot: string, openapiPath = 'openapi.json'): any {
  const filePath = path.join(projectRoot, openapiPath)
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function runApiContractParityCheck(params: {
  projectRoot: string
  openapiPath?: string
  ignore?: string[]
}): ParityReport {
  const projectRoot = path.resolve(params.projectRoot)
  const openapi = loadOpenApiFile(projectRoot, params.openapiPath)
  const routeOperations = collectRouteOperations(projectRoot)
  const openapiOperations = collectOpenApiOperations(openapi)
  return compareApiContractParity({ routeOperations, openapiOperations, ignore: params.ignore })
}
