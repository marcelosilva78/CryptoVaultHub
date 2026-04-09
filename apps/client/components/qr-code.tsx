"use client";

import { useState } from "react";

interface QrCodeProps {
  value: string;
  size?: number;
  showAddress?: boolean;
}

/**
 * Clean SVG-based QR code with surface-elevated background.
 * Includes optional address display and copy button below.
 */
export function QrCode({ value, size = 120, showAddress = false }: QrCodeProps) {
  const [copied, setCopied] = useState(false);
  const modules = 21;
  const cellSize = size / modules;

  function hash(str: string, seed: number): number {
    let h = seed;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  const grid: boolean[][] = [];
  for (let y = 0; y < modules; y++) {
    grid[y] = [];
    for (let x = 0; x < modules; x++) {
      const inFinderTL = x < 7 && y < 7;
      const inFinderTR = x >= modules - 7 && y < 7;
      const inFinderBL = x < 7 && y >= modules - 7;

      if (inFinderTL || inFinderTR || inFinderBL) {
        const fx = inFinderTR ? x - (modules - 7) : x;
        const fy = inFinderBL ? y - (modules - 7) : y;
        if (fx === 0 || fx === 6 || fy === 0 || fy === 6) {
          grid[y][x] = true;
        } else if (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4) {
          grid[y][x] = true;
        } else {
          grid[y][x] = false;
        }
      } else if (x === 6) {
        grid[y][x] = y % 2 === 0;
      } else if (y === 6) {
        grid[y][x] = x % 2 === 0;
      } else {
        grid[y][x] = hash(value, y * modules + x) % 3 !== 0;
      }
    }
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {/* QR container with elevated surface */}
      <div className="bg-surface-elevated rounded-card p-3 border border-border-subtle">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="rounded-input"
        >
          <rect width={size} height={size} fill="#ffffff" rx={4} />
          {grid.map((row, y) =>
            row.map((cell, x) =>
              cell ? (
                <rect
                  key={`${y}-${x}`}
                  x={x * cellSize}
                  y={y * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill="#08090B"
                />
              ) : null
            )
          )}
        </svg>
      </div>

      {/* Address + copy below QR */}
      {showAddress && (
        <div className="flex flex-col items-center gap-1.5 max-w-full">
          <div className="font-mono text-code text-accent-primary break-all text-center px-1 max-w-[200px]">
            {value.length > 20 ? `${value.slice(0, 10)}...${value.slice(-8)}` : value}
          </div>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-input font-display text-micro font-semibold cursor-pointer transition-colors bg-transparent text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary"
          >
            {copied ? (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-status-success">Copied!</span>
              </>
            ) : (
              <>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
