import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/* global process */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const fail = (message) => {
  throw new Error(`Gateway plugin alignment: ${message}`);
};
const capture = (text, pattern, label) => {
  const match = text.match(pattern);
  if (!match) fail(`could not find ${label}`);
  return match[1];
};

try {
  const mainframeVersion = JSON.parse(read("mainframe/package.json")).version;
  const envTag = capture(
    read(".env.example"),
    /^OPENCLAW_IMAGE_TAG=(\S+)$/mu,
    "OPENCLAW_IMAGE_TAG in .env.example",
  );
  if (envTag !== mainframeVersion) {
    fail(`.env.example tag ${envTag} does not match mainframe version ${mainframeVersion}`);
  }

  const compose = read("docker-compose.yml");
  const imageTag = capture(
    compose,
    /^\s*image:\s*opzava\/mainframe-gateway:\$\{OPENCLAW_IMAGE_TAG:-([^}]+)\}\s*$/mu,
    "gateway image default tag in docker-compose.yml",
  );
  if (imageTag !== mainframeVersion) {
    fail(`compose image tag ${imageTag} does not match mainframe version ${mainframeVersion}`);
  }

  const extensionValue = capture(
    compose,
    /^(?: {2})openclaw-platform-gateway:\s*$[\s\S]*?^ {4}build:\s*$[\s\S]*?^ {6}args:\s*$[\s\S]*?^\s*OPENCLAW_EXTENSIONS:\s*["']?([^"'\n]+?)["']?\s*$/mu,
    "OPENCLAW_EXTENSIONS in gateway build args",
  );
  const actual = new Set(extensionValue.split(/[\s,]+/u).filter(Boolean));
  const expected = new Set(["zai", "deepseek", "moonshot", "cloudflare-ai-gateway"]);
  const missing = [...expected].filter((id) => !actual.has(id));
  const extra = [...actual].filter((id) => !expected.has(id));
  if (actual.size === 0 || missing.length > 0 || extra.length > 0) {
    fail(
      `OPENCLAW_EXTENSIONS mismatch (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"})`,
    );
  }

  for (const id of actual) {
    const pluginDir = path.join(root, "mainframe", "extensions", id);
    if (!fs.statSync(pluginDir, { throwIfNoEntry: false })?.isDirectory()) {
      fail(`plugin directory does not exist: mainframe/extensions/${id}`);
    }
    if (!fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"))) {
      fail(`plugin manifest does not exist: mainframe/extensions/${id}/openclaw.plugin.json`);
    }
  }

  process.stdout.write(
    `OK: gateway tag ${mainframeVersion} and ${actual.size} image-baked plugins align\n`,
  );
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
