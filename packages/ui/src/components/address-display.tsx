import React, { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';

export interface AddressDisplayProps {
  /** Full blockchain address */
  address: string;
  /** Number of characters to show at the start (default: 6) */
  startChars?: number;
  /** Number of characters to show at the end (default: 4) */
  endChars?: number;
  /** Show copy button (default: true) */
  copyable?: boolean;
  /** Additional CSS class names */
  className?: string;
  /** Use monospace font (default: true) */
  mono?: boolean;
}

/**
 * AddressDisplay — truncated blockchain address with copy-to-clipboard.
 *
 * Renders a shortened address (e.g., 0x742d...f2a) with an optional
 * copy button that provides visual feedback on click.
 */
export function AddressDisplay({
  address,
  startChars = 6,
  endChars = 4,
  copyable = true,
  className,
  mono = true,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);

  const truncated =
    address.length > startChars + endChars + 3
      ? `${address.slice(0, startChars)}...${address.slice(-endChars)}`
      : address;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available in all contexts
    }
  }, [address]);

  return React.createElement(
    'span',
    {
      className: className,
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: mono ? 'var(--font-mono, ui-monospace, monospace)' : 'inherit',
        fontSize: 'inherit',
      },
      title: address,
    },
    React.createElement('span', null, truncated),
    copyable
      ? React.createElement(
          'button',
          {
            onClick: handleCopy,
            type: 'button',
            style: {
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              display: 'inline-flex',
              alignItems: 'center',
              color: copied
                ? 'var(--status-success, #059669)'
                : 'var(--text-muted, #9ca3af)',
              transition: 'color 150ms ease',
            },
            'aria-label': 'Copy address',
            title: copied ? 'Copied!' : 'Copy to clipboard',
          },
          copied
            ? React.createElement(Check, { size: 12 })
            : React.createElement(Copy, { size: 12 }),
        )
      : null,
  );
}
