'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-page">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-status-error mb-4">Something went wrong</h2>
        <p className="text-text-muted mb-6">{error.message}</p>
        <button onClick={reset} className="px-4 py-2 bg-accent-primary text-accent-text rounded-button hover:bg-accent-hover">
          Try again
        </button>
      </div>
    </div>
  );
}
