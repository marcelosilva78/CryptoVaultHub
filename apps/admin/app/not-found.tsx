import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-page">
      <div className="text-center">
        <h1 className="text-[72px] font-extrabold text-text-muted font-display leading-none mb-2">
          404
        </h1>
        <p className="text-subheading text-text-secondary font-display mb-6">
          Page not found
        </p>
        <Link
          href="/"
          className="bg-accent-primary text-accent-text font-semibold text-body px-5 py-2.5 rounded-button hover:bg-accent-hover transition-colors duration-fast font-display inline-block"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
