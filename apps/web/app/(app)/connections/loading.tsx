import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConnectionsLoading() {
  return (
    <div className="page connections-page" aria-busy="true" aria-live="polite">
      <div className="page-stack">
        <div className="page-header connections-header">
          <div>
            <h1>Connections</h1>
            <p className="page-sub">Loading connection summary...</p>
          </div>
        </div>

        <Card aria-labelledby="connections-overview-loading-title">
          <CardHeader>
            <CardTitle id="connections-overview-loading-title">Overview</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div role="list" aria-label="Loading platform connections">
              {["gateway", "providers"].map((id) => (
                <div
                  className="grid gap-3 border-b border-border py-4 first:pt-0 last:border-b-0 last:pb-0"
                  key={id}
                  role="listitem"
                >
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                  <Skeleton className="h-4 w-full max-w-lg" />
                </div>
              ))}
            </div>
            <div className="grid gap-3">
              <Skeleton className="h-5 w-28" />
              <div className="grid gap-2 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-36" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
