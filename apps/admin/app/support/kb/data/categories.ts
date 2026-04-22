import type { Category } from "../components/types";

// Article imports will be added in Task 7 when data files are created
// import { clientsArticles } from "./clients";
// import { chainsArticles } from "./chains";
// import { tiersArticles } from "./tiers";
// import { complianceArticles } from "./compliance";
// import { monitoringArticles } from "./monitoring";
// import { analyticsArticles } from "./analytics";
// import { traceabilityArticles } from "./traceability";
// import { exportsArticles } from "./exports";
// import { settingsArticles } from "./settings";

export const categories: Category[] = [
  {
    slug: "clients",
    title: "Client Management",
    description: "Gerenciamento de clientes, tiers e permissões",
    icon: "Users",
    order: 1,
    articles: [], // Populated in Task 7
  },
  {
    slug: "chains",
    title: "Chains & Tokens",
    description: "Configuração de blockchains, tokens, gas tanks e RPC",
    icon: "Link",
    order: 2,
    articles: [],
  },
  {
    slug: "tiers",
    title: "Tiers & Limits",
    description: "Planos, limites de operação e rate limiting",
    icon: "Layers",
    order: 3,
    articles: [],
  },
  {
    slug: "compliance",
    title: "Compliance",
    description: "KYC/AML, políticas de conformidade e alertas",
    icon: "ShieldAlert",
    order: 4,
    articles: [],
  },
  {
    slug: "monitoring",
    title: "Monitoring",
    description: "Métricas, alertas, job queue e tracing",
    icon: "Activity",
    order: 5,
    articles: [],
  },
  {
    slug: "analytics",
    title: "Analytics",
    description: "Dashboards analíticos de operações e compliance",
    icon: "BarChart3",
    order: 6,
    articles: [],
  },
  {
    slug: "traceability",
    title: "Traceability",
    description: "Rastreamento detalhado de transações e artifacts",
    icon: "FileSearch",
    order: 7,
    articles: [],
  },
  {
    slug: "exports",
    title: "Exports & Audit",
    description: "Exportação de dados e log de auditoria",
    icon: "Download",
    order: 8,
    articles: [],
  },
  {
    slug: "settings",
    title: "Settings",
    description: "Configurações gerais, segurança e notificações",
    icon: "Settings",
    order: 9,
    articles: [],
  },
];
