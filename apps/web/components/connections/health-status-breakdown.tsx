import { CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

interface HealthStatusBreakdownProps {
  readonly healthy: number;
  readonly attention: number;
  readonly notChecked: number;
  readonly className?: string;
}

const states = [
  {
    id: "healthy",
    label: "Healthy",
    description: "Probe succeeded",
    icon: CircleCheck,
    className: "text-[var(--success)]",
  },
  {
    id: "attention",
    label: "Needs attention",
    description: "Reported a problem",
    icon: TriangleAlert,
    className: "text-[var(--warning)]",
  },
  {
    id: "not-checked",
    label: "Not checked",
    description: "No probe result",
    icon: CircleHelp,
    className: "text-muted-foreground",
  },
] as const;

export function HealthStatusBreakdown({
  healthy,
  attention,
  notChecked,
  className,
}: HealthStatusBreakdownProps) {
  const counts = { healthy, attention, "not-checked": notChecked } as const;

  return (
    <dl
      data-health-breakdown="true"
      aria-label="System health status breakdown"
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-3", className)}
    >
      {states.map((state) => {
        const Icon = state.icon;
        const count = counts[state.id];
        return (
          <div
            key={state.id}
            data-health-state={state.id}
            className={cn(
              "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/30 p-3",
              state.id === "attention" && attention > 0 && "border-[var(--warning)] bg-warning/5",
              state.id === "not-checked" && "border-dashed bg-transparent",
            )}
          >
            <Icon className={cn("row-span-2 size-5", state.className)} aria-hidden="true" />
            <dt className="flex min-w-0 items-baseline justify-between gap-2 text-sm font-medium">
              <span>{state.label}</span>
              <span
                data-health-state-count={count}
                className="text-lg font-semibold leading-none tabular-nums text-foreground"
              >
                {count}
              </span>
            </dt>
            <dd className="text-xs text-muted-foreground">{state.description}</dd>
          </div>
        );
      })}
    </dl>
  );
}
