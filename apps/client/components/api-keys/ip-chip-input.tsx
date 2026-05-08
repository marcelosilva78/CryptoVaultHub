"use client";

import { useState } from "react";
import { isValidIpOrCidr } from "@/lib/cidr";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function IpChipInput({ value, onChange, placeholder }: Props) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (!isValidIpOrCidr(trimmed)) {
      setErr(`"${trimmed}" is not a valid IP or CIDR`);
      return;
    }
    if (value.includes(trimmed)) {
      setErr(`"${trimmed}" already added`);
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
    setErr(null);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 p-2 bg-surface-input border border-border-default rounded-input min-h-[44px]">
        {value.map((ip) => (
          <span
            key={ip}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-button bg-surface-card border border-border-subtle text-text-primary font-mono text-micro"
          >
            {ip}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== ip))}
              aria-label={`Remove ${ip}`}
              className="text-text-muted hover:text-status-error"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Backspace" && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={placeholder ?? "Type IP or CIDR, then press Enter"}
          className="flex-1 min-w-[140px] bg-transparent outline-none font-mono text-body text-text-primary placeholder:text-text-muted"
        />
      </div>
      {err && (
        <p className="mt-1 text-micro text-status-error font-display">{err}</p>
      )}
      {value.length === 0 && !draft && !err && (
        <p className="mt-1 text-micro text-text-muted font-display">
          Empty list = any IP allowed.
        </p>
      )}
    </div>
  );
}
