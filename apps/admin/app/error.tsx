'use client';

import { AlertTriangle } from "lucide-react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-page">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-card bg-status-error-subtle flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-status-error" />
          </div>
        </div>
        <h2 className="text-heading font-bold text-text-primary font-display mb-2">
          Something went wrong
        </h2>
        <p className="text-body text-text-secondary font-display mb-6 max-w-sm mx-auto">
          {error.message}
        </p>
        <button
          onClick={reset}
          className="bg-accent-primary text-accent-text font-semibold text-body px-5 py-2.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
