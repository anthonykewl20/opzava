"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function sanitizedErrorReason(error: Error): string {
  const message = error.message.trim();
  if (message === "") {
    return "The live connection snapshot could not be loaded.";
  }

  return message
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, "[redacted]")
    .replace(/\b(token|key|secret|authorization|bearer)\b\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

export default function ConnectionsError({
  error,
  reset,
}: {
  readonly error: Error;
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error("Connections page failed to load", sanitizedErrorReason(error));
  }, [error]);

  return (
    <div className="page connections-page">
      <Card className="mx-auto max-w-2xl" role="alert" aria-labelledby="connections-error-title">
        <CardHeader>
          <CardTitle id="connections-error-title">Connections could not load</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">
            Fetch failed while reading the live gateway snapshot. Retry the page; if it keeps
            failing, check the provisioning worker health and token configuration.
          </p>
          <Alert variant="destructive">
            <CircleAlert className="mt-0.5 size-4" aria-hidden="true" />
            <AlertTitle>Fetch failed</AlertTitle>
            <AlertDescription>{sanitizedErrorReason(error)}</AlertDescription>
          </Alert>
          <div>
            <Button type="button" onClick={reset} className="h-11 sm:h-9">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
