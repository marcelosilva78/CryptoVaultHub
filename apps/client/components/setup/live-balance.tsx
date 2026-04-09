"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface LiveBalanceProps {
  balance: number;
  symbol: string;
  usdPrice?: number;
  polling?: boolean;
  onBalanceChange?: (newBalance: number) => void;
  className?: string;
}

/**
 * Heartbeat concept:
 * - Value in Outfit 800, 28px. Integer part full opacity, decimals 50% opacity.
 * - Digit change: slide animation (old digit slides up, new slides in from below, 300ms).
 * - 6px gold heartbeat circle, pulses opacity 100% -> 30% -> 100% every 5s.
 * - "Last updated: Xs ago" in text-muted, updates every second.
 * - Refresh button: on click, heartbeat does scale 1->1.5->1 in 200ms.
 */
export function LiveBalance({
  balance,
  symbol,
  usdPrice = 3245.67,
  polling = false,
  onBalanceChange,
  className,
}: LiveBalanceProps) {
  const [displayBalance, setDisplayBalance] = useState(balance);
  const [prevDigits, setPrevDigits] = useState<string>("");
  const [currentDigits, setCurrentDigits] = useState<string>("");
  const [isAnimating, setIsAnimating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [refreshPop, setRefreshPop] = useState(false);
  const prevBalance = useRef(balance);

  // Format balance into parts
  const formatBalance = useCallback((val: number): string => {
    if (val === 0) return "0.000000";
    return val.toFixed(6);
  }, []);

  // Animate balance changes with digit slide
  useEffect(() => {
    if (balance !== prevBalance.current) {
      const oldFormatted = formatBalance(prevBalance.current);
      const newFormatted = formatBalance(balance);
      setPrevDigits(oldFormatted);
      setCurrentDigits(newFormatted);
      setIsAnimating(true);

      // Smooth number transition
      const start = prevBalance.current;
      const end = balance;
      const duration = 800;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplayBalance(start + (end - start) * eased);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setDisplayBalance(end);
          setIsAnimating(false);
          prevBalance.current = end;
          onBalanceChange?.(end);
        }
      };

      requestAnimationFrame(animate);
      setLastUpdated(Date.now());
    }
  }, [balance, onBalanceChange, formatBalance]);

  // Update "seconds ago" every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const handleRefresh = () => {
    setLastUpdated(Date.now());
    setRefreshPop(true);
    setTimeout(() => setRefreshPop(false), 200);
  };

  const formatted = formatBalance(displayBalance);
  const dotIndex = formatted.indexOf(".");
  const integerPart = dotIndex >= 0 ? formatted.slice(0, dotIndex) : formatted;
  const decimalPart = dotIndex >= 0 ? formatted.slice(dotIndex) : "";

  const usdValue = displayBalance * usdPrice;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {/* Balance display with digit slide */}
      <div className="flex items-baseline gap-2">
        <div className="flex items-baseline">
          {/* Integer part: full opacity, Outfit 800, 28px */}
          <span className="text-[28px] font-extrabold tracking-[-0.03em] font-display text-text-primary">
            {integerPart}
          </span>
          {/* Decimal part: Outfit 400, 50% opacity */}
          <span className="text-[28px] font-normal tracking-[-0.03em] font-display text-text-primary opacity-50">
            {decimalPart}
          </span>
        </div>

        {/* Token symbol */}
        <span className="text-[14px] font-display text-text-muted">
          {symbol}
        </span>

        {/* Heartbeat indicator: 6px gold circle, pulses opacity */}
        <span
          className={cn(
            "w-[6px] h-[6px] rounded-pill bg-accent-primary animate-pulse-gold ml-1",
            refreshPop && "animate-refresh-pop"
          )}
        />
      </div>

      {/* USD estimate */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-text-muted font-mono">
          {usdValue > 0
            ? `~$${usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : "$0.00"}{" "}
          USD
        </span>
        {polling && (
          <span className="flex items-center gap-1">
            <span className="w-[5px] h-[5px] rounded-pill bg-accent-primary animate-pulse-gold" />
            <span className="text-[10px] text-accent-primary font-display font-semibold">Live</span>
          </span>
        )}
      </div>

      {/* Last updated + refresh */}
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-text-muted font-display">
          Last updated: {secondsAgo}s ago
        </span>
        <button
          onClick={handleRefresh}
          className="text-text-muted hover:text-accent-primary transition-colors duration-fast cursor-pointer"
          title="Refresh"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={cn(refreshPop && "animate-refresh-pop")}
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {/* Waiting for deposit indicator */}
      {polling && balance === 0 && (
        <div className="flex items-center gap-2 mt-1.5 px-3 py-2 bg-accent-subtle border border-accent-primary/15 rounded-input">
          <span className="w-2 h-2 rounded-pill bg-accent-primary animate-pulse-gold" />
          <span className="text-[10px] text-accent-primary font-display font-medium">
            Waiting for deposit...
          </span>
        </div>
      )}
    </div>
  );
}
