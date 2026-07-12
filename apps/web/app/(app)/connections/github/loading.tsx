import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function GitHubConnectionsLoading() {
  return (
    <div className="page connections-page" aria-busy="true" aria-live="polite">
      <div className="page-stack">
        <div className="page-header">
          <div>
            <h1>GitHub</h1>
            <p className="page-sub">Loading GitHub connection status...</p>
          </div>
        </div>

        <Card aria-labelledby="github-loading-title">
          <CardHeader>
            <CardTitle id="github-loading-title">GitHub</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {[0, 1, 2, 3].map((row) => (
              <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-4" key={row}>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-8 w-24" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
