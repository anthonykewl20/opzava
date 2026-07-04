"use client";

import { useFormStatus } from "react-dom";

export function HealthCheckSubmitButton({ describedBy }: { readonly describedBy: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      className="btn"
      aria-busy={pending}
      aria-describedby={describedBy}
      disabled={pending}
    >
      {pending ? <span className="sb-spinner sb-spinner--sm" aria-hidden="true" /> : null}
      {pending ? "Checking..." : "Run health check"}
    </button>
  );
}
