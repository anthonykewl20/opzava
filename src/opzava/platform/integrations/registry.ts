// The integration catalog + category metadata. Pure data — no imports (Engine-B root).
// Extracted verbatim from src/app/api/integrations/route.ts so the catalog has a
// single owner and a direct test surface, separate from the HTTP boundary.

export type BuiltinCategory =
  | "ai"
  | "search"
  | "social"
  | "messaging"
  | "devtools"
  | "security"
  | "infra"
  | "productivity"
  | "browser";

export interface IntegrationDef {
  id: string;
  name: string;
  category: string;
  envVars: string[];
  vaultItem?: string; // 1Password item name
  testable?: boolean;
  recommendation?: string;
}

export const INTEGRATIONS: IntegrationDef[] = [
  // AI Providers
  {
    id: "anthropic",
    name: "Anthropic",
    category: "ai",
    envVars: ["ANTHROPIC_API_KEY"],
    vaultItem: "openclaw-anthropic-api-key",
    testable: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "ai",
    envVars: ["OPENAI_API_KEY"],
    vaultItem: "openclaw-openai-api-key",
    testable: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "ai",
    envVars: ["OPENROUTER_API_KEY"],
    vaultItem: "openclaw-openrouter-api-key",
    testable: true,
  },
  {
    id: "venice",
    name: "Venice AI",
    category: "ai",
    envVars: ["VENICE_API_KEY"],
    vaultItem: "openclaw-venice-api-key",
    testable: true,
  },
  {
    id: "nvidia",
    name: "NVIDIA",
    category: "ai",
    envVars: ["NVIDIA_API_KEY"],
    vaultItem: "openclaw-nvidia-api-key",
  },
  {
    id: "moonshot",
    name: "Moonshot / Kimi",
    category: "ai",
    envVars: ["MOONSHOT_API_KEY"],
    vaultItem: "openclaw-moonshot-api-key",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    category: "ai",
    envVars: ["OLLAMA_API_KEY"],
    vaultItem: "openclaw-ollama-api-key",
  },

  // Search
  {
    id: "brave",
    name: "Brave Search",
    category: "search",
    envVars: ["BRAVE_API_KEY"],
    vaultItem: "openclaw-brave-api-key",
  },

  // Social
  {
    id: "x_twitter",
    name: "X / Twitter",
    category: "social",
    envVars: ["X_COOKIES_PATH"],
    recommendation:
      "Recommended: use xint CLI as default (`xint auth`) instead of manual cookies path.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "social",
    envVars: ["LINKEDIN_ACCESS_TOKEN"],
  },

  // Messaging — add entries here for each Telegram bot you run
  {
    id: "telegram",
    name: "Telegram",
    category: "messaging",
    envVars: ["TELEGRAM_BOT_TOKEN"],
    vaultItem: "openclaw-telegram-bot-token",
    testable: true,
  },

  // Dev Tools
  {
    id: "github",
    name: "GitHub",
    category: "devtools",
    envVars: ["GITHUB_TOKEN"],
    vaultItem: "openclaw-github-token",
    testable: true,
  },

  // Productivity
  {
    id: "google_workspace",
    name: "Google Workspace",
    category: "productivity",
    envVars: ["GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE"],
    testable: true,
    recommendation:
      "Install: npm i -g @googleworkspace/cli — then run `gws auth login` or set a service account credentials file.",
  },

  // Security
  {
    id: "onepassword",
    name: "1Password",
    category: "security",
    envVars: ["OP_SERVICE_ACCOUNT_TOKEN"],
  },

  // Infrastructure
  {
    id: "gateway",
    name: "Gateway Auth",
    category: "infra",
    envVars: ["OPENCLAW_GATEWAY_TOKEN"],
    vaultItem: "openclaw-openclaw-gateway-token",
  },

  // Browser Automation
  {
    id: "hyperbrowser",
    name: "Hyperbrowser",
    category: "browser",
    envVars: ["HYPERBROWSER_API_KEY"],
    testable: true,
    recommendation:
      "Cloud browser automation for AI agents. Get a key at hyperbrowser.ai",
  },
];

// Category metadata
export const CATEGORIES: Record<string, { label: string; order: number }> = {
  ai: { label: "AI Providers", order: 0 },
  search: { label: "Search", order: 1 },
  social: { label: "Social", order: 2 },
  messaging: { label: "Messaging", order: 3 },
  devtools: { label: "Dev Tools", order: 4 },
  security: { label: "Security", order: 5 },
  infra: { label: "Infrastructure", order: 6 },
  productivity: { label: "Productivity", order: 7 },
  browser: { label: "Browser Automation", order: 8 },
};
