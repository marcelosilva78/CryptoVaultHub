import React from 'react';

export type StatusBadgeVariant = 'success' | 'error' | 'warning' | 'accent' | 'neutral';

export interface StatusBadgeProps {
  /** Visual variant controlling colors */
  variant: StatusBadgeVariant;
  /** Badge content */
  children: React.ReactNode;
  /** Show a small dot indicator before the label */
  dot?: boolean;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Maps status strings to badge variants. Covers common status values
 * used across CryptoVaultHub entities.
 */
const statusVariantMap: Record<string, StatusBadgeVariant> = {
  active: 'success',
  confirmed: 'success',
  completed: 'success',
  success: 'success',
  synced: 'success',
  enabled: 'success',
  healthy: 'success',

  pending: 'warning',
  processing: 'warning',
  cooldown: 'warning',
  retrying: 'warning',
  draining: 'warning',

  failed: 'error',
  error: 'error',
  blocked: 'error',
  suspended: 'error',
  unhealthy: 'error',
  disabled: 'error',

  onboarding: 'accent',
  review: 'accent',
  acknowledged: 'accent',

  unknown: 'neutral',
  standby: 'neutral',
};

/**
 * Resolve a status string to a badge variant.
 */
export function resolveStatusVariant(status: string): StatusBadgeVariant {
  return statusVariantMap[status.toLowerCase()] ?? 'neutral';
}

/**
 * CSS class maps for each variant.
 * Uses the CVH design-system CSS variables.
 */
const variantStyles: Record<StatusBadgeVariant, string> = {
  success: 'background-color: var(--status-success-subtle, #d1fae5); color: var(--status-success, #059669);',
  error: 'background-color: var(--status-error-subtle, #fee2e2); color: var(--status-error, #dc2626);',
  warning: 'background-color: var(--status-warning-subtle, #fef3c7); color: var(--status-warning, #d97706);',
  accent: 'background-color: var(--accent-subtle, #ede9fe); color: var(--accent-primary, #7c3aed);',
  neutral: 'background-color: var(--surface-elevated, #f3f4f6); color: var(--text-secondary, #6b7280);',
};

const dotStyles: Record<StatusBadgeVariant, string> = {
  success: 'background-color: var(--status-success, #059669);',
  error: 'background-color: var(--status-error, #dc2626);',
  warning: 'background-color: var(--status-warning, #d97706);',
  accent: 'background-color: var(--accent-primary, #7c3aed);',
  neutral: 'background-color: var(--text-muted, #9ca3af);',
};

/**
 * StatusBadge — a colored badge for status values.
 *
 * Works with or without Tailwind. When Tailwind/CVH design tokens are
 * available, the CSS variables will resolve correctly. Fallback hex
 * values are provided for standalone usage.
 */
export function StatusBadge({ variant, children, dot, className }: StatusBadgeProps) {
  return React.createElement(
    'span',
    {
      className: className,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: 1,
        ...(parseInlineStyle(variantStyles[variant])),
      },
    },
    dot
      ? React.createElement('span', {
          style: {
            width: '6px',
            height: '6px',
            borderRadius: '9999px',
            display: 'inline-block',
            ...(parseInlineStyle(dotStyles[variant])),
          },
        })
      : null,
    children,
  );
}

/** Utility: parse a CSS string into a React style object */
function parseInlineStyle(css: string): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const [prop, val] = decl.split(':').map((s) => s.trim());
    if (prop && val) {
      const camelProp = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      style[camelProp] = val;
    }
  }
  return style as React.CSSProperties;
}
