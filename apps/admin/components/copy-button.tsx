"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Copy, Check } from "lucide-react";

type CopyButtonSize = "xs" | "sm" | "md";

interface CopyButtonProps {
  value: string;
  size?: CopyButtonSize;
  label?: string;
  className?: string;
}

const SIZE_MAP: Record<CopyButtonSize, { icon: string; padding: string; text: string }> = {
  xs: { icon: "w-2.5 h-2.5", padding: "p-1", text: "text-[9px]" },
  sm: { icon: "w-3 h-3", padding: "p-1.5", text: "text-[10px]" },
  md: { icon: "w-3.5 h-3.5", padding: "p-2", text: "text-caption" },
};

export function CopyButton({ value, size = "sm", label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    }
  }, [value]);

  const sizeConfig = SIZE_MAP[size];

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1 rounded-input border border-border-subtle transition-all duration-fast font-display",
        sizeConfig.padding,
        copied
          ? "border-status-success text-status-success bg-status-success-subtle"
          : "text-text-muted hover:text-text-primary hover:border-text-secondary hover:bg-surface-hover",
        className,
      )}
      title={copied ? "Copied!" : `Copy${label ? ` ${label}` : ""}`}
    >
      {copied ? (
        <Check className={sizeConfig.icon} />
      ) : (
        <Copy className={sizeConfig.icon} />
      )}
      {label && (
        <span className={cn("font-semibold", sizeConfig.text)}>
          {copied ? "Copied" : label}
        </span>
      )}
    </button>
  );
}
