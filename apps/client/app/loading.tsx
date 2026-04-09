export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-page">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-accent-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-text-muted text-sm">Loading...</p>
      </div>
    </div>
  );
}
