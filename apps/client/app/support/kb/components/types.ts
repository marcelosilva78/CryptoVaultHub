export type ContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "callout"; variant: "tip" | "warning" | "info" | "danger"; title?: string; text: string }
  | { type: "steps"; items: Array<{ title: string; description: string }> }
  | { type: "code"; language: string; code: string; filename?: string }
  | { type: "image"; src: string; alt: string; caption?: string }
  | { type: "quote"; text: string; author?: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "mermaid"; chart: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "divider" }
  | { type: "video"; url: string; title?: string }
  | { type: "link-card"; href: string; title: string; description: string };

export type Article = {
  slug: string;
  title: string;
  description: string;
  category: string;
  icon: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  updatedAt: string;
  readingTime: number;
  blocks: ContentBlock[];
};

export type Category = {
  slug: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  articles: Article[];
};

export type FaqEntry = {
  question: string;
  answer: string;
  category: string;
  tags: string[];
};

export type ChangelogEntry = {
  version: string;
  date: string;
  type: "feature" | "fix" | "improvement" | "breaking";
  title: string;
  description: string;
};

export type ServiceStatus = {
  name: string;
  status: "operational" | "degraded" | "outage" | "maintenance";
  description: string;
  uptime: string;
};

export type Incident = {
  date: string;
  title: string;
  description: string;
  status: "resolved" | "monitoring" | "identified" | "investigating";
  affectedServices: string[];
};

export type SearchEntry = {
  type: "article" | "faq" | "changelog";
  slug: string;
  category: string;
  title: string;
  description: string;
  tags: string[];
  textContent: string;
  href: string;
};
