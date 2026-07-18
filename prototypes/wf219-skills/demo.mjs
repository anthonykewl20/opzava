#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, "config", "agent.coding-exact.jsonc");
const SKILLS_PATH = path.join(ROOT, "skills");

const TARGET_EFFECTIVE = [
  "read",
  "web_search",
  "web_fetch",
  "memory_search",
  "memory_get",
  "session_status",
  "sessions_history",
  "sessions_list",
  "sessions_send",
  "sessions_spawn",
  "sessions_yield",
  "subagents",
  "opzava_tasks_create",
  "opzava_tasks_comments_add",
  "opzava_tasks_due_set",
  "opzava_tasks_get",
  "opzava_tasks_list",
  "opzava_tasks_quality_checks_add",
  "opzava_tasks_steps_create",
  "opzava_tasks_steps_reorder",
  "opzava_tasks_steps_toggle",
  "opzava_tasks_update",
  "opzava_tasks_watchers_set",
  "opzava_github_state_read",
  "opzava_connections_health_read",
];

const PROFILE_TOOLSETS = {
  minimal: [
    "session_status",
  ],
  coding: [
    "read",
    "write",
    "edit",
    "apply_patch",
    "exec",
    "process",
    "code_execution",
    "web_search",
    "x_search",
    "web_fetch",
    "memory_search",
    "memory_get",
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "sessions_spawn",
    "sessions_yield",
    "subagents",
    "session_status",
    "browser",
    "canvas",
    "message",
    "heartbeat_respond",
    "cron",
    "gateway",
    "nodes",
    "agents_list",
    "get_goal",
    "create_goal",
    "update_goal",
    "update_plan",
    "skill_workshop",
    "image",
    "image_generate",
    "music_generate",
    "video_generate",
    "tts",
    "bundle-mcp",
  ],
};

const BUNDLE_MCP_TOOLS = [
  "opzava_tasks_list",
  "opzava_tasks_get",
  "opzava_tasks_create",
  "opzava_tasks_update",
  "opzava_tasks_comments_add",
  "opzava_tasks_steps_create",
  "opzava_tasks_steps_toggle",
  "opzava_tasks_steps_reorder",
  "opzava_tasks_quality_checks_add",
  "opzava_tasks_due_set",
  "opzava_tasks_watchers_set",
  "opzava_github_state_read",
  "opzava_connections_health_read",
  "bundle-mcp__admin_rotate_token",
  "bundle-mcp__opzava_tasks_archive",
];

const TOOL_GROUPS = {
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:runtime": ["exec", "process", "code_execution"],
  "group:web": ["web_search", "x_search", "web_fetch"],
  "group:memory": ["memory_search", "memory_get"],
  "group:sessions": [
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "sessions_spawn",
    "sessions_yield",
    "subagents",
    "session_status",
  ],
  "group:agents": ["agents_list", "update_plan", "get_goal", "create_goal", "update_goal"],
  "group:messaging": ["message"],
  "group:automation": ["heartbeat_respond", "cron", "gateway"],
  "group:nodes": ["nodes"],
  "group:ui": ["browser", "canvas"],
  "group:media": ["image", "image_generate", "music_generate", "video_generate", "tts"],
};

const AUTHORITY_CLAIM_PATTERN =
  /\b(?:may|can|could|will|is|are)\b[^.\n]{0,48}\b(?:approve|finali[sz]e|sign\s+off|mark\s+done|accept|merge)\b|\b(?:has authority|is empowered|is authorized|authorized)\b[^.\n]{0,48}\b(?:to\s+)?(?:approve|finali[sz]e|sign\s+off|mark\s+done|accept|merge)\b/gi;
