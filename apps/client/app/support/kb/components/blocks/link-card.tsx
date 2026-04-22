"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function LinkCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="mb-4 block p-4 rounded-card border border-border-subtle hover:border-accent-primary hover:bg-accent-glow transition-all duration-fast group no-underline"
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-body font-semibold text-text-primary group-hover:text-accent-primary transition-colors">
            {title}
          </div>
          <div className="text-caption text-text-muted mt-1">
            {description}
          </div>
        </div>
        <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-accent-primary transition-colors flex-shrink-0" />
      </div>
    </Link>
  );
}
