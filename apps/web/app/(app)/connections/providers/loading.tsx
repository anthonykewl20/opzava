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
        <div className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-10 w-full sm:w-[34rem]" />
            <Skeleton className="h-9 w-full sm:w-64" />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-stretch gap-4">
            {[0, 1, 2, 3].map((card) => (
              <div
                className="flex min-h-72 flex-col rounded-xl border border-border bg-card p-5"
                key={card}
              >
                <div className="flex items-start gap-3">
                  <Skeleton className="size-[38px] rounded-md" />
                  <div className="grid flex-1 gap-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-[22px] w-20 rounded-full" />
                </div>
                <div className="mt-6 grid gap-4">
                  <Skeleton className="h-[22px] w-28 rounded-full" />
                  <Skeleton className="h-[22px] w-44 rounded-full" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="mt-auto h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
