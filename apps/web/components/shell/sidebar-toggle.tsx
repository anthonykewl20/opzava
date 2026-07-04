"use client";

import { useEffect, useRef } from "react";

export function SidebarToggle() {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = buttonRef.current;
    const app = button?.closest(".app");
    const rail = app?.querySelector(".rail") ?? null;
    const navQuery = window.matchMedia ? window.matchMedia("(max-width: 860px)") : null;
    let scrim: HTMLElement | null = null;

    if (!(button instanceof HTMLButtonElement) || !(app instanceof HTMLElement) || !(rail instanceof HTMLElement)) {
      return;
    }

    // Re-bind narrowed consts so the type guard survives into the closures below.
    const appEl: HTMLElement = app;
    const railEl: HTMLElement = rail;
    const btn: HTMLButtonElement = button;

    if (!railEl.id) railEl.id = "admin-rail";
    btn.setAttribute("aria-controls", railEl.id);

    function isMobile() {
      return navQuery ? navQuery.matches : false;
    }

    function syncExpanded() {
      btn.setAttribute(
        "aria-expanded",
        isMobile()
          ? String(appEl.classList.contains("nav-open"))
          : String(!appEl.classList.contains("is-collapsed")),
      );
      railEl.setAttribute(
        "aria-hidden",
        isMobile() && !appEl.classList.contains("nav-open") ? "true" : "false",
      );
      (railEl as HTMLElement & { inert: boolean }).inert =
        isMobile() && !appEl.classList.contains("nav-open");
    }

    function closeMobile(restoreFocus: boolean) {
      appEl.classList.remove("nav-open");
      document.body.classList.remove("nav-locked");
      syncExpanded();
      if (restoreFocus) btn.focus();
    }

    function ensureScrim() {
      if (scrim?.parentNode) return scrim;

      const existingScrim = appEl.querySelector(".rail-scrim");
      if (existingScrim instanceof HTMLElement) {
        scrim = existingScrim;
      } else {
        scrim = document.createElement("div");
        scrim.className = "rail-scrim";
        scrim.setAttribute("aria-hidden", "true");
        appEl.appendChild(scrim);
      }

      scrim.addEventListener("click", handleScrimClick);
      return scrim;
    }

    function openMobile() {
      appEl.classList.remove("is-collapsed");
      ensureScrim();
      appEl.classList.add("nav-open");
      document.body.classList.add("nav-locked");
      syncExpanded();

      const firstItem = railEl.querySelector("a, button");
      if (firstItem instanceof HTMLElement) firstItem.focus();
    }

    function toggleMobile() {
      if (appEl.classList.contains("nav-open")) closeMobile(true);
      else openMobile();
    }

    function syncMode() {
      if (isMobile()) {
        appEl.classList.remove("is-collapsed");
      } else {
        closeMobile(false);
      }
      syncExpanded();
    }

    function handleButtonClick(event: MouseEvent) {
      event.preventDefault();
      if (isMobile()) {
        toggleMobile();
        return;
      }

      closeMobile(false);
      appEl.classList.toggle("is-collapsed");
      syncExpanded();
    }

    function handleKeydown(event: KeyboardEvent) {
      if (
        (event.key === "Escape" || event.key === "Esc") &&
        isMobile() &&
        appEl.classList.contains("nav-open")
      ) {
        closeMobile(true);
      }
    }

    function handleScrimClick() {
      closeMobile(true);
    }

    btn.addEventListener("click", handleButtonClick);
    document.addEventListener("keydown", handleKeydown);
    if (navQuery) {
      if (navQuery.addEventListener) navQuery.addEventListener("change", syncMode);
      else navQuery.addListener(syncMode);
    }
    window.addEventListener("resize", syncMode);
    syncMode();

    return () => {
      btn.removeEventListener("click", handleButtonClick);
      document.removeEventListener("keydown", handleKeydown);
      if (navQuery) {
        if (navQuery.removeEventListener) navQuery.removeEventListener("change", syncMode);
        else navQuery.removeListener(syncMode);
      }
      window.removeEventListener("resize", syncMode);
      scrim?.removeEventListener("click", handleScrimClick);
      document.body.classList.remove("nav-locked");
    };
  }, []);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="btn btn-ghost btn-icon"
      aria-label="Collapse sidebar"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <rect x="2" y="4.5" width="14" height="1.5" rx=".75" fill="currentColor" />
        <rect x="2" y="8.25" width="10" height="1.5" rx=".75" fill="currentColor" />
        <rect x="2" y="12" width="14" height="1.5" rx=".75" fill="currentColor" />
      </svg>
    </button>
  );
}
