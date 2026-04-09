export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-page">
      <div className="flex flex-col items-center gap-4">
        {/* Hexagonal spinner */}
        <div className="relative w-12 h-12">
          <svg
            viewBox="0 0 48 48"
            className="w-12 h-12 animate-spin"
            style={{ animationDuration: "1.4s" }}
          >
            <polygon
              points="24,2 44,13 44,35 24,46 4,35 4,13"
              fill="none"
              stroke="var(--accent-primary)"
              strokeWidth="2"
              strokeDasharray="120"
              strokeDashoffset="30"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-text-muted text-body font-display">Loading...</p>
      </div>
    </div>
  );
}
