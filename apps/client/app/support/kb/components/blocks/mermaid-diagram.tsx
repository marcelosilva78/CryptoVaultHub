"use client";

import { useEffect, useRef, useState } from "react";

export function MermaidDiagram({ chart }: { chart: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#E2A828",
            primaryTextColor: "#E8E9ED",
            primaryBorderColor: "#E2A828",
            lineColor: "#4E5364",
            secondaryColor: "#1A1D25",
            tertiaryColor: "#111318",
          },
        });
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Failed to render diagram",
          );
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error)
    return (
      <div className="mb-4 p-4 rounded-card bg-status-error-subtle border border-status-error text-body text-status-error">
        Diagram error: {error}
      </div>
    );

  return (
    <div
      ref={containerRef}
      className="mb-4 p-4 rounded-card bg-surface-card border border-border-subtle overflow-x-auto flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
