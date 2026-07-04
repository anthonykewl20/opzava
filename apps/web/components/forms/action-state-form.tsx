"use client";

import { useActionState, type CSSProperties, type ReactNode } from "react";

import { initialFormActionState, type FormActionState } from "@/lib/action-state";

interface ActionStateFormProps {
  readonly action: (previousState: FormActionState, formData: FormData) => Promise<FormActionState>;
  readonly children: ReactNode;
  readonly className?: string;
  readonly errorTitle?: string;
  readonly style?: CSSProperties;
}

export function ActionStateForm({
  action,
  children,
  className,
  errorTitle = "Form needs attention",
  style,
}: ActionStateFormProps) {
  const [state, formAction] = useActionState(action, initialFormActionState);

  return (
    <form action={formAction} className={className} noValidate style={style}>
      {state.status === "error" && state.message !== undefined ? (
        <div className="sb-alert sb-alert--destructive" role="alert">
          <span className="ico" aria-hidden="true">
            !
          </span>
          <strong className="sb-alert-title">{errorTitle}</strong>
          <span className="sb-alert-desc">{state.message}</span>
        </div>
      ) : null}
      {children}
    </form>
  );
}
