"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";

interface QRCodeDisplayProps {
  address: string;
  chainId?: number;
  label?: string;
  network?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = { sm: 120, md: 160, lg: 200 };

/**
 * QR Code Display — generates a REAL scannable QR code using the `qrcode` library.
 *
 * The encoded value follows EIP-681 for EVM chains:
 *   ethereum:0x1234...abcd
 *
 * This is the standard format recognized by TrustWallet, MetaMask, Coinbase Wallet,
 * and all major mobile wallets.
 */
export function QRCodeDisplay({
  address,
  chainId,
  label,
  network,
  size = "md",
  className,
}: QRCodeDisplayProps) {
  const [svgContent, setSvgContent] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const px = sizeMap[size];

  useEffect(() => {
    // EIP-681 format: ethereum:<address>
    // For non-mainnet chains, append @chainId: ethereum:<address>@<chainId>
    let qrValue = address;
    if (address.startsWith("0x")) {
      if (chainId && chainId !== 1) {
        qrValue = `ethereum:${address}@${chainId}`;
      } else {
        qrValue = `ethereum:${address}`;
      }
    }

    QRCode.toString(qrValue, {
      type: "svg",
      width: px,
      margin: 2,
      color: { dark: "#0d0f14", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((svg) => setSvgContent(svg))
      .catch(() => {
        // Fallback: encode just the raw address
        QRCode.toString(address, {
          type: "svg",
          width: px,
          margin: 2,
          color: { dark: "#0d0f14", light: "#ffffff" },
          errorCorrectionLevel: "M",
        })
          .then((svg) => setSvgContent(svg))
          .catch(() => setSvgContent(""));
      });
  }, [address, chainId, px]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncatedAddr =
    address.length > 20
      ? `${address.slice(0, 10)}...${address.slice(-8)}`
      : address;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* QR Code */}
      <div className="bg-surface-elevated p-3 rounded-card border border-border-default">
        {svgContent ? (
          <div
            className="rounded-[4px] overflow-hidden"
            style={{ width: px, height: px }}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
        ) : (
          <div
            className="flex items-center justify-center bg-white rounded-[4px]"
            style={{ width: px, height: px }}
          >
            <span className="text-xs text-gray-400">Loading...</span>
          </div>
        )}
      </div>

      {/* Network badge */}
      {network && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-badge text-[10px] font-display font-semibold bg-surface-elevated border border-border-default text-accent-primary">
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

      {/* Address */}
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
            : "bg-surface-card text-text-secondary border border-border-default hover:border-accent-primary hover:text-text-primary",
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
