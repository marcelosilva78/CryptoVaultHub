"use client";

import dynamic from "next/dynamic";
import type { ContentBlock } from "./types";
import { Callout } from "./blocks/callout";
import { StepList } from "./blocks/step-list";
import { CodeBlock } from "./blocks/code-block";
import { ImageBlock } from "./blocks/image-block";
import { QuoteBlock } from "./blocks/quote-block";
import { TableBlock } from "./blocks/table-block";
import { VideoEmbed } from "./blocks/video-embed";
import { LinkCard } from "./blocks/link-card";

const MermaidDiagram = dynamic(
  () =>
    import("./blocks/mermaid-diagram").then((m) => m.MermaidDiagram),
  {
    ssr: false,
    loading: () => (
      <div className="mb-4 h-32 rounded-card bg-surface-card animate-pulse" />
    ),
  },
);

export function BlockRenderer({ blocks }: { blocks: ContentBlock[] }) {
  return (
    <div className="kb-content">
      {blocks.map((block, i) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p
                key={i}
                className="text-body text-text-secondary leading-relaxed mb-4"
              >
                {block.text}
              </p>
            );
          case "heading": {
            const Tag = `h${block.level}` as "h2" | "h3" | "h4";
            const headingId = block.text
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "");
            const sizes = {
              2: "text-heading",
              3: "text-subheading",
              4: "text-body font-semibold",
            };
            return (
              <Tag
                key={i}
                id={headingId}
                className={`${sizes[block.level]} text-text-primary mb-3 mt-6 scroll-mt-20`}
              >
                {block.text}
              </Tag>
            );
          }
          case "callout":
            return (
              <Callout
                key={i}
                variant={block.variant}
                title={block.title}
                text={block.text}
              />
            );
          case "steps":
            return <StepList key={i} items={block.items} />;
          case "code":
            return (
              <CodeBlock
                key={i}
                language={block.language}
                code={block.code}
                filename={block.filename}
              />
            );
          case "image":
            return (
              <ImageBlock
                key={i}
                src={block.src}
                alt={block.alt}
                caption={block.caption}
              />
            );
          case "quote":
            return (
              <QuoteBlock
                key={i}
                text={block.text}
                author={block.author}
              />
            );
          case "table":
            return (
              <TableBlock
                key={i}
                headers={block.headers}
                rows={block.rows}
              />
            );
          case "mermaid":
            return <MermaidDiagram key={i} chart={block.chart} />;
          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            return (
              <ListTag
                key={i}
                className={`mb-4 pl-5 space-y-1 text-body text-text-secondary ${block.ordered ? "list-decimal" : "list-disc"}`}
              >
                {block.items.map((item, j) => (
                  <li key={j} className="leading-relaxed">
                    {item}
                  </li>
                ))}
              </ListTag>
            );
          }
          case "divider":
            return <hr key={i} className="my-6 border-border-subtle" />;
          case "video":
            return (
              <VideoEmbed key={i} url={block.url} title={block.title} />
            );
          case "link-card":
            return (
              <LinkCard
                key={i}
                href={block.href}
                title={block.title}
                description={block.description}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
