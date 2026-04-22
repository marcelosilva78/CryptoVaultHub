import type { ServiceStatus, Incident } from "../../kb/components/types";

export const services: ServiceStatus[] = [
  { name: "API Gateway", status: "operational", description: "API REST e autenticação", uptime: "99.98%" },
  { name: "Wallet Service", status: "operational", description: "Criação e gerenciamento de wallets", uptime: "99.97%" },
  { name: "Transaction Engine", status: "operational", description: "Processamento de transações on-chain", uptime: "99.95%" },
  { name: "Webhook Delivery", status: "operational", description: "Entrega de eventos via webhook", uptime: "99.96%" },
  { name: "Co-Sign Service", status: "operational", description: "Assinatura colaborativa de transações", uptime: "99.94%" },
];

export const incidents: Incident[] = [
  { date: "2026-04-18", title: "Atraso em confirmações de depósito", description: "Confirmações de depósito na rede Ethereum apresentaram atraso devido a congestionamento da rede. Normalizado após 2 horas.", status: "resolved", affectedServices: ["Transaction Engine"] },
  { date: "2026-04-10", title: "Manutenção programada", description: "Atualização de infraestrutura com zero downtime. Nenhum impacto nas operações.", status: "resolved", affectedServices: ["API Gateway", "Wallet Service"] },
];
