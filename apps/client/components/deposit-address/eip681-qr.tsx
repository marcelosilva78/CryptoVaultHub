"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface EIP681QRProps {
  address: string;
  chainId: number;
  size?: number;
}

/**
 * Real, scannable EIP-681 QR code.
 *
 * Encodes `ethereum:<address>@<chainId>` for non-mainnet chains and
 * `ethereum:<address>` for chainId=1. Compatible with MetaMask, Trust Wallet,
 * Coinbase Wallet, Rainbow, and other major mobile wallets.
 *
 * Unlike the legacy <QrCode> component (which renders a decorative pseudo-grid
 * that does NOT round-trip through a scanner), this uses the `qrcode` library
 * with error-correction level M so partial occlusion is tolerated.
 */
export function EIP681QR({ address, chainId, size = 140 }: EIP681QRProps) {
  const [svg, setSvg] = useState<string>("");

  const payload = chainId === 1
    ? `ethereum:${address}`
    : `ethereum:${address}@${chainId}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(payload, {
      type: "svg",
      width: size,
      margin: 2,
      color: { dark: "#0d0f14", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch(() => {
        if (!cancelled) setSvg("");
      });
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="bg-surface-elevated rounded-card p-3 border border-border-subtle">
        {svg ? (
          <div
            style={{ width: size, height: size }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div
            style={{ width: size, height: size }}
            className="flex items-center justify-center bg-white rounded-input"
          >
            <span className="text-micro text-text-muted">…</span>
          </div>
        )}
      </div>
      <span className="text-[9px] text-text-muted uppercase tracking-[0.08em] font-display">
        EIP-681 · scan to deposit
      </span>
      <code className="text-[9px] text-text-muted font-mono break-all max-w-[180px] text-center leading-snug">
        {payload}
      </code>
    </div>
  );
}
