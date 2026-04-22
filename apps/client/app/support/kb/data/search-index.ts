import type { SearchEntry, ContentBlock } from "../components/types";
import { categories } from "./categories";

function extractText(blocks: ContentBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
        case "quote":
          return block.text;
        case "heading":
          return block.text;
        case "callout":
          return `${block.title ?? ""} ${block.text}`;
        case "steps":
          return block.items
            .map((s) => `${s.title} ${s.description}`)
            .join(" ");
        case "code":
          return block.code;
        case "list":
          return block.items.join(" ");
        case "table":
          return [...block.headers, ...block.rows.flat()].join(" ");
        case "link-card":
          return `${block.title} ${block.description}`;
        default:
          return "";
      }
    })
    .join(" ");
}

export function buildSearchIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];

  for (const category of categories) {
    for (const article of category.articles) {
      entries.push({
        type: "article",
        slug: article.slug,
        category: category.title,
        title: article.title,
        description: article.description,
        tags: article.tags,
        textContent: extractText(article.blocks),
        href: `/support/kb/${category.slug}/${article.slug}`,
      });
    }
  }

  return entries;
}
