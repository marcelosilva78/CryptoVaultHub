"use client";

export function QuoteBlock({
  text,
  author,
}: {
  text: string;
  author?: string;
}) {
  return (
    <blockquote className="mb-4 pl-4 border-l-[3px] border-accent-primary py-2">
      <p className="text-body text-text-secondary italic leading-relaxed">
        &ldquo;{text}&rdquo;
      </p>
      {author && (
        <cite className="block mt-2 text-caption text-text-muted not-italic">
          — {author}
        </cite>
      )}
    </blockquote>
  );
}
