import React from 'react';

export interface AmountDisplayProps {
  /** Raw amount value (string or number) */
  amount: string | number;
  /** Token or currency symbol (e.g., "USDT", "ETH") */
  symbol?: string;
  /** Number of decimal places to show (default: auto-detect, max 8) */
  decimals?: number;
  /** Show the symbol before the amount (default: false / symbol after) */
  symbolFirst?: boolean;
  /** Use monospace font (default: true) */
  mono?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Color positive amounts green and negative red */
  colorize?: boolean;
}

/**
 * AmountDisplay — formatted crypto amount with optional symbol.
 *
 * Handles large numbers with proper thousand separators and configurable
 * decimal precision. Designed for displaying token amounts in tables
 * and detail views.
 */
export function AmountDisplay({
  amount,
  symbol,
  decimals,
  symbolFirst = false,
  mono = true,
  className,
  colorize = false,
}: AmountDisplayProps) {
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const isNegative = numericAmount < 0;

  // Determine decimal places
  let dp = decimals;
  if (dp === undefined) {
    const strAmount = String(amount);
    const dotIndex = strAmount.indexOf('.');
    if (dotIndex >= 0) {
      dp = Math.min(strAmount.length - dotIndex - 1, 8);
    } else {
      dp = 0;
    }
  }

  // Format the number
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    }).format(Math.abs(numericAmount));
  } catch {
    formatted = String(amount);
  }

  if (isNegative) {
    formatted = `-${formatted}`;
  }

  // Determine color
  let color: string | undefined;
  if (colorize) {
    if (isNegative) {
      color = 'var(--status-error, #dc2626)';
    } else if (numericAmount > 0) {
      color = 'var(--status-success, #059669)';
    }
  }

  const amountEl = React.createElement(
    'span',
    {
      style: {
        fontWeight: 500,
        color,
      },
    },
    formatted,
  );

  const symbolEl = symbol
    ? React.createElement(
        'span',
        {
          style: {
            fontSize: '0.85em',
            fontWeight: 600,
            opacity: 0.7,
            marginLeft: symbolFirst ? undefined : '3px',
            marginRight: symbolFirst ? '3px' : undefined,
          },
        },
        symbol,
      )
    : null;

  return React.createElement(
    'span',
    {
      className: className,
      style: {
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '0',
        fontFamily: mono ? 'var(--font-mono, ui-monospace, monospace)' : 'inherit',
        fontSize: 'inherit',
      },
    },
    symbolFirst ? symbolEl : null,
    amountEl,
    !symbolFirst ? symbolEl : null,
  );
}
