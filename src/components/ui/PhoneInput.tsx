"use client";
/**
 * Phone number input with a country dialling-code picker.
 * The text box always holds the stored value: home-country numbers as typed, other countries
 * with their code in front ("+64 21 123 4567"). Picking a code rewrites that prefix.
 */
import { useState } from "react";
import { cx } from "@/lib/format";
import { DIAL_CODES, joinPhone, splitPhone } from "@/lib/phone";

const box =
  "rounded-md border border-ink-200 bg-white py-1.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function PhoneInput({
  name,
  label,
  defaultValue,
  value,
  onValueChange,
  defaultDial = "+61",
  placeholder,
  className,
}: {
  name: string;
  /** Accessible name of the number box, e.g. "Mobile". */
  label: string;
  defaultValue?: string | null;
  value?: string;
  onValueChange?: (v: string) => void;
  defaultDial?: string;
  placeholder?: string;
  className?: string;
}) {
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const v = controlled ? value : inner;
  const { dial, national } = splitPhone(v, defaultDial);
  const set = (nv: string) => {
    if (!controlled) setInner(nv);
    onValueChange?.(nv);
  };
  return (
    <div className={cx("flex min-w-0 gap-1.5", className)} data-phone={name}>
      <select
        aria-label="Country code"
        title="Country dialling code"
        value={dial}
        onChange={(e) => set(joinPhone(e.target.value, national, defaultDial))}
        className={cx(box, "w-[5.75rem] shrink-0 px-1.5")}
      >
        {DIAL_CODES.map((d) => (
          <option key={d.code} value={d.code} title={d.label}>
            {d.country} {d.code}
          </option>
        ))}
      </select>
      <input
        type="tel"
        name={name}
        aria-label={label}
        value={v}
        placeholder={placeholder}
        onChange={(e) => set(e.target.value)}
        className={cx(box, "block w-full min-w-0 px-2.5")}
      />
    </div>
  );
}

/** Labelled phone field (a div, not a <label>, so clicking the caption doesn't open the code picker). */
export function PhoneField({
  label,
  error,
  hint,
  className,
  ...p
}: Omit<Parameters<typeof PhoneInput>[0], "label" | "className"> & { label: string; error?: string; hint?: string; className?: string }) {
  return (
    <div className={cx("block", className, error && "[&_input]:border-red-400")}>
      <span className="mb-1 block text-xs font-medium text-ink-600">{label}</span>
      <PhoneInput label={label} {...p} />
      {hint && !error && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs text-red-600">{error}</span>}
    </div>
  );
}
