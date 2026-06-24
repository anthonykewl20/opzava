#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']

function toPosix(input) {
  return input.split(path.sep).join('/')
}

function normalizeSegment(segment) {
  if (segment.startsWith('[[...') && segment.endsWith(']]')) return `{${segment.slice(5, -2)}}`
  if (segment.startsWith('[...') && segment.endsWith(']')) return `{${segment.slice(4, -1)}}`
  if (segment.startsWith('[') && segment.endsWith(']')) return `{${segment.slice(1, -1)}}`
  return segment
}

function routeFileToApiPath(projectRoot, fullPath) {
  const rel = toPosix(path.relative(projectRoot, fullPath))
  const withoutRoute = rel.replace(/\/route\.tsx?$/, '')
  const trimmed = withoutRoute.startsWith('src/app/api') ? withoutRoute.slice('src/app/api'.length) : withoutRoute
  const parts = trimmed.split('/').filter(Boolean).map(normalizeSegment)
  return `/api${parts.length ? `/${parts.join('/')}` : ''}`
}

function extractHttpMethods(source) {
  const methods = []
  for (const method of HTTP_METHODS) {
    const constExport = new RegExp(`export\\s+const\\s+${method}\\s*=`, 'm')
    const fnExport = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\s*\\(`, 'm')
    if (constExport.test(source) || fnExport.test(source)) methods.push(method)
  }
  return methods
}

function walkRouteFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkRouteFiles(full, out)
    else if (entry.isFile() && /route\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function normalizeOperation(operation) {
  const [method = '', ...pathParts] = String(operation || '').trim().split(' ')
  const normalizedMethod = method.toUpperCase()
  const normalizedPath = pathParts.join(' ').trim()
  return `${normalizedMethod} ${normalizedPath}`
}

// SCR-8: a path segment is a param when wrapped in braces ("{id}"). Returns the
// inner name for params, or null for literal segments.
function paramName(segment) {
  if (segment.startsWith('{') && segment.endsWith('}')) return segment.slice(1, -1)
  return null
}

// Two paths are shape-compatible when they have the same number of segments and
// each segment pair is either literally equal or both params. Param NAMES are
// intentionally ignored so a route [agentId] can line up with an OpenAPI {id};
// the names are compared separately to surface renames.
function isShapeCompatible(routePath, openapiPath) {
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

function paramMismatchesFor(method, routePath, openapiPath) {
  const routeSegments = routePath.split('/').filter(Boolean)
  const openapiSegments = openapiPath.split('/').filter(Boolean)
  const mismatches = []
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

function splitOperation(operation) {
  const [method = '', ...pathParts] = operation.split(' ')
  return { method, path: pathParts.join(' ').trim() }
}

// Compares route operations to OpenAPI operations. Exact string matches are
// exact; otherwise a same-method OpenAPI path with a matching shape is treated
// as the same operation and any differing param names are reported as
// paramMismatches. Renames no longer masquerade as missing-in-each-set.
function compareParity(routeOperations, openapiOperations, ignore) {
  const ignored = new Set(ignore)
  const routeOps = [...new Set(routeOperations)].sort()
  const openapiOps = [...new Set(openapiOperations.map((op) => normalizeOperation(op)))].sort()

  const routeSet = new Set(routeOps)
  const openapiSet = new Set(openapiOps)

  const openapiByMethod = new Map()
  for (const op of openapiOps) {
    const { method } = splitOperation(op)
    const list = openapiByMethod.get(method) ?? []
    list.push(op)
    openapiByMethod.set(method, list)
  }
  const routeByMethod = new Map()
  for (const op of routeOps) {
    const { method } = splitOperation(op)
    const list = routeByMethod.get(method) ?? []
    list.push(op)
    routeByMethod.set(method, list)
  }

  const ignoredOperations = []
  const missingInOpenApi = []
  const paramMismatches = []
  const shapeMatchedRoute = new Set()
  const shapeMatchedOpenApi = new Set()

  for (const op of routeOps) {
    if (ignored.has(op)) {
      ignoredOperations.push(op)
      continue
    }
    if (openapiSet.has(op)) {
      shapeMatchedRoute.add(op)
      continue
    }
    const { method, path } = splitOperation(op)
    const candidates = openapiByMethod.get(method) ?? []
    const matched = candidates.find((candidate) => {
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

  const missingInRoutes = []
  for (const op of openapiOps) {
    if (ignored.has(op)) {
      if (!ignoredOperations.includes(op)) ignoredOperations.push(op)
      continue
    }
    if (routeSet.has(op) || shapeMatchedOpenApi.has(op)) continue
    const { method, path } = splitOperation(op)
    const candidates = routeByMethod.get(method) ?? []
    const matched = candidates.find((candidate) => {
      if (shapeMatchedRoute.has(candidate)) return false
      return isShapeCompatible(splitOperation(candidate).path, path)
    })
    if (matched) {
      shapeMatchedOpenApi.add(op)
      if (!paramMismatches.some((m) => m.method === method && m.openapiPath === path)) {
        paramMismatches.push(...paramMismatchesFor(method, splitOperation(matched).path, path))
      }
    } else {
      missingInRoutes.push(op)
    }
  }

  paramMismatches.sort((a, b) =>
    a.method === b.method
      ? a.path === b.path
        ? a.routeParam.localeCompare(b.routeParam)
        : a.path.localeCompare(b.path)
      : a.method.localeCompare(b.method),
  )

  return {
    ok: missingInOpenApi.length === 0 && missingInRoutes.length === 0 && paramMismatches.length === 0,
    routeOperations: routeOps,
    openapiOperations: openapiOps,
    missingInOpenApi,
    missingInRoutes,
    paramMismatches,
    ignoredOperations: ignoredOperations.sort(),
  }
}

function parseIgnoreArg(ignoreArg) {
  if (!ignoreArg) return []
  return ignoreArg
    .split(',')
    .map((x) => normalizeOperation(x))
    .filter(Boolean)
}

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      flags[key] = true
      continue
    }
    flags[key] = next
    i += 1
  }
  return flags
}

function run() {
  const flags = parseArgs(process.argv.slice(2))
  const projectRoot = path.resolve(String(flags.root || process.cwd()))
  const openapiPath = path.resolve(projectRoot, String(flags.openapi || 'openapi.json'))
  const ignoreFile = flags['ignore-file'] ? path.resolve(projectRoot, String(flags['ignore-file'])) : null
  const ignoreInline = parseIgnoreArg(flags.ignore)
  let ignore = new Set(ignoreInline)

  if (ignoreFile && fs.existsSync(ignoreFile)) {
    const lines = fs
      .readFileSync(ignoreFile, 'utf8')
      .split('\n')
      .map((x) => x.trim())
      .filter((x) => x && !x.startsWith('#'))
      .map((x) => normalizeOperation(x))
    ignore = new Set([...ignore, ...lines])
  }

  const openapi = JSON.parse(fs.readFileSync(openapiPath, 'utf8'))
  const openapiOps = new Set()
  for (const [rawPath, pathItem] of Object.entries(openapi.paths || {})) {
    for (const method of Object.keys(pathItem || {})) {
      const upper = method.toUpperCase()
      if (HTTP_METHODS.includes(upper)) {
        openapiOps.add(`${upper} ${rawPath}`)
      }
    }
  }

  const routeFiles = walkRouteFiles(path.join(projectRoot, 'src/app/api'))
  const routeOps = []
  for (const file of routeFiles) {
    const source = fs.readFileSync(file, 'utf8')
    const methods = extractHttpMethods(source)
    const apiPath = routeFileToApiPath(projectRoot, file)
    for (const method of methods) routeOps.push(`${method} ${apiPath}`)
  }

  const result = compareParity(routeOps, [...openapiOps], [...ignore])

  const summary = {
    ok: result.ok,
    totals: {
      routeOperations: result.routeOperations.length,
      openapiOperations: result.openapiOperations.length,
      ignoredOperations: result.ignoredOperations.length,
    },
    missingInOpenApi: result.missingInOpenApi,
    missingInRoutes: result.missingInRoutes,
    paramMismatches: result.paramMismatches,
  }

  if (flags.json) {
    console.log(JSON.stringify(summary, null, 2))
  } else {
    console.log('API contract parity check')
    console.log(`- route operations:   ${summary.totals.routeOperations}`)
    console.log(`- openapi operations: ${summary.totals.openapiOperations}`)
    console.log(`- ignored entries:    ${summary.totals.ignoredOperations}`)
    if (result.missingInOpenApi.length) {
      console.log('\nMissing in OpenAPI:')
      for (const op of result.missingInOpenApi) console.log(`  - ${op}`)
    }
    if (result.missingInRoutes.length) {
      console.log('\nMissing in routes:')
      for (const op of result.missingInRoutes) console.log(`  - ${op}`)
    }
    if (result.paramMismatches.length) {
      console.log('\nPath-param name mismatches (route vs OpenAPI):')
      for (const m of result.paramMismatches) {
        console.log(`  - ${m.method} ${m.path} -> ${m.openapiPath} : {${m.routeParam}} != {${m.openapiParam}}`)
      }
    }
    if (result.ok) {
      console.log('\n✅ Contract parity OK')
    }
  }

  process.exit(result.ok ? 0 : 1)
}

run()
