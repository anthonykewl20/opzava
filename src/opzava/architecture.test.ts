import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const OPZAVA = here;
const SRC = resolve(here, '..');
const TS_EXT = '.ts';

function exists(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function isUnderOpzava(p: string): boolean {
  const norm = resolve(p);
  return norm.startsWith(OPZAVA + sep) || norm === OPZAVA;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (st.isFile()) {
      if (name.endsWith('.test.ts') || name.endsWith('.d.ts')) continue;
      if (name.endsWith(TS_EXT)) out.push(full);
    }
  }
  return out;
}

function extractSpecifiers(text: string): string[] {
  const specs: string[] = [];
  const reStatic = /\bfrom\s*['"]([^'"]+)['"]/g;
  const reDynamic = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = reStatic.exec(text)) !== null) specs.push(m[1]);
  while ((m = reDynamic.exec(text)) !== null) specs.push(m[1]);
  return specs;
}

function resolveSpec(fromFile: string, spec: string): string | null {
  let candidateBase: string;
  if (spec.startsWith('@/')) {
    candidateBase = join(SRC, spec.slice(2));
  } else if (spec.startsWith('.')) {
    candidateBase = resolve(dirname(fromFile), spec);
  } else {
    return null;
  }
  const candidates: string[] = [];
  if (candidateBase.endsWith(TS_EXT)) {
    candidates.push(candidateBase);
  } else {
    candidates.push(candidateBase + TS_EXT);
    candidates.push(join(candidateBase, 'index') + TS_EXT);
  }
  for (const c of candidates) {
    if (exists(c) && isUnderOpzava(c)) return c;
  }
  return null;
}

function rel(p: string): string {
  return relative(OPZAVA, p).split(sep).join('/');
}

const files = walk(OPZAVA);
const graph = new Map<string, string[]>();
const fileSet = new Set<string>(files);

for (const f of files) {
  let text: string;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    graph.set(f, []);
    continue;
  }
  const specs = extractSpecifiers(text);
  const targets: string[] = [];
  for (const s of specs) {
    const t = resolveSpec(f, s);
    if (t && fileSet.has(t)) targets.push(t);
  }
  graph.set(f, targets);
}

function findCycles(): string[] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const f of fileSet) color.set(f, WHITE);
  const cycles: string[] = [];
  const seenCycleKey = new Set<string>();

  function dfs(node: string, path: string[]): void {
    color.set(node, GRAY);
    const neighbors = graph.get(node) ?? [];
    for (const n of neighbors) {
      const c = color.get(n) ?? WHITE;
      if (c === GRAY) {
        const idx = path.indexOf(n);
        if (idx >= 0) {
          const cycle = path.slice(idx).concat(n);
          const key = [...cycle].sort().join('|');
          if (!seenCycleKey.has(key)) {
            seenCycleKey.add(key);
            cycles.push(cycle.map(rel).join(' -> '));
          }
        }
      } else if (c === WHITE) {
        dfs(n, path.concat(n));
      }
    }
    color.set(node, BLACK);
  }

  for (const f of fileSet) {
    if ((color.get(f) ?? WHITE) === WHITE) {
      dfs(f, [f]);
    }
  }
  return cycles;
}

describe('opzava architecture entropy guard', () => {
  it('has no import cycles', () => {
    const cycles = findCycles();
    expect(cycles).toEqual([]);
  });

  it('platform does not import modules/content', () => {
    const violations: string[] = [];
    for (const [file, targets] of graph) {
      const relFile = rel(file);
      if (!relFile.includes('platform/') && !relFile.endsWith('/platform')) continue;
      for (const t of targets) {
        const relT = rel(t);
        if (relT.includes('modules/content/') || relT.endsWith('/modules/content')) {
          violations.push(`${relFile} -> ${relT}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('content contracts layer imports no sibling content layers', () => {
    const violations: string[] = [];
    const forbidden = [
      'modules/content/workflow',
      'modules/content/campaign',
      'modules/content/steps',
      'modules/content/providers',
    ];
    for (const [file, targets] of graph) {
      const relFile = rel(file);
      if (!relFile.includes('modules/content/contracts/') && !relFile.endsWith('/modules/content/contracts')) continue;
      for (const t of targets) {
        const relT = rel(t);
        for (const f of forbidden) {
          if (relT.includes(f + '/') || relT === f) {
            violations.push(`${relFile} -> ${relT}`);
            break;
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('core does not import platform', () => {
    const violations: string[] = [];
    for (const [file, targets] of graph) {
      const relFile = rel(file);
      if (!relFile.startsWith('core/')) continue;
      for (const t of targets) {
        const relT = rel(t);
        if (relT.startsWith('platform/')) {
          violations.push(`${relFile} -> ${relT}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('modules import another module only through its public index.ts barrel', () => {
    const violations: string[] = [];
    for (const [file, targets] of graph) {
      const relFile = rel(file);
      const fileParts = relFile.split('/');
      if (fileParts[0] !== 'modules' || !fileParts[1]) continue;
      const ownModule = fileParts[1];
      for (const t of targets) {
        const relT = rel(t);
        const tParts = relT.split('/');
        if (tParts[0] !== 'modules' || !tParts[1]) continue;
        if (tParts[1] === ownModule) continue; // same module — internals are fine
        // cross-module: the only allowed target is the module's public index.ts barrel
        const isBarrel = tParts.length === 3 && tParts[2] === 'index.ts';
        if (!isBarrel) {
          violations.push(`${relFile} -> ${relT}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
