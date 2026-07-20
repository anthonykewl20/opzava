import { ADMIN_CONTROL_CENTER_VIEW_CAPABILITY, type AdminCapability } from "./capability";

export type AdminGroup = "pinned" | "develop" | "ai-runtime" | "operate" | "configure";

export interface AdminDestination {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly group: AdminGroup;
  readonly icon: string;
  readonly requiredCapability: AdminCapability;
  readonly external?: boolean;
}

function destination(input: Omit<AdminDestination, "requiredCapability">): AdminDestination {
  return {
    ...input,
    requiredCapability: ADMIN_CONTROL_CENTER_VIEW_CAPABILITY,
  };
}

export const adminDestinations: readonly AdminDestination[] = [
  destination({
    id: "ask-admin-opzava",
    label: "Ask Admin Opzava",
    href: "/ask-opzava",
    group: "pinned",
    icon: "Sparkles",
  }),
  destination({
    id: "overview",
    label: "Overview",
    href: "/",
    group: "develop",
    icon: "LayoutDashboard",
  }),
  destination({
    id: "dev-board",
    label: "Dev Board",
    href: "/dev-board",
    group: "develop",
    icon: "Kanban",
  }),
  destination({
    id: "runners",
    label: "Runners",
    href: "/runners",
    group: "develop",
    icon: "Workflow",
  }),
  destination({
    id: "environments",
    label: "Environments",
    href: "/environments",
    group: "develop",
    icon: "Boxes",
  }),
  destination({
    id: "gateway",
    label: "Gateway",
    href: "/gateway",
    group: "ai-runtime",
    icon: "Network",
  }),
  destination({
    id: "models",
    label: "Models & Providers",
    href: "/models",
    group: "ai-runtime",
    icon: "Cpu",
  }),
  destination({
    id: "agents",
    label: "Agents",
    href: "/agents",
    group: "ai-runtime",
    icon: "Bot",
  }),
  destination({
    id: "runtime-skills",
    label: "Runtime Skills",
    href: "/runtime-skills",
    group: "ai-runtime",
    icon: "WandSparkles",
  }),
  destination({
    id: "sessions",
    label: "Sessions & Runs",
    href: "/sessions",
    group: "ai-runtime",
    icon: "Activity",
  }),
  destination({
    id: "automations",
    label: "Automations",
    href: "/automations",
    group: "ai-runtime",
    icon: "Blocks",
  }),
  destination({
    id: "health",
    label: "Health",
    href: "/health",
    group: "operate",
    icon: "HeartPulse",
  }),
  destination({
    id: "incidents",
    label: "Incidents",
    href: "/incidents",
    group: "operate",
    icon: "Siren",
  }),
  destination({
    id: "logs",
    label: "Logs",
    href: "/logs",
    group: "operate",
    icon: "ScrollText",
  }),
  destination({
    id: "usage",
    label: "Usage & Costs",
    href: "/usage",
    group: "operate",
    icon: "ChartNoAxesCombined",
  }),
  destination({
    id: "integrations",
    label: "Integrations",
    href: "/integrations",
    group: "configure",
    icon: "Plug",
  }),
  destination({
    id: "engineering-skills",
    label: "Engineering Skills",
    href: "/engineering-skills",
    group: "configure",
    icon: "BookOpenCheck",
  }),
  destination({
    id: "mcp-servers",
    label: "MCP Servers",
    href: "/mcp-servers",
    group: "configure",
    icon: "Cable",
  }),
  destination({
    id: "secrets",
    label: "Secrets",
    href: "/secrets",
    group: "configure",
    icon: "KeyRound",
  }),
  destination({
    id: "security",
    label: "Security & Audit",
    href: "/security",
    group: "configure",
    icon: "ShieldCheck",
  }),
  destination({
    id: "settings",
    label: "Settings",
    href: "/settings",
    group: "configure",
    icon: "Settings",
  }),
] as const;
