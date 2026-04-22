import type { Category } from "../components/types";
import { gettingStartedArticles } from "./getting-started";
import { walletsArticles } from "./wallets";
import { transactionsArticles } from "./transactions";
import { depositsWithdrawalsArticles } from "./deposits-withdrawals";
import { projectsArticles } from "./projects";
import { coSignArticles } from "./co-sign";
import { integrationsArticles } from "./integrations";
import { securityArticles } from "./security";

export const categories: Category[] = [
  { slug: "getting-started", title: "Getting Started", description: "Primeiros passos e configuração inicial", icon: "Rocket", order: 1, articles: gettingStartedArticles },
  { slug: "wallets", title: "Wallets", description: "Criação, gerenciamento e operações com wallets", icon: "Wallet", order: 2, articles: walletsArticles },
  { slug: "transactions", title: "Transactions", description: "Enviar, receber e rastrear transações", icon: "ArrowLeftRight", order: 3, articles: transactionsArticles },
  { slug: "deposits-withdrawals", title: "Deposits & Withdrawals", description: "Depósitos, saques, limites e flush", icon: "ArrowDownToLine", order: 4, articles: depositsWithdrawalsArticles },
  { slug: "projects", title: "Projects", description: "Projetos, deploy e configuração multi-chain", icon: "FolderKanban", order: 5, articles: projectsArticles },
  { slug: "co-sign", title: "Co-Sign", description: "Assinatura colaborativa e aprovações", icon: "PenTool", order: 6, articles: coSignArticles },
  { slug: "integrations", title: "Integrations", description: "Webhooks, API keys e autenticação", icon: "Webhook", order: 7, articles: integrationsArticles },
  { slug: "security", title: "Security", description: "2FA, sessões e boas práticas de segurança", icon: "ShieldCheck", order: 8, articles: securityArticles },
];
