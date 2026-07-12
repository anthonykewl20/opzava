import { relativeTime } from "@/app/(app)/connections/_lib/page-data";

export type ConnectionsNotice =
  | { readonly kind: "health-check-complete" }
  | { readonly kind: "health-check-error" }
  | { readonly kind: "connection-action-error"; readonly providerId?: string }
  | { readonly kind: "operator-admin-required"; readonly providerId?: string };

export function noticeFromSearchParams(
  params:
    | {
        readonly notice?: string;
        readonly provider?: string;
      }
    | undefined,
): ConnectionsNotice | null {
  if (params?.notice === "health-check-complete") {
    return { kind: "health-check-complete" };
  }

  if (params?.notice === "health-check-error") {
    return { kind: "health-check-error" };
  }

  if (params?.notice === "operator-admin-required") {
    return {
      kind: "operator-admin-required",
      ...(params.provider === undefined ? {} : { providerId: params.provider }),
    };
  }

  if (params?.notice === "connection-action-error") {
    return {
      kind: "connection-action-error",
      ...(params.provider === undefined ? {} : { providerId: params.provider }),
    };
  }

  return null;
}

export function PageNotice({
  notice,
  refreshedAt,
}: {
  readonly notice: ConnectionsNotice | null;
  readonly refreshedAt: string;
}) {
  if (notice === null) {
    return null;
  }

  if (notice.kind === "operator-admin-required") {
    return (
      <div className="connections-notice connections-notice-warning" role="alert">
        <span className="dot dot-warning" aria-hidden="true" />
        <div>
          <strong>Admin device required.</strong>
          <p className="hint">
            Pair or upgrade an operator.admin device before changing provider credentials
            {notice.providerId === undefined ? "." : ` for ${notice.providerId}.`}
          </p>
        </div>
      </div>
    );
  }

  if (notice.kind === "connection-action-error") {
    return (
      <div className="connections-notice connections-notice-danger" role="alert">
        <span className="dot dot-danger" aria-hidden="true" />
        <div>
          <strong>Connection action could not complete.</strong>
          <p className="hint">
            Showing the latest available connection snapshot
            {notice.providerId === undefined ? "." : ` for ${notice.providerId}.`}
          </p>
        </div>
      </div>
    );
  }

  if (notice.kind === "health-check-error") {
    return (
      <div className="connections-notice connections-notice-danger" role="alert">
        <span className="dot dot-danger" aria-hidden="true" />
        <div>
          <strong>Health check could not complete.</strong>
          <p className="hint">Showing the latest available connection snapshot.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="connections-notice" role="status">
      <span className="dot dot-success" aria-hidden="true" />
      <div>
        <strong>Health check complete.</strong>
        <p className="hint">Snapshot updated {relativeTime(refreshedAt)}.</p>
      </div>
    </div>
  );
}
