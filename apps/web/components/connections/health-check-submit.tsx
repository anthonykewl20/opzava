"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function HealthCheckSubmitButton({ describedBy }: { readonly describedBy: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="secondary"
      aria-busy={pending}
      aria-describedby={describedBy}
      disabled={pending}
    >
      {pending ? <span className="sb-spinner sb-spinner--sm" aria-hidden="true" /> : null}
      {pending ? "Checking..." : "Run health check"}
    </Button>
  );
}
