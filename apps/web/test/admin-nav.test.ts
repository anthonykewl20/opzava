import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AdminNav, connectionRailActiveHref } from "../components/shell/admin-nav";

const navigation = vi.hoisted(() => ({ pathname: "/connections" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: () => undefined }),
}));

const state = {
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

describe("Connections rail active destination", () => {
  it.each([
    ["/connections", "/connections"],
    ["/connections/system", "/connections"],
    ["/connections/providers", "/connections/providers"],
    ["/connections/github", "/connections/github"],
    ["/connections/add", "/connections/add"],
  ])("renders exactly one active item for %s", (pathname, expected) => {
    navigation.pathname = pathname;
    const html = renderToStaticMarkup(createElement(AdminNav, { state }));

    expect(connectionRailActiveHref(pathname)).toBe(expected);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toContain(`href="${expected}"`);
  });

  it("renders the restored labels without exposing Gateway or System destinations", () => {
    navigation.pathname = "/connections/system";
    const html = renderToStaticMarkup(createElement(AdminNav, { state }));

    expect(html).toContain("Automate");
    expect(html).toContain("Connections");
    expect(html).toContain("Model Providers");
    expect(html).not.toContain('href="/connections/gateway"');
    expect(html).not.toContain('href="/connections/system"');
  });
});