const NEGATED_AUTHORITY_TERM =
  /\b(?:never|not|must\s+not|should\s+not|can't|cannot|won't|do\s+not|don't|did\s+not)\b/i;

function toSet(values) {
  return new Set(values);
}

function stripJsonc(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function makePattern(pattern) {
  const safe = escapeRegExp(pattern).replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
  return new RegExp(`^${safe}$`);
}

function matchesPattern(pattern, name) {
  if (pattern.startsWith("group:")) {
    const group = TOOL_GROUPS[pattern] ?? [];
    return group.includes(name);
  }
  const regexLike = pattern.includes("*") || pattern.includes("?");
  if (regexLike) {
    return makePattern(pattern).test(name);
  }
  return name === pattern;
}

function matchesAny(patterns, name) {
  return patterns.some((pattern) => matchesPattern(pattern, name));
}

function expandBundleMcp(list) {
  const values = [...list];
  if (values.includes("bundle-mcp")) {
    return values.filter((item) => item !== "bundle-mcp").concat(BUNDLE_MCP_TOOLS);
  }
  return values;
}

function pipelineTools(profileName) {
  const base = PROFILE_TOOLSETS[profileName];
  if (!base) {
    throw new Error(`unknown tool profile: ${profileName}`);
  }
  return [...toSet(expandBundleMcp(base))];
}

function applyKeepOnly(input, allowPatterns) {
  if (!allowPatterns || allowPatterns.length === 0) {
    return [...input];
  }
  return input.filter((tool) => matchesAny(allowPatterns, tool));
}

function applyDeny(input, denyPatterns) {
  if (!denyPatterns || denyPatterns.length === 0) {
    return [...input];
  }
  return input.filter((tool) => !matchesAny(denyPatterns, tool));
}

function applyPolicy(profileName, allowPatterns, denyPatterns) {
  const profileTools = pipelineTools(profileName);
  const afterAllow = applyKeepOnly(profileTools, allowPatterns);
  const afterDeny = applyDeny(afterAllow, denyPatterns);
  return toSet(afterDeny);
}

function resolveSubagentSkills(agentConfig, defaults = []) {
  if (agentConfig && Array.isArray(agentConfig.skills)) {
    return [...agentConfig.skills];
  }
  if (Array.isArray(defaults)) {
    return [...defaults];
  }
  return [];
}

function deriveSubagentConfig(agentConfig, defaults = []) {
  return {
    ...agentConfig,
    skills: resolveSubagentSkills(agentConfig, defaults),
  };
}

function parseFrontmatter(filePath, content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`SKILL.md missing frontmatter marker: ${filePath}`);
  }
  const frontmatterLines = match[1].split(/\r?\n/);
  const body = content.slice(match[0].length).trim();
  const result = {
    raw: {},
    body,
    filePath,
  };
  let inList = null;

  for (const line of frontmatterLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (inList) {
      if (/^-\s+/.test(trimmed)) {
        result.raw[inList].push(trimmed.replace(/^-\s*/, ""));
        continue;
      }
      inList = null;
    }

    const dividerIndex = trimmed.indexOf(":");
    if (dividerIndex < 0) {
      throw new Error(`Invalid frontmatter line in ${filePath}: ${line}`);
    }
    const key = trimmed.slice(0, dividerIndex).trim();
    const normalizedKey = key.replace(/-([a-z])/g, (_match, p1) => p1.toUpperCase());
    const value = trimmed.slice(dividerIndex + 1).trim();

    if (value === "") {
        result.raw[normalizedKey] = [];
      inList = normalizedKey;
        continue;
      }
    if (value.startsWith("[") && value.endsWith("]")) {
      const parsed = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      result.raw[normalizedKey] = parsed;
      continue;
    }
    if (value === "true" || value === "false") {
      result.raw[normalizedKey] = value === "true";
    } else {
      const quoted = value.match(/^"(.*)"$/) || value.match(/^'(.*)'$/);
      result.raw[normalizedKey] = quoted ? quoted[1] : value;
    }
  }

  return result;
}

function collectSkillFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      out.push(...collectSkillFiles(full));
      continue;
    }
    if (entry.isFile() && entry.name === "SKILL.md") {
      out.push(full);
    }
  }
  return out;
}

function readSkills() {
  return collectSkillFiles(SKILLS_PATH).map((file) => {
    const content = fs.readFileSync(file, "utf8");
    return parseFrontmatter(file, content);
  });
}

