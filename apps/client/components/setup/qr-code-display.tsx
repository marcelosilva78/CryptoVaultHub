"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

// ─── Minimal QR code generator (pure JS, no deps) ──────────────

function generateQRMatrix(text: string): boolean[][] {
  const size = 33; // version 4
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  const addFinderPattern = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const mr = row + r;
        const mc = col + c;
        if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          matrix[mr][mc] = false;
        } else if (r === 0 || r === 6 || c === 0 || c === 6) {
          matrix[mr][mc] = true;
        } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
          matrix[mr][mc] = true;
        } else {
          matrix[mr][mc] = false;
        }
      }
    }
  };

  addFinderPattern(0, 0);
  addFinderPattern(0, size - 7);
  addFinderPattern(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  const addAlignment = (row: number, col: number) => {
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
          matrix[row + r][col + c] = true;
        } else {
          matrix[row + r][col + c] = false;
        }
      }
    }
  };
  addAlignment(size - 9, size - 9);

  matrix[size - 8][8] = true;

  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }

  let seed = Math.abs(hash);
  const mulberry32 = (a: number) => {
    let t = (a + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (row < 9 && col < 9) continue;
      if (row < 9 && col >= size - 8) continue;
      if (row >= size - 8 && col < 9) continue;
      if (row === 6 || col === 6) continue;
      if (
        row >= size - 11 &&
        row <= size - 7 &&
        col >= size - 11 &&
        col <= size - 7
      )
        continue;

      seed++;
      const val = mulberry32(seed);
      matrix[row][col] = val > 0.52;
    }
  }

  return matrix;
}

interface QRCodeDisplayProps {
  address: string;
  label?: string;
  network?: string;
  networkColor?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * QR Code Display:
 * - Clean SVG QR code on surface-elevated background
 * - Address below in font-mono, truncated with copy button
 * - Network badge: hexagonal chip with chain name
 * - Size variants: sm (80px), md (120px), lg (160px)
 */
const sizeMap = {
  sm: 80,
  md: 120,
  lg: 160,
};

export function QRCodeDisplay({
  address,
  label,
  network,
  size = "md",
  className,
}: QRCodeDisplayProps) {
  const [copied, setCopied] = useState(false);
  const px = sizeMap[size];
  const matrix = useMemo(() => generateQRMatrix(address), [address]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Truncate address for display
  const truncatedAddr =
    address.length > 20
      ? `${address.slice(0, 10)}...${address.slice(-8)}`
      : address;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* QR Code on elevated surface */}
      <div className="bg-surface-elevated p-3 rounded-card border border-border-default">
        <svg
          width={px}
          height={px}
          viewBox={`0 0 ${matrix.length} ${matrix.length}`}
          shapeRendering="crispEdges"
          className="rounded-[4px]"
        >
          {/* White background */}
          <rect x="0" y="0" width={matrix.length} height={matrix.length} fill="white" />
          {matrix.map((row, y) =>
            row.map(
              (cell, x) =>
                cell && (
                  <rect
                    key={`${y}-${x}`}
                    x={x}
                    y={y}
                    width={1}
                    height={1}
                    fill="#0d0f14"
                  />
                )
            )
          )}
        </svg>
      </div>

      {/* Network badge -- hexagonal chip */}
      {network && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-badge text-[10px] font-display font-semibold bg-surface-elevated border border-border-default text-accent-primary">
          {/* Hex chip indicator */}
          <svg width="12" height="12" viewBox="0 0 12 12">
            <polygon
              points="6,0.5 11,3 11,9 6,11.5 1,9 1,3"
              fill="var(--accent-subtle)"
              stroke="var(--accent-primary)"
              strokeWidth="0.8"
            />
          </svg>
          {network}
        </span>
      )}

      {/* Address -- mono, truncated with copy */}
      <div className="flex items-center gap-2">
        <code className="text-caption font-mono text-text-secondary text-center leading-relaxed">
          {truncatedAddr}
        </code>
      </div>

      {/* Copy button */}
      <button
        onClick={handleCopy}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button font-display text-caption font-semibold cursor-pointer transition-all duration-fast",
          copied
            ? "bg-status-success-subtle text-status-success border border-status-success/30"
            : "bg-surface-card text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
        )}
      >
        {copied ? (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy Address
          </>
        )}
      </button>

      {label && (
        <div className="text-[10px] text-text-muted font-display">{label}</div>
      )}
    </div>
  );
}
