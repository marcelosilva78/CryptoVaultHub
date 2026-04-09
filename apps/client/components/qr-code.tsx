"use client";

interface QrCodeProps {
  value: string;
  size?: number;
}

/**
 * A simple deterministic QR-like pattern rendered as SVG.
 * This generates a visual placeholder that looks like a QR code
 * based on the input string hash. In production, use a proper
 * QR code library.
 */
export function QrCode({ value, size = 120 }: QrCodeProps) {
  const modules = 21;
  const cellSize = size / modules;

  // Simple hash function to generate deterministic pattern
  function hash(str: string, seed: number): number {
    let h = seed;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  // Generate module grid
  const grid: boolean[][] = [];
  for (let y = 0; y < modules; y++) {
    grid[y] = [];
    for (let x = 0; x < modules; x++) {
      // Finder patterns (top-left, top-right, bottom-left)
      const inFinderTL = x < 7 && y < 7;
      const inFinderTR = x >= modules - 7 && y < 7;
      const inFinderBL = x < 7 && y >= modules - 7;

      if (inFinderTL || inFinderTR || inFinderBL) {
        const fx = inFinderTR ? x - (modules - 7) : x;
        const fy = inFinderBL ? y - (modules - 7) : y;
        // Outer border
        if (fx === 0 || fx === 6 || fy === 0 || fy === 6) {
          grid[y][x] = true;
        }
        // Inner square
        else if (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4) {
          grid[y][x] = true;
        } else {
          grid[y][x] = false;
        }
      }
      // Timing patterns
      else if (x === 6) {
        grid[y][x] = y % 2 === 0;
      } else if (y === 6) {
        grid[y][x] = x % 2 === 0;
      }
      // Data area - deterministic from hash
      else {
        grid[y][x] = hash(value, y * modules + x) % 3 !== 0;
      }
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="rounded-[4px]"
    >
      <rect width={size} height={size} fill="#ffffff" rx={2} />
      {grid.map((row, y) =>
        row.map((cell, x) =>
          cell ? (
            <rect
              key={`${y}-${x}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill="#07080a"
            />
          ) : null
        )
      )}
    </svg>
  );
}
