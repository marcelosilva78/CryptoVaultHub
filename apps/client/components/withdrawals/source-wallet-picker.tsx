"use client";

export type SourceWallet = "hot" | "gas_tank";

interface WalletInfo {
  address: string;
  balance: string;
}

interface Props {
  chainId: number;
  selected: SourceWallet;
  hot: WalletInfo | null;
  gasTank: WalletInfo | null;
  nativeSymbol: string;
  onChange: (next: SourceWallet) => void;
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

export function SourceWalletPicker({
  selected,
  hot,
  gasTank,
  nativeSymbol,
  onChange,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Card
        title="Hot Wallet"
        balance={hot?.balance ?? "—"}
        address={hot?.address ?? "0x…"}
        symbol={nativeSymbol}
        tags={["2-of-3 multisig", "native + ERC-20"]}
        active={selected === "hot"}
        onClick={() => onChange("hot")}
      />
      <Card
        title="Gas Tank"
        balance={gasTank?.balance ?? "—"}
        address={gasTank?.address ?? "0x…"}
        symbol={nativeSymbol}
        tags={["single-sig", "native only"]}
        active={selected === "gas_tank"}
        onClick={() => onChange("gas_tank")}
      />
    </div>
  );
}

interface CardProps {
  title: string;
  balance: string;
  address: string;
  symbol: string;
  tags: string[];
  active: boolean;
  onClick: () => void;
}

function Card({ title, balance, address, symbol, tags, active, onClick }: CardProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`text-left p-3 rounded-md border transition-colors ${
        active
          ? "border-[var(--accent-primary)] bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--accent-primary)]/10"
          : "border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--accent-primary)]/50"
      }`}
    >
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide">
        {title}
      </div>
      <div className="text-lg font-bold text-[var(--text-primary)] mt-1">
        {`${balance} ${symbol}`}
      </div>
      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{shortAddr(address)}</div>
      <div className="flex gap-1 mt-2 flex-wrap">
        {tags.map((t) => (
          <span
            key={t}
            className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
              active
                ? "bg-[var(--accent-primary)] text-[var(--bg-primary)] border-[var(--accent-primary)]"
                : "bg-[var(--bg-primary)] text-[var(--text-muted)] border-[var(--border-primary)]"
            }`}
          >
            {t}
          </span>
        ))}
      </div>
    </button>
  );
}
