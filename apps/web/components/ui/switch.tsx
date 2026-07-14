"use client";

import { cn } from "@/lib/utils";

/**
 * Controlled switch primitive (shadcn-styled, no Radix dependency): a native button carrying
 * `role="switch"` + `aria-checked`, so keyboard and screen-reader behavior come from the platform.
 * `label` feeds the accessible name ("Enable <label>" / "Disable <label>") — the visible text next
 * to a switch belongs to the caller.
 */
export function Switch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  const state = checked ? "checked" : "unchecked";

  return (
    <button
      type="button"
      role="switch"
      data-slot="switch"
      data-state={state}
      aria-checked={checked}
      aria-label={`${checked ? "Disable" : "Enable"} ${label}`}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs outline-none transition-all",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <span
        aria-hidden="true"
        data-slot="switch-thumb"
        data-state={state}
        className="pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
      />
    </button>
  );
}
