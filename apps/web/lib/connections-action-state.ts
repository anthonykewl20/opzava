export interface ConnectionActionState {
  readonly status: "idle" | "pending" | "success" | "error";
  readonly message: string | null;
  readonly code: string | null;
  readonly providerId: string | null;
}

export const initialConnectionActionState: ConnectionActionState = {
  status: "idle",
  message: null,
  code: null,
  providerId: null,
};
