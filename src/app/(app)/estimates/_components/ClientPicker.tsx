"use client";
import { useId, useMemo, useRef, useState } from "react";
import { cx } from "@/lib/format";

export interface ClientOption {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  phone: string | null;
  address: string | null;
  cityTown: string | null;
  state: string | null;
  postcode: string | null;
  source: string | null;
}

/**
 * Type-ahead client field. Picking a suggestion sets the hidden `clientId`; typing a name that
 * isn't picked leaves clientId empty so the server creates a new client with that name.
 */
export function ClientPicker({
  clients,
  defaultClientId,
  defaultName,
  onPick,
  error,
}: {
  clients: ClientOption[];
  defaultClientId?: string | null;
  defaultName?: string | null;
  onPick?: (c: ClientOption | null) => void;
  error?: string;
}) {
  const [text, setText] = useState(defaultName ?? "");
  const [picked, setPicked] = useState<string | null>(defaultClientId ?? null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const q = text.trim().toLowerCase();
    const list = q ? clients.filter((c) => [c.name, c.email, c.cityTown].filter(Boolean).join(" ").toLowerCase().includes(q)) : clients;
    return list.slice(0, 8);
  }, [text, clients]);
  const exact = clients.find((c) => c.name.toLowerCase() === text.trim().toLowerCase());

  function choose(c: ClientOption) {
    setText(c.name);
    setPicked(c.id);
    setOpen(false);
    onPick?.(c);
  }

  const status = picked
    ? { tone: "text-brand-700", msg: "Linked to existing client" }
    : text.trim()
      ? exact
        ? { tone: "text-amber-700", msg: `“${exact.name}” already exists. Pick it from the list to link it, or keep typing to add a new client.` }
        : { tone: "text-ink-500", msg: "A new client will be created with this name." }
      : null;

  return (
    <div className="relative">
      <input type="hidden" name="clientId" value={picked ?? ""} />
      <input
        name="clientName"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Client"
        autoComplete="off"
        value={text}
        placeholder="Search clients or type a new name"
        onChange={(e) => {
          setText(e.target.value);
          if (picked) onPick?.(null);
          setPicked(null);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={(e) => {
          if (!open || !matches.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); choose(matches[hi]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={cx(
          "block w-full rounded-md border bg-white px-2.5 py-1.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2",
          error ? "border-red-400 focus:ring-red-500/20" : "border-ink-200 focus:border-brand-500 focus:ring-brand-500/20",
        )}
      />
      {open && matches.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-ink-200 bg-white py-1 shadow-lg">
          {matches.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); choose(c); }}
              onMouseEnter={() => setHi(i)}
              className={cx("cursor-pointer px-3 py-1.5 text-sm", i === hi ? "bg-brand-50 text-brand-800" : "text-ink-800")}
            >
              <div className="font-medium">{c.name}</div>
              {(c.email || c.cityTown) && <div className="text-xs text-ink-500">{[c.email, c.cityTown].filter(Boolean).join(" · ")}</div>}
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : status && <p className={cx("mt-1 text-xs", status.tone)}>{status.msg}</p>}
    </div>
  );
}
