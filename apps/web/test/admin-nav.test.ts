import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AdminNav } from "../components/shell/admin-nav";
import { buildLegacyAdminNavModel } from "../lib/admin-registry";

const navigation = vi.hoisted(() => ({ pathname: "/connections" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: () => undefined }),
}));

const state = {
  model: buildLegacyAdminNavModel({ roleKeys: ["admin"] }),
  openTasksCount: 0,
  openIssuesCount: 0,
  askOpzavaActive: false,
  connectionsConnected: true,
  connections: {
    providersConnected: 2,
    providersTotal: 29,
    githubConnected: true,
  },
} as const;

describe("Registry-driven legacy Admin rail", () => {
  it.each([
    ["/", "/"],
    ["/ask-opzava", "/ask-opzava"],
    ["/connections", "/connections"],
    ["/connections/system", "/connections"],
    ["/connections/providers", "/connections/providers"],
    ["/connections/github", "/connections/github"],
    ["/connections/add", "/connections/add"],
  ])("renders exactly one active item for %s", (pathname, expected) => {
    navigation.pathname = pathname;
    const html = renderToStaticMarkup(createElement(AdminNav, { state }));

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain(`href="${expected}"`);
  });

  it("preserves the pre-F4 labels and structure while sourcing them through the registry adapter", () => {
    navigation.pathname = "/connections/system";
    const html = renderToStaticMarkup(createElement(AdminNav, { state }));

    expect(html).toContain("Ask Admin Opzava");
    expect(html).toContain("Operate");
    expect(html).toContain("Tasks");
    expect(html).toContain("Issues");
    expect(html).toContain("Automate");
    expect(html).toContain("Connections");
    expect(html).toContain("Model Providers");
    expect(html).not.toContain('href="/gateway"');
    expect(html).not.toContain('href="/models"');
  });

  it("preserves the active Ask Admin status indicator", () => {
    navigation.pathname = "/ask-opzava";
    const html = renderToStaticMarkup(
      createElement(AdminNav, { state: { ...state, askOpzavaActive: true } }),
    );

    expect(html).toContain('aria-label="Assistant turn in progress"');
  });
});
