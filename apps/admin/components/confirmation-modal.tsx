"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { X, AlertTriangle } from "lucide-react";

interface ConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** If true, the confirm button is red (destructive action) */
  destructive?: boolean;
  /** If provided, user must type this string to confirm */
  confirmText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
}

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  destructive = false,
  confirmText,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  loading = false,
}: ConfirmationModalProps) {
  const [typedText, setTypedText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset typed text when modal opens/closes
  useEffect(() => {
    if (open) {
      setTypedText("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const canConfirm = confirmText ? typedText === confirmText : true;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleOverlayClick}
    >
      <div className="bg-surface-card border border-border-subtle rounded-modal shadow-float w-full max-w-[420px] mx-4">
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-0">
          <div className="flex items-center gap-3">
            {destructive && (
              <div className="w-9 h-9 rounded-card bg-status-error-subtle flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4.5 h-4.5 text-status-error" />
              </div>
            )}
            <h3 className="font-display text-subheading text-text-primary">
              {title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-button text-text-muted hover:text-text-primary hover:bg-surface-hover transition-all duration-fast"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <div className="px-5 pt-3 pb-4">
          <p className="text-body text-text-secondary leading-relaxed">
            {description}
          </p>
        </div>

        {/* Type to confirm */}
        {confirmText && (
          <div className="px-5 pb-4">
            <label className="block text-caption text-text-muted mb-1.5 font-display">
              Type <span className="text-text-primary font-semibold">{confirmText}</span> to confirm
            </label>
            <input
              ref={inputRef}
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              className="w-full px-3 py-2 bg-surface-input border border-border-default rounded-input text-body text-text-primary outline-none focus:border-border-focus transition-colors duration-fast font-mono"
              placeholder={confirmText}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-button text-body font-display font-semibold text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-border-subtle transition-all duration-fast"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm || loading}
            className={cn(
              "px-4 py-2 rounded-button text-body font-display font-semibold transition-all duration-fast",
              destructive
                ? "bg-status-error text-white hover:bg-status-error/90 disabled:bg-status-error/30 disabled:text-white/50"
                : "bg-accent-primary text-accent-text hover:bg-accent-hover disabled:bg-accent-primary/30 disabled:text-accent-text/50",
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
