import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AddConnectionLoading() {
  return (
    <div className="page connections-page" aria-busy="true" aria-live="polite">
      <div className="page-stack">
        <div className="page-header">
          <div>
            <h1>Add integration</h1>
            <p className="page-sub">Loading integration catalog...</p>
          </div>
        </div>

        <Card aria-labelledby="connections-add-loading-title">
          <CardHeader>
            <CardTitle id="connections-add-loading-title">Integration catalog</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-6 w-20" />
              </div>
              <Skeleton className="h-4 w-full max-w-lg" />
              <Skeleton className="h-8 w-28" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
