"use client";
/** Client helpers for the jobs module: validated action forms, modal forms, print button. */
import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/client";
import { cx } from "@/lib/format";
import { btn } from "./bits";

import type { ActionResult } from "./constants";
export type { ActionResult };
export type FormAction = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/** <form> bound to a server action returning {ok, error}. Shows the error inline; calls onDone on success. */
export function ActionForm({
  action,
  children,
  onDone,
  className,
  successText,
  id,
}: {
  action: FormAction;
  children: ReactNode;
  onDone?: () => void;
  className?: string;
  successText?: string;
  id?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (state?.ok) done.current?.();
  }, [state]);
  return (
    <form
      action={formAction}
      // Submit manually so React doesn't reset the fields when the server returns a validation error.
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}
      className={cx(className, pending && "pointer-events-none opacity-70")}
      aria-busy={pending}
      id={id}
    >
      {state?.error && (
        <p role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state?.ok && successText && (
        <p role="status" className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successText}
        </p>
      )}
      {children}
    </form>
  );
}

/** Trigger button + modal containing an ActionForm that closes on success. */
export function ModalForm({
  title,
  action,
  trigger,
  triggerClassName,
  children,
  wide,
}: {
  title: string;
  action: FormAction;
  trigger: ReactNode;
  triggerClassName?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Modal
      title={title}
      wide={wide}
      trigger={(open) => (
        <button type="button" onClick={open} className={triggerClassName ?? btn("primary")}>
          {trigger}
        </button>
      )}
    >
      {(close) => (
        <ActionForm action={action} onDone={close} className="space-y-3">
          {children}
        </ActionForm>
      )}
    </Modal>
  );
}

/**
 * Two-step delete button (inline confirm, no browser dialog). Unlike the shared ConfirmButton, the
 * armed and unarmed states are distinct elements (keyed), so the first click can never submit.
 */
export function ConfirmSubmit({ children, confirmText = "Are you sure?", className }: { children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return armed ? (
    <button key="confirm" type="submit" className={cx("rounded-md border border-red-300 bg-red-600 px-3 py-1.5 text-sm font-medium text-white", className)}>
      {confirmText}
    </button>
  ) : (
    <button key="arm" type="button" onClick={() => setArmed(true)} className={cx("rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50", className)}>
      {children}
    </button>
  );
}

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={btn("secondary")}>
      {label}
    </button>
  );
}
