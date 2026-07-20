"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { HealthComponentGroupView } from "@/lib/health/health-view-model";

import styles from "./health.module.css";

function componentTone(status: HealthComponentGroupView["components"][number]["status"]): string {
  if (status === "healthy") return styles["healthy"]!;
  if (status === "attention") return styles["attention"]!;
  return styles["not_checked"]!;
}

export function AllComponents({
  groups,
  defaultOpen = false,
}: {
  readonly groups: readonly HealthComponentGroupView[];
  readonly defaultOpen?: boolean;
}) {
  const componentCount = groups.reduce((total, group) => total + group.components.length, 0);

  return (
    <Collapsible
      className={styles["disclosure"]!}
      defaultOpen={defaultOpen}
      data-component-count={componentCount}
    >
      <CollapsibleTrigger asChild>
        <Button className={styles["disclosureTrigger"]!} variant="ghost">
          All components
          <Badge className={styles["componentCount"]!} variant="muted">
            {componentCount}
          </Badge>
          <ChevronRight className={styles["disclosureChevron"]!} aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={styles["disclosureContent"]!} forceMount>
        {groups.length === 0 ? (
          <p className={styles["noComponents"]!}>
            No current component evidence is available. This is unknown, not a healthy zero.
          </p>
        ) : (
          groups.map((group) => (
            <section className={styles["componentGroup"]!} key={group.id}>
              <h3>{group.label}</h3>
              {group.components.map((component) => (
                <div className={styles["componentRow"]!} key={component.id}>
                  <span
                    className={`${styles["statusDot"]!} ${componentTone(component.status)}`}
                    aria-hidden="true"
                  />
                  <div className={styles["componentCopy"]!}>
                    <Link href={component.href}>{component.label}</Link>
                    <p>{component.detail}</p>
                  </div>
                  <div className={styles["componentMeta"]!}>
                    <span className={componentTone(component.status)}>{component.statusLabel}</span>
                    <span>{component.checkedLabel}</span>
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
