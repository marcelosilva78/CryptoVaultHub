"use client";

import { useMemo } from "react";
import { SCOPE_CATALOG, ALL_READ_SCOPES } from "@/lib/scope-catalog";

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

export function ScopePicker({ selected, onChange }: Props) {
  const groups = useMemo(() => {
    const out = new Map<string, typeof SCOPE_CATALOG>();
    for (const s of SCOPE_CATALOG) {
      const arr = out.get(s.group) ?? [];
      arr.push(s);
      out.set(s.group, arr);
    }
    return [...out.entries()];
  }, []);

  const readOnly =
    ALL_READ_SCOPES.every((s) => selected.includes(s)) &&
    selected.every((s) => ALL_READ_SCOPES.includes(s));

  const toggleReadOnly = () => {
    onChange(readOnly ? [] : [...ALL_READ_SCOPES]);
  };

  const toggle = (scope: string) => {
    if (readOnly) return;
    if (selected.includes(scope)) {
      onChange(selected.filter((s) => s !== scope));
    } else {
      onChange([...selected, scope]);
    }
  };

  const hasSensitive = selected.some(
    (s) => SCOPE_CATALOG.find((c) => c.scope === s)?.sensitivity === "sensitive",
  );

  return (
    <div>
      <label className="flex items-center gap-2 mb-3 cursor-pointer">
        <input
          type="checkbox"
          checked={readOnly}
          onChange={toggleReadOnly}
          style={{ accentColor: "var(--accent-primary)" }}
        />
        <span className="text-caption font-display font-semibold">
          Read-only key
        </span>
        <span className="text-micro text-text-muted">
          (selects every <code className="font-mono">*:read</code> at once and locks writes)
        </span>
      </label>

      {hasSensitive && (
        <div className="mb-3 p-2 rounded-card bg-status-warning-subtle border border-status-warning text-caption font-display">
          This key can move funds — combine with an IP allowlist on the next step.
        </div>
      )}

      <div className="grid gap-3">
        {groups.map(([group, scopes]) => (
          <div key={group} className="border border-border-subtle rounded-card p-3">
            <div className="text-caption font-semibold font-display mb-2">{group}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {scopes.map((s) => (
                <label
                  key={s.scope}
                  className={`flex items-start gap-2 p-2 rounded-input border cursor-pointer transition-colors duration-fast ${
                    selected.includes(s.scope)
                      ? "border-accent-primary bg-surface-card"
                      : "border-border-subtle hover:border-border-default"
                  } ${readOnly && !s.scope.endsWith(":read") ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(s.scope)}
                    onChange={() => toggle(s.scope)}
                    disabled={readOnly && !s.scope.endsWith(":read")}
                    style={{ accentColor: "var(--accent-primary)" }}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="font-mono text-micro text-text-primary flex items-center gap-1.5">
                      {s.scope}
                      {s.sensitivity === "sensitive" && (
                        <span title="Sensitive scope" aria-label="Sensitive scope" className="text-status-error">🛡</span>
                      )}
                    </div>
                    <div className="text-micro text-text-muted">{s.helper}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
