import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { forbidden } from "next/navigation";
import { describe, expect, it } from "vitest";

import Forbidden from "../app/forbidden";
import { isRouteAdmitted } from "../lib/admin-registry";

function nextForbiddenStatus(): number {
  const previous = process.env["__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS"];
  process.env["__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS"] = "1";
  let status: number | undefined;

  try {
    forbidden();
  } catch (error) {
    const digest =
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof error.digest === "string"
        ? error.digest
        : "";
    status = Number(digest.split(";")[1]);
  } finally {
    if (previous === undefined) {
      delete process.env["__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS"];
    } else {
      process.env["__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS"] = previous;
    }
  }

  if (status === undefined) {
    throw new Error("Next forbidden interrupt did not provide an HTTP status.");
  }

  return status;
}

function deniedResponse(pathname: string) {
  const principal = { roleKeys: ["member"] };
  expect(isRouteAdmitted(principal, pathname)).toBe(false);

  return {
    status: nextForbiddenStatus(),
    body: renderToStaticMarkup(createElement(Forbidden)),
  } as const;
}

describe("Admin forbidden boundary", () => {
  it("returns the same generic 403 body for a registered and an unregistered route", () => {
    const registeredDenied = deniedResponse("/gateway");
    const unregisteredDenied = deniedResponse("/random/admin/path");

    expect(registeredDenied).toEqual(unregisteredDenied);
    expect(registeredDenied.status).toBe(403);
    expect(registeredDenied.body).toContain("Access denied");
    expect(registeredDenied.body).not.toContain("/gateway");
    expect(registeredDenied.body).not.toContain("/random/admin/path");
  });
});
