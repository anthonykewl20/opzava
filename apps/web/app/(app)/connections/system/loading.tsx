import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConnectionsSystemLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-5 w-52" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="grid gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-56" />
        </div>
      </div>
      {["System Core", "Channels", "Agents"].map((group) => (
        <section key={group} aria-label={`Loading ${group}`}>
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1].map((item) => (
              <Card key={item}>
                <CardHeader>
                  <Skeleton className="h-5 w-28" />
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
      <Card>
        <CardContent className="grid gap-4 p-5">
          {[0, 1, 2].map((row) => (
            <Skeleton className="h-11 w-full" key={row} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