function extractBodyToolMentions(body, knownTools) {
  const normalized = String(body || "").toLowerCase();
  const out = new Set();

  const backticks = /`([^`]+)`/g;
  let next;
  while ((next = backticks.exec(normalized)) !== null) {
    const raw = next[1];
    const tokens = raw
      .split(/[\s,.;:()]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    for (const token of tokens) {
      const lowered = token.toLowerCase();
      if (knownTools.has(lowered)) {
        out.add(lowered);
      }
    }
  }

  const candidates = /[a-z][a-z0-9_]*(?:-[a-z0-9_]+)*(?:__[a-z0-9_]+)?/g;
  let found;
  while ((found = candidates.exec(normalized)) !== null) {
    if (knownTools.has(found[0])) {
      out.add(found[0]);
    }
  }

  return [...out];
}

function hasForbiddenAuthorityClaim(text) {
  const normalized = String(text || "").toLowerCase();
  const matches = normalized.matchAll(AUTHORITY_CLAIM_PATTERN);

  for (const match of matches) {
    const phrase = match[0];
    const index = match.index;
    if (index === undefined || index === null) {
      continue;
    }

    if (NEGATED_AUTHORITY_TERM.test(phrase)) {
      continue;
    }

    const prefix = normalized.slice(0, index);
    const sentenceStart = Math.max(
      prefix.lastIndexOf("."),
      prefix.lastIndexOf("!"),
      prefix.lastIndexOf("?"),
      prefix.lastIndexOf("\n"),
      prefix.lastIndexOf(";"),
      prefix.lastIndexOf(":"),
    );
    const recentPrefix = prefix
      .slice(sentenceStart + 1)
      .trim()
      .split(/\s+/)
      .slice(-6)
      .join(" ");
    if (NEGATED_AUTHORITY_TERM.test(recentPrefix)) {
      continue;
    }

    return true;
  }
  return false;
}

function validateSkillRecord(skill, effectiveTools, knownTools, seenNames) {
  const raw = skill.raw;
  const name = raw.name;
  const description = raw.description;
  const dependencyArray = Array.isArray(raw.tool_dependencies) ? raw.tool_dependencies : [];
  const dependencySet = new Set(
    dependencyArray
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const missingDependencies = dependencyArray.filter((dep) => !effectiveTools.has(dep));

  const rawMentions = extractBodyToolMentions(skill.body, knownTools);
  const undeclaredBodyTools = rawMentions.filter((tool) => !dependencySet.has(tool));
  const duplicateName = typeof name === "string" && seenNames.has(name);
  if (typeof name === "string" && name.trim().length > 0) {
    seenNames.add(name);
  }

  const malformedName = !(typeof name === "string" && name.trim().length > 0);
  const malformedDescription =
    !(typeof description === "string" && description.trim().length > 0);
  const malformedBody = !(typeof skill.body === "string" && skill.body.trim().length > 0);
  const malformedDependencies =
    !Array.isArray(raw.tool_dependencies) ||
    dependencyArray.length === 0 ||
    dependencyArray.some((dep) => typeof dep !== "string" || dep.trim().length === 0);
  const malformedUserInvocable = raw.userInvocable !== false;
  const authorityDisallowed = hasForbiddenAuthorityClaim(`${skill.body}\n${JSON.stringify(raw)}`);

  return {
    name,
    dependencyCount: dependencyArray.length,
    malformedName,
    malformedDescription,
    malformedBody,
    malformedDependencies,
    duplicateName,
    missingDependencies,
    userInvocableViolation: malformedUserInvocable,
    undeclaredBodyTools,
    authorityDisallowed,
  };
}

function admitReasons(result) {
  const out = [];
  if (result.malformedName) out.push("malformed skill name");
  if (result.malformedDescription) out.push("malformed description");
  if (result.malformedBody) out.push("empty body");
  if (result.duplicateName) out.push("duplicate skill name");
  if (result.malformedDependencies) out.push("tool_dependencies must be a non-empty list of strings");
  if (result.userInvocableViolation) out.push("userInvocable must be false");
  if (result.missingDependencies.length > 0) {
    out.push(`dependencies missing from effective set: ${result.missingDependencies.join(", ")}`);
  }
  if (result.undeclaredBodyTools.length > 0) {
    out.push(`body uses undeclared tools: ${result.undeclaredBodyTools.join(", ")}`);
  }
  if (result.authorityDisallowed) {
    out.push("authority claim language");
  }
  return out;
}

function admitSkill(result) {
  return admitReasons(result).length === 0;
}

function assert(condition, message, details) {
  if (condition) {
    console.log(`PASS ${message}`);
    return true;
  }
  const suffix = details ? `: ${details}` : "";
  console.error(`FAIL ${message}${suffix}`);
  return false;
}

function asSortedArray(setOrArray) {
  return [...setOrArray].sort();
}

function sameSet(actual, expected) {
  const expectedSet = expected instanceof Set ? expected : new Set(expected);
  if (actual.size !== expectedSet.size) {
    return false;
  }
  return asSortedArray(actual).every((value, index) => value === asSortedArray(expectedSet)[index]);
}

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  const clean = stripJsonc(raw);
  return JSON.parse(clean);
}

function makeBadFixture(filePath, overrides) {
  return {
    filePath,
    body: "",
    raw: {
      name: "bad-fallback",
      description: "Malformed skill fixture.",
      userInvocable: false,
      tool_dependencies: ["read"],
    },
    ...overrides,
  };
}

function main() {
  let ok = true;
  const config = loadConfig();
  const agentConfig = config?.agents?.list?.[0];
  if (!agentConfig?.tools) {
    throw new Error("Config missing agents.list[0].tools");
  }

  const toolsPolicy = agentConfig.tools;
  const profile = toolsPolicy.profile;
  const allow = toolsPolicy.allow ?? [];
  const deny = toolsPolicy.deny ?? [];

  const defaultsSkills = Array.isArray(config?.agents?.defaults?.skills)
    ? config.agents.defaults.skills
    : [];
  const workspaceOnly = toolsPolicy?.fs?.workspaceOnly === true;

  const effectiveTools = applyPolicy(profile, allow, deny);
  const expectedTools = toSet(TARGET_EFFECTIVE);
  const sortedExpected = asSortedArray(expectedTools);
  const sortedActual = asSortedArray(effectiveTools);

  console.log("Expected effective set:", sortedExpected.join(", "));
  console.log("Actual effective set:", sortedActual.join(", "));

  ok = assert(profile === "coding", "S0 policy profile", `profile=${profile}`);
  ok =
    assert(
      sameSet(effectiveTools, sortedExpected),
      "S1 effective toolset equals exact v1 intended set",
      `actual=${sortedActual.join(", ")}`,
    ) && ok;

  const bundleGuardTools = BUNDLE_MCP_TOOLS.filter((tool) => !expectedTools.has(tool));
  const leakedBundleTools = bundleGuardTools.filter((tool) => effectiveTools.has(tool));
  ok =
    assert(
      leakedBundleTools.length === 0,
      "S2 keep-only: bundle namespace expansion is denied unless explicitly allowed",
      `found=${leakedBundleTools.join(", ") || "none"}`,
    ) && ok;

  ok = assert(
    workspaceOnly === true,
    "S0 tooling has workspaceOnly true for fs",
    `workspaceOnly=${workspaceOnly}`,
  ) && ok;

  const childAgentConfig = deriveSubagentConfig(agentConfig, defaultsSkills);
  const childEffectiveSkills = resolveSubagentSkills(childAgentConfig, defaultsSkills);
  ok =
    assert(
      sameSet(toSet(childEffectiveSkills), toSet(defaultsSkills)),
      "S4 child/subagent effective skills inherit agents.defaults.skills",
      `child=${JSON.stringify(childEffectiveSkills)}`,
    ) && ok;

  const skills = readSkills();
  ok = assert(
    skills.length === 3,
    "S5 all 3 SKILL.md parsed",
    `found=${skills.length}`,
  ) && ok;

  const knownTools = toSet([...pipelineTools(profile), ...BUNDLE_MCP_TOOLS]);
  const seenNames = new Set();

  for (const skill of skills) {
    const validation = validateSkillRecord(skill, effectiveTools, knownTools, seenNames);
    const descriptor = `in ${path.basename(path.dirname(skill.filePath))}`;
    const reasons = admitReasons(validation);
    const accepted = admitSkill(validation);
    const descLen = String(skill.raw.description ?? "").length;

    ok =
      assert(!validation.malformedName, `S5 frontmatter name present ${descriptor}`) && ok;
    ok =
      assert(!validation.malformedDescription, `S5 frontmatter description present and short ${descriptor}`, `len=${descLen}`) &&
      ok;
    ok =
      assert(!validation.malformedBody, `S5 non-empty body ${descriptor}`) && ok;
    ok =
      assert(!validation.malformedDependencies, `S3 skill dependency list declared ${descriptor}`, `deps=${validation.dependencyCount}`) &&
      ok;
    ok =
      assert(!validation.userInvocableViolation, `S5 user-invocable is false ${descriptor}`) && ok;
    ok =
      assert(!validation.duplicateName, `S5 unique skill name ${descriptor}`) && ok;
    ok =
      assert(
        validation.missingDependencies.length === 0,
        `S3 declared deps in effective set for ${validation.name}`,
        `missing=${validation.missingDependencies.join(", ") || "none"}`,
      ) && ok;
    ok =
      assert(
        validation.undeclaredBodyTools.length === 0,
        `S3 declared body tool usages for ${validation.name}`,
        `undeclared=${validation.undeclaredBodyTools.join(", ") || "none"}`,
      ) && ok;
    ok =
      assert(!validation.authorityDisallowed, `S5 no authority claim language in ${validation.name}`, reasons.join(", ")) &&
      ok;
    ok = assert(accepted, `S5 skill admitted by policy ${descriptor}`, reasons.join("; ")) && ok;
  }

  const syntheticBadSkill = makeBadFixture(
    "prototypes/wf219-skills/skills/_bad/bad_frontmatter.md",
    {
      raw: { name: [], description: [], userInvocable: "false", tool_dependencies: [] },
      body: "",
    },
  );

  const duplicateNameSkill = makeBadFixture(
    "prototypes/wf219-skills/skills/_bad/duplicate-name.md",
    {
      raw: {
        name: "opzava-reporting",
        description: "Duplicate name and user-invocable violation fixture.",
        userInvocable: true,
        tool_dependencies: ["read"],
      },
      body: "Use `read` to inspect this fixture.",
    },
  );

  const undeclaredToolSkill = makeBadFixture(
    "prototypes/wf219-skills/skills/_bad/undeclared-and-denied.md",
    {
      raw: {
        name: "opzava-bad-tool-gap",
        description: "Uses undeclared tool while declaring denied tool.",
        userInvocable: false,
        tool_dependencies: ["write"],
      },
      body: "Use `write` and `opzava_tasks_update` to mutate a card.",
    },
  );

  const authorityClaimingSkill = makeBadFixture(
    "prototypes/wf219-skills/skills/_bad/authority-claim.md",
    {
      raw: {
        name: "opzava-bad-authority",
        description: "Authority wording fixture for rejection.",
        userInvocable: false,
        tool_dependencies: ["read", "web_fetch"],
      },
      body: "I can sign off this change and may approve the result in one pass.",
    },
  );

  const expandedAuthorityClaimSkill = makeBadFixture(
    "prototypes/wf219-skills/skills/_bad/authority-claim-expanded.md",
    {
      raw: {
        name: "opzava-bad-authority-expanded",
        description: "Expanded authority phrasing fixture for rejection.",
        userInvocable: false,
        tool_dependencies: ["read", "web_fetch"],
      },
      body: "This task has authority to accept outcomes and is empowered to merge cards.",
    },
  );

  const safeNegationSkill = makeBadFixture(
    "prototypes/wf219-skills/skills/_bad/safe-negation.md",
    {
      raw: {
        name: "opzava-safe-negation",
        description: "Proves negated authority wording is allowed.",
        userInvocable: false,
        tool_dependencies: ["read", "web_fetch"],
      },
      body:
        "This skill may not approve cards, cannot approve cards without review, and it must not finalize or mark done directly.",
    },
  );

  const badSkillFixtures = [
    {
      skill: syntheticBadSkill,
      assertors: [
        { label: "malformed frontmatter", check: (result) => result.malformedName && result.malformedDescription && result.malformedBody },
      ],
    },
    {
      skill: duplicateNameSkill,
      assertors: [
        { label: "duplicate name", check: (result) => result.duplicateName },
        { label: "user-invocable violation", check: (result) => result.userInvocableViolation },
      ],
    },
    {
      skill: undeclaredToolSkill,
      assertors: [
        { label: "declared denied tool", check: (result) => result.missingDependencies.includes("write") },
        { label: "undeclared body tool", check: (result) => result.undeclaredBodyTools.includes("opzava_tasks_update") },
      ],
    },
    {
      skill: authorityClaimingSkill,
      assertors: [{ label: "authority claim", check: (result) => result.authorityDisallowed }],
    },
    {
      skill: expandedAuthorityClaimSkill,
      assertors: [{ label: "expanded authority claim", check: (result) => result.authorityDisallowed }],
    },
  ];

  for (const { skill, assertors } of badSkillFixtures) {
    const validation = validateSkillRecord(skill, effectiveTools, knownTools, seenNames);
    const reasons = admitReasons(validation);
    const accepted = admitSkill(validation);
    for (const { label, check } of assertors) {
      ok =
        assert(
          check(validation),
          `S5 negative fixture rejected (${label}) ${path.basename(skill.filePath)}`,
          `reasons=${reasons.join(", ") || "none"}`,
        ) && ok;
    }
    ok =
      assert(
        !accepted,
        `S5 negative fixture rejected (policy admission) ${path.basename(skill.filePath)}`,
        `reasons=${reasons.join(", ") || "none"}`,
      ) && ok;
  }

  const safeValidation = validateSkillRecord(safeNegationSkill, effectiveTools, knownTools, seenNames);
  ok =
    assert(
      admitSkill(safeValidation),
      "S5 safe authority negation wording admitted",
      `reasons=${admitReasons(safeValidation).join(", ") || "none"}`,
    ) && ok;

  if (ok) {
    console.log("SCENARIO_SUMMARY=PASS");
    process.exit(0);
  }
  console.log("SCENARIO_SUMMARY=FAIL");
  process.exit(1);
}

main();
