"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export function FocusDetailHeading() {
  const pathname = usePathname();
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }

    const heading = document.querySelector<HTMLElement>("[data-connections-detail] h1");
    if (heading === null) {
      return;
    }

    if (!heading.hasAttribute("tabindex")) {
      heading.setAttribute("tabindex", "-1");
    }
    heading.focus({ preventScroll: false });
  }, [pathname]);

  return null;
}
