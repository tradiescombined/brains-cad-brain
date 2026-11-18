"use client";
/**
 * Form wrapper for Server Actions that return an ActionState.
 * Keeps the user's input on validation errors (no automatic form reset), shows a status line,
 * and exposes per-field errors to <FieldError name="…"/>.
 */
import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type ReactNode } from "react";
import { cx } from "@/lib/format";
import type { ActionState } from "./action-state";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const Ctx = createContext<{ state: ActionState; pending: boolean }>({ state: {}, pending: false });

export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  onSuccess,
  id,
  "aria-label": ariaLabel,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
  id?: string;
  "aria-label"?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });
  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    onSuccessRef.current?.();
  }, [state.ts, state.ok, resetOnSuccess]);
  return (
    <Ctx.Provider value={{ state, pending }}>
      <form
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        className={className}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (submitter?.name) fd.set(submitter.name, submitter.value);
          startTransition(() => formAction(fd));
        }}
      >
        {children}
      </form>
    </Ctx.Provider>
  );
}

export function useActionFormState() {
  return useContext(Ctx);
}

/** Inline error text for one field. */
export function FieldError({ name }: { name: string }) {
  const { state } = useContext(Ctx);
  const msg = state.fieldErrors?.[name];
  if (!msg) return null;
  return <span role="alert" className="mt-1 block text-xs text-red-600">{msg}</span>;
}

/** Status line + submit button row. */
export function FormFooter({ label = "Save changes", pendingLabel = "Saving…", extra, className }: { label?: string; pendingLabel?: string; extra?: ReactNode; className?: string }) {
  const { pending } = useContext(Ctx);
  return (
    <div className={cx("flex flex-wrap items-center justify-end gap-3", className)}>
      <FormStatus />
      {extra}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md border border-transparent bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-xs hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}

export function FormStatus() {
  const { state, pending } = useContext(Ctx);
  if (pending) return null;
  if (state.error) return <span role="alert" className="mr-auto text-sm text-red-600">{state.error}</span>;
  if (state.ok) return <span role="status" className="mr-auto text-sm text-emerald-700">✓ {state.ok}</span>;
  return null;
}
