import type { ServiceStatus, Incident } from "../../kb/components/types";

export const services: ServiceStatus[] = [
  { name: "API Gateway", status: "operational", description: "REST API principal e autenticação", uptime: "99.98%" },
  { name: "Database Cluster", status: "operational", description: "MySQL cluster de alta performance", uptime: "99.99%" },
  { name: "Blockchain Indexer", status: "operational", description: "Indexação de blocos e transações on-chain", uptime: "99.95%" },
  { name: "Job Queue", status: "operational", description: "Processamento assíncrono de tarefas", uptime: "99.97%" },
  { name: "Webhook Dispatcher", status: "operational", description: "Entrega de eventos via webhook", uptime: "99.96%" },
  { name: "Tracing (Jaeger)", status: "operational", description: "Distributed tracing e observabilidade", uptime: "99.90%" },
];

export const incidents: Incident[] = [
  { date: "2026-04-18", title: "Latência elevada no Blockchain Indexer", description: "Aumento de latência na indexação de blocos Ethereum devido a pico de volume na rede. Resolvido com ajuste de batch size e adição de RPC provider redundante.", status: "resolved", affectedServices: ["Blockchain Indexer"] },
  { date: "2026-04-10", title: "Manutenção programada — Database Cluster", description: "Atualização de versão do MySQL cluster com zero downtime. Failover automático executado com sucesso durante a janela de manutenção.", status: "resolved", affectedServices: ["Database Cluster"] },
];
