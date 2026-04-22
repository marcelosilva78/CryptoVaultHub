"use client";

import { Info, Lightbulb, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  tip: {
    icon: Lightbulb,
    border: "border-l-status-success",
    bg: "bg-status-success-subtle",
    iconColor: "text-status-success",
    label: "Dica",
  },
  info: {
    icon: Info,
    border: "border-l-[#3b82f6]",
    bg: "bg-[rgba(59,130,246,0.1)]",
    iconColor: "text-[#3b82f6]",
    label: "Info",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-l-status-warning",
    bg: "bg-status-warning-subtle",
    iconColor: "text-status-warning",
    label: "Atenção",
  },
  danger: {
    icon: ShieldAlert,
    border: "border-l-status-error",
    bg: "bg-status-error-subtle",
    iconColor: "text-status-error",
    label: "Importante",
  },
};

export function Callout({
  variant,
  title,
  text,
}: {
  variant: "tip" | "warning" | "info" | "danger";
  title?: string;
  text: string;
}) {
  const v = variants[variant];
  const Icon = v.icon;
  return (
    <div className={cn("rounded-card border-l-[3px] p-4 mb-4", v.border, v.bg)}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", v.iconColor)} />
        <div>
          <div className={cn("text-body font-semibold mb-1", v.iconColor)}>
            {title ?? v.label}
          </div>
          <div className="text-body text-text-secondary leading-relaxed">
            {text}
          </div>
        </div>
      </div>
    </div>
  );
}
