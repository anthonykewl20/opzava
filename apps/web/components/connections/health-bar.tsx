import { cn } from "@/lib/utils";

interface HealthBarProps {
  readonly healthy: number;
  readonly attention: number;
  readonly notChecked: number;
  readonly className?: string;
}

function countLabel(count: number, singular: string, plural = singular): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function HealthBar({ healthy, attention, notChecked, className }: HealthBarProps) {
  const total = healthy + attention + notChecked;
  const width = (count: number) => `${total === 0 ? 0 : (count / total) * 100}%`;
  const label = [
    countLabel(healthy, "healthy"),
    countLabel(attention, "needs attention", "need attention"),
    countLabel(notChecked, "not checked"),
  ].join(", ");

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "flex h-3 w-full overflow-hidden rounded-full border border-border bg-muted",
        total === 0 && "border-dashed",
        className,
      )}
    >
      {healthy > 0 ? (
        <span
          data-health-segment="healthy"
          className="h-full bg-[var(--success)]"
          style={{ width: width(healthy) }}
        />
      ) : null}
      {attention > 0 ? (
        <span
          data-health-segment="attention"
          className="h-full bg-[var(--warning)]"
          style={{ width: width(attention) }}
        />
      ) : null}
      {notChecked > 0 ? (
        <span
          data-health-segment="not-checked"
          className="h-full border-x border-dashed border-[var(--border-strong)] bg-muted"
          style={{ width: width(notChecked) }}
        />
      ) : null}
    </div>
  );
}
