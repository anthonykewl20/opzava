import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ModelProviderConnectionsLoading() {
  return (
    <div className="page connections-page" aria-busy="true" aria-live="polite">
      <div className="page-stack">
        <div className="page-header">
          <div>
            <h1>Model providers</h1>
            <p className="page-sub">Loading provider connection status...</p>
          </div>
        </div>

        <Card aria-labelledby="providers-loading-title">
          <CardHeader>
            <CardTitle id="providers-loading-title">Provider connection status</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-9 w-64" />
              <Skeleton className="h-9 w-36" />
            </div>
            <div className="grid gap-2">
              {[0, 1, 2, 3].map((row) => (
                <div
                  className="grid grid-cols-[minmax(10rem,1fr)_8rem_8rem_6rem] gap-4 rounded-lg border border-border p-4"
                  key={row}
                >
                  <Skeleton className="h-5 w-full max-w-48" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-8 w-20 justify-self-end" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
