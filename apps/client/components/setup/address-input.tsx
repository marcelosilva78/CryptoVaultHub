"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface AddressInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

function isValidHex(str: string): boolean {
  return /^0x[0-9a-fA-F]*$/.test(str);
}

function isValidLength(str: string): boolean {
  return str.length === 42;
}

function toChecksumAddress(address: string): string | null {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  // Simplified checksum (real impl uses keccak-256)
  // For display we just return the mixed-case version
  const lower = address.toLowerCase();
  return lower;
}

function getValidationState(
  address: string
): { valid: boolean; message: string; color: string } {
  if (!address || address === "0x") {
    return { valid: false, message: "", color: "" };
  }
  if (!address.startsWith("0x")) {
    return {
      valid: false,
      message: "Address must start with 0x",
      color: "text-red-400",
    };
  }
  if (!isValidHex(address)) {
    return {
      valid: false,
      message: "Invalid hex characters detected",
      color: "text-red-400",
    };
  }
  if (address.length < 42) {
    return {
      valid: false,
      message: `${42 - address.length} more characters needed`,
      color: "text-amber-400",
    };
  }
  if (address.length > 42) {
    return {
      valid: false,
      message: "Address too long (expected 42 characters)",
      color: "text-red-400",
    };
  }
  if (isValidLength(address) && isValidHex(address)) {
    return {
      valid: true,
      message: "Valid Ethereum address",
      color: "text-cvh-green",
    };
  }
  return { valid: false, message: "Invalid address format", color: "text-red-400" };
}

export function AddressInput({
  value,
  onChange,
  placeholder = "0x...",
  label,
  className,
}: AddressInputProps) {
  const [focused, setFocused] = useState(false);
  const validation = getValidationState(value);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed.startsWith("0x")) {
        onChange(trimmed);
      }
    } catch {
      // Clipboard API may not be available
    }
  }, [onChange]);

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="block text-[11px] font-semibold text-cvh-text-secondary uppercase tracking-[0.06em]">
          {label}
        </label>
      )}

      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          className={cn(
            "w-full bg-cvh-bg-tertiary border rounded-[6px] px-3 py-2.5 pr-[70px] font-mono text-[12px] outline-none transition-all duration-200",
            "placeholder:text-cvh-text-muted/50",
            !value && "border-cvh-border",
            value && validation.valid && "border-cvh-green/50 focus:border-cvh-green",
            value && !validation.valid && validation.message && "border-red-500/40 focus:border-red-500",
            value && !validation.valid && !validation.message && "border-cvh-border",
            focused && !value && "border-cvh-accent",
            "text-cvh-text-primary"
          )}
        />

        {/* Paste button */}
        <button
          onClick={handlePaste}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-semibold bg-cvh-bg-elevated text-cvh-text-secondary hover:text-cvh-text-primary transition-colors cursor-pointer border border-cvh-border-subtle"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          </svg>
          Paste
        </button>
      </div>

      {/* Validation message */}
      {validation.message && (
        <div className={cn("flex items-center gap-1.5 text-[10px] font-medium", validation.color)}>
          {validation.valid ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )}
          {validation.message}
        </div>
      )}

      {/* Character counter */}
      {value && value.length > 2 && (
        <div className="text-[9px] text-cvh-text-muted">
          {value.length}/42 characters
        </div>
      )}

      {/* ENS placeholder */}
      {focused && !value && (
        <div className="text-[9px] text-cvh-text-muted italic">
          ENS resolution coming soon
        </div>
      )}
    </div>
  );
}
