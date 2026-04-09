"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface LiveBalanceProps {
  balance: number;
  symbol: string;
  usdPrice?: number;
  polling?: boolean;
  onBalanceChange?: (newBalance: number) => void;
  className?: string;
}

export function LiveBalance({
  balance,
  symbol,
  usdPrice = 3245.67,
  polling = false,
  onBalanceChange,
  className,
}: LiveBalanceProps) {
  const [displayBalance, setDisplayBalance] = useState(balance);
  const [animating, setAnimating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const prevBalance = useRef(balance);

  // Animate balance changes
  useEffect(() => {
    if (balance !== prevBalance.current) {
      setAnimating(true);
      // Smooth number transition
      const start = prevBalance.current;
      const end = balance;
      const duration = 800;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayBalance(start + (end - start) * eased);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayBalance(end);
          setAnimating(false);
          prevBalance.current = end;
          onBalanceChange?.(end);
        }
      };

      requestAnimationFrame(animate);
      setLastUpdated(new Date());
    }
  }, [balance, onBalanceChange]);

  const usdValue = displayBalance * usdPrice;

  const formatBalance = (val: number) => {
    if (val === 0) return "0.00";
    return val.toFixed(6).replace(/\.?0+$/, (m) => {
      // Keep at least 2 decimal places
      const dots = m.includes(".") ? "" : ".";
      return val < 0.01 ? m : dots + "00".slice(0, Math.max(2 - (val.toFixed(6).split(".")[1]?.replace(/0+$/, "").length || 0), 0));
    });
  };

  const formattedBalance = displayBalance === 0
    ? "0.00"
    : displayBalance.toFixed(Math.max(2, 6 - Math.floor(Math.log10(Math.max(displayBalance, 0.000001))))).replace(/0+$/, "").replace(/\.$/, ".00");

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {/* Balance display */}
      <div className="flex items-baseline gap-2">
        <span
          className={cn(
            "text-[28px] font-bold tracking-[-0.03em] font-mono transition-colors duration-300",
            animating ? "text-cvh-green" : "text-cvh-text-primary"
          )}
        >
          {formattedBalance}
        </span>
        <span className="text-[14px] font-semibold text-cvh-text-secondary">
          {symbol}
        </span>
      </div>

      {/* USD estimate */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-cvh-text-muted font-mono">
          {usdValue > 0 ? `~$${usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00"} USD
        </span>
        {polling && (
          <span className="text-[10px] text-cvh-text-muted flex items-center gap-1">
            <span className="live-dot" />
            Live
          </span>
        )}
      </div>

      {/* Last updated + refresh */}
      <div className="flex items-center gap-2 mt-1">
        <span className="text-[9px] text-cvh-text-muted">
          Updated {lastUpdated.toLocaleTimeString()}
        </span>
        <button
          onClick={() => setLastUpdated(new Date())}
          className="text-cvh-text-muted hover:text-cvh-accent transition-colors cursor-pointer"
          title="Refresh"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {/* Pulsing indicator when waiting */}
      {polling && balance === 0 && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-cvh-accent/5 border border-cvh-accent/15 rounded-cvh">
          <div className="w-2 h-2 rounded-full bg-cvh-accent animate-pulse" />
          <span className="text-[10px] text-cvh-accent font-medium">
            Waiting for deposit...
          </span>
        </div>
      )}
    </div>
  );
}
