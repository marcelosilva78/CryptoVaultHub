import type { Article } from "../components/types";

export const monitoringArticles: Article[] = [
  {
    slug: "dashboard-metricas",
    title: "Dashboard de Métricas",
    description:
      "Visão geral do dashboard de métricas do sistema com gráficos em tempo real.",
    category: "monitoring",
    icon: "Activity",
    difficulty: "beginner",
    tags: ["dashboard", "métricas", "monitoramento", "grafana"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Dashboard de Métricas em Tempo Real",
      },
      {
        type: "paragraph",
        text: "O dashboard de métricas oferece visibilidade completa sobre a saúde e performance de todos os componentes do CryptoVaultHub. As métricas são coletadas via Prometheus e visualizadas em painéis customizados integrados diretamente no admin panel, sem necessidade de acessar ferramentas externas.",
      },
      {
        type: "heading",
        level: 3,
        text: "Painéis Disponíveis",
      },
      {
        type: "table",
        headers: ["Painel", "Métricas Principais", "Refresh Rate"],
        rows: [
          ["System Overview", "CPU, memória, disco, network de todos os serviços", "10s"],
          ["API Performance", "Latência P50/P95/P99, throughput, error rate", "5s"],
          ["Blockchain Sync", "Block lag, sync speed, reorgs por chain", "15s"],
          ["Transaction Pipeline", "Transações pendentes, processadas, falhas", "5s"],
          ["Gas Tanks", "Saldo, consumo, projeção de esgotamento", "30s"],
          ["Client Activity", "Clientes ativos, API calls, transações por tier", "30s"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Dados históricos",
        text: "As métricas são retidas por 90 dias com resolução de 15 segundos nos primeiros 7 dias, 1 minuto nos primeiros 30 dias e 5 minutos nos demais. Para análises de longo prazo, use o módulo de Analytics.",
      },
      {
        type: "heading",
        level: 3,
        text: "Métricas Críticas para Custódia",
      },
      {
        type: "paragraph",
        text: "Em uma plataforma de custódia, certas métricas são especialmente críticas e devem ser monitoradas continuamente. Qualquer desvio nesses indicadores pode significar perda financeira ou falha operacional.",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Transaction Confirmation Time: tempo entre submissão e confirmação on-chain",
          "Balance Reconciliation Delta: diferença entre saldo calculado e saldo on-chain",
          "Hot Wallet Exposure: valor total em hot wallets vs. cold storage",
          "Failed Transaction Rate: percentual de transações que falharam",
          "RPC Provider Latency: latência de comunicação com blockchains",
          "Webhook Delivery Rate: percentual de webhooks entregues com sucesso",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Personalizando o Dashboard",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar configurações do dashboard",
            description:
              "Clique no ícone de engrenagem no canto superior direito do dashboard para acessar o modo de edição.",
          },
          {
            title: "Adicionar ou reorganizar painéis",
            description:
              "Arraste painéis para reorganizar ou clique em 'Add Panel' para adicionar novas métricas. Mais de 200 métricas estão disponíveis.",
          },
          {
            title: "Configurar alertas visuais",
            description:
              "Defina thresholds visuais (verde/amarelo/vermelho) para cada métrica, facilitando a identificação rápida de problemas.",
          },
          {
            title: "Salvar layout",
            description:
              "Salve seu layout personalizado. Cada administrador pode ter seu próprio layout sem afetar os demais.",
          },
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Crie um dashboard dedicado para monitoria de plantão com apenas as métricas mais críticas em tamanho grande. Ideal para exibir em um monitor dedicado na sala de operações.",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/configurar-alertas",
        title: "Configurar Alertas",
        description:
          "Configure alertas automáticos baseados nas métricas do dashboard",
      },
    ],
  },
  {
    slug: "configurar-alertas",
    title: "Configurar Alertas",
    description:
      "Como configurar alertas automáticos para monitoramento proativo do sistema.",
    category: "monitoring",
    icon: "Bell",
    difficulty: "intermediate",
    tags: ["alertas", "configuração", "notificações", "monitoramento"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Sistema de Alertas",
      },
      {
        type: "paragraph",
        text: "O sistema de alertas monitora continuamente todas as métricas da plataforma e dispara notificações quando condições pré-definidas são atingidas. Alertas bem configurados são a diferença entre identificar um problema em minutos ou horas.",
      },
      {
        type: "heading",
        level: 3,
        text: "Canais de Notificação",
      },
      {
        type: "table",
        headers: ["Canal", "Uso Recomendado", "Latência"],
        rows: [
          ["Slack", "Alertas info e warning para equipe técnica", "< 2s"],
          ["E-mail", "Alertas medium e relatórios diários", "< 30s"],
          ["SMS", "Alertas critical fora do horário comercial", "< 10s"],
          ["Webhook", "Integração com sistemas externos (PagerDuty, OpsGenie)", "< 5s"],
          ["Dashboard", "Todos os alertas com histórico visual", "Tempo real"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Criando um Alerta",
      },
      {
        type: "steps",
        items: [
          {
            title: "Definir condição",
            description:
              "Selecione a métrica, operador (>, <, ==, !=) e valor threshold. Ex: 'api_latency_p99 > 2000ms'.",
          },
          {
            title: "Configurar janela de avaliação",
            description:
              "Defina por quanto tempo a condição precisa persistir antes de disparar. Ex: 'por mais de 5 minutos'. Isso evita alertas por spikes momentâneos.",
          },
          {
            title: "Selecionar severidade e canais",
            description:
              "Escolha a severidade (info, warning, critical) e os canais de notificação. Severidades maiores devem usar canais mais intrusivos.",
          },
          {
            title: "Definir ações automáticas (opcional)",
            description:
              "Configure ações que o sistema executará automaticamente: escalar, pausar operações, acionar runbook, etc.",
          },
          {
            title: "Testar e ativar",
            description:
              "Envie uma notificação de teste para validar os canais. Após confirmação, ative o alerta.",
          },
        ],
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "alert_name": "High API Latency",\n  "metric": "http_request_duration_seconds",\n  "condition": {\n    "percentile": "p99",\n    "operator": ">",\n    "threshold": 2.0,\n    "for": "5m"\n  },\n  "labels": {\n    "severity": "warning",\n    "team": "platform"\n  },\n  "notifications": [\n    { "channel": "slack", "webhook": "#alerts-platform" },\n    { "channel": "email", "recipients": ["platform-team@vaulthub.live"] }\n  ],\n  "runbook_url": "https://docs.vaulthub.live/runbooks/high-latency"\n}',
        filename: "alert-config.json",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Evite alert fatigue! Configure thresholds adequados e use janelas de avaliação para evitar alertas por flutuações normais. Revise mensalmente os alertas que nunca disparam (podem estar com threshold muito alto) e os que disparam demais (threshold muito sensível).",
      },
      {
        type: "paragraph",
        text: "O histórico de alertas é mantido por 1 ano e inclui: quando disparou, quando resolveu, quem reconheceu, ações tomadas e tempo de resolução. Essas métricas alimentam relatórios de SLA e post-mortems.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use alert grouping para agrupar alertas relacionados. Ex: se a chain Ethereum está com sync lag, não dispare alertas separados para latência, saldo desatualizado e webhook delay — agrupe tudo como 'Ethereum Sync Degraded'.",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/job-queue",
        title: "Job Queue",
        description:
          "Monitore filas de processamento e configure alertas de backlog",
      },
    ],
  },
  {
    slug: "job-queue",
    title: "Job Queue",
    description:
      "Gerenciamento e monitoramento de filas de processamento assíncrono.",
    category: "monitoring",
    icon: "ListOrdered",
    difficulty: "intermediate",
    tags: ["jobs", "filas", "queue", "processamento", "BullMQ"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Job Queue Management",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub utiliza BullMQ (Redis-backed) para processamento assíncrono de tarefas. Operações como submissão de transações on-chain, reconciliação de saldos, geração de relatórios e envio de webhooks são executadas via job queue, garantindo resiliência e capacidade de retry.",
      },
      {
        type: "heading",
        level: 3,
        text: "Filas Principais",
      },
      {
        type: "table",
        headers: ["Fila", "Função", "Concorrência", "Retry Policy"],
        rows: [
          ["tx-submission", "Submissão de transações on-chain", "10", "3x com backoff exponencial"],
          ["tx-confirmation", "Monitoramento de confirmações", "20", "Até N confirmações"],
          ["balance-reconciliation", "Reconciliação de saldos", "5", "5x com intervalo de 1min"],
          ["webhook-delivery", "Envio de webhooks aos clientes", "50", "5x com backoff"],
          ["report-generation", "Geração de relatórios", "3", "2x"],
          ["kyc-verification", "Processamento de verificação KYC", "5", "3x"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Dashboard de filas",
        text: "O dashboard de Job Queue exibe em tempo real: jobs em espera, em processamento, concluídos, falhados e atrasados. Cada fila possui seu próprio painel com métricas de throughput e latência.",
      },
      {
        type: "heading",
        level: 3,
        text: "Diagnóstico de Problemas",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Jobs stuck (travados): Verifique se o worker está saudável e se há lock timeout configurado",
          "Backlog crescente: Aumente a concorrência ou adicione workers. Verifique se há bottleneck externo",
          "Alta taxa de falha: Verifique logs dos jobs falhados. Causas comuns: RPC timeout, rate limit externo",
          "Jobs duplicados: Verifique se o producer está usando job IDs idempotentes",
          "Latência alta: Verifique a carga do Redis e a concorrência dos workers",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Ações de Administração",
      },
      {
        type: "steps",
        items: [
          {
            title: "Retry de jobs falhados",
            description:
              "Selecione jobs falhados individualmente ou em lote e clique em 'Retry'. O job será re-enfileirado com alta prioridade.",
          },
          {
            title: "Pausar uma fila",
            description:
              "Em situações de emergência, pause uma fila para evitar processamento. Jobs continuam sendo enfileirados mas não executados até o resume.",
          },
          {
            title: "Limpar dead letter queue",
            description:
              "Jobs que excederam todos os retries vão para a DLQ. Revise-os periodicamente e resolva a causa raiz antes de reprocessar.",
          },
          {
            title: "Ajustar concorrência",
            description:
              "Altere o número de workers paralelos por fila conforme a carga. Mais workers = maior throughput mas mais carga no sistema.",
          },
        ],
      },
      {
        type: "code",
        language: "bash",
        code: '# Ver status de todas as filas via API\ncurl -s https://api.vaulthub.live/v1/admin/queues \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" | jq \'.\'\n\n# Resultado:\n# {\n#   "tx-submission": { "waiting": 3, "active": 8, "completed": 15420, "failed": 12, "delayed": 0 },\n#   "tx-confirmation": { "waiting": 45, "active": 20, "completed": 89200, "failed": 3, "delayed": 120 },\n#   ...\n# }',
        filename: "check-queues.sh",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Nunca limpe a fila tx-confirmation sem verificar! Jobs nessa fila representam transações on-chain aguardando confirmação. Removê-los pode causar transações 'perdidas' que nunca terão seu status atualizado.",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/logs-sistema",
        title: "Logs do Sistema",
        description:
          "Acesse logs detalhados para diagnóstico de problemas em jobs e filas",
      },
    ],
  },
  {
    slug: "logs-sistema",
    title: "Logs do Sistema",
    description:
      "Acesso e busca em logs centralizados de todos os serviços da plataforma.",
    category: "monitoring",
    icon: "ScrollText",
    difficulty: "intermediate",
    tags: ["logs", "sistema", "diagnóstico", "busca"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Logs Centralizados",
      },
      {
        type: "paragraph",
        text: "Todos os serviços do CryptoVaultHub emitem logs estruturados em formato JSON que são centralizados e indexados para busca rápida. Os logs são essenciais para diagnóstico de problemas, auditoria e compliance. O sistema utiliza o stack ELK (Elasticsearch, Logstash, Kibana) integrado ao admin panel.",
      },
      {
        type: "heading",
        level: 3,
        text: "Níveis de Log",
      },
      {
        type: "table",
        headers: ["Nível", "Uso", "Retenção"],
        rows: [
          ["ERROR", "Erros que requerem atenção", "365 dias"],
          ["WARN", "Situações anormais mas não críticas", "180 dias"],
          ["INFO", "Eventos operacionais importantes", "90 dias"],
          ["DEBUG", "Informações detalhadas para diagnóstico", "30 dias"],
          ["TRACE", "Dados extremamente detalhados (habilitado sob demanda)", "7 dias"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Estrutura de um Log",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "timestamp": "2026-04-22T14:30:00.123Z",\n  "level": "INFO",\n  "service": "transaction-service",\n  "trace_id": "abc123def456",\n  "span_id": "span_789",\n  "client_id": "client_x9y8z7",\n  "message": "Transaction submitted to chain",\n  "metadata": {\n    "tx_hash": "0x1234...abcd",\n    "chain": "ethereum",\n    "value_usd": 50000,\n    "gas_price_gwei": 25\n  }\n}',
        filename: "log-structure.json",
      },
      {
        type: "callout",
        variant: "info",
        title: "Correlação de logs",
        text: "Cada requisição recebe um trace_id único que é propagado por todos os serviços envolvidos. Use o trace_id para rastrear o fluxo completo de uma operação, do recebimento da API até a confirmação on-chain.",
      },
      {
        type: "heading",
        level: 3,
        text: "Busca de Logs",
      },
      {
        type: "paragraph",
        text: "A interface de busca de logs no admin panel suporta queries avançadas com filtros por serviço, nível, período, client_id, trace_id e texto livre. Os resultados são exibidos em ordem cronológica com highlight nos termos buscados.",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Busca por texto: qualquer termo no campo message ou metadata",
          "Filtro por serviço: transaction-service, wallet-service, compliance-service, etc.",
          "Filtro por nível: ERROR, WARN, INFO, DEBUG",
          "Filtro por trace_id: rastrear uma operação específica end-to-end",
          "Filtro por client_id: ver todas as operações de um cliente",
          "Filtro por período: range de datas com precisão de milissegundos",
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Salve queries frequentes como 'Saved Searches' para acesso rápido. Exemplos úteis: 'Erros de transação últimas 24h', 'Timeouts de RPC por chain', 'Falhas de webhook delivery'.",
      },
      {
        type: "paragraph",
        text: "Para diagnósticos complexos que envolvem múltiplos serviços, combine a busca de logs com o Jaeger Tracing para uma visão completa da operação com timing de cada etapa.",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/jaeger-tracing",
        title: "Jaeger Tracing",
        description:
          "Use distributed tracing para visualizar o fluxo completo de operações entre serviços",
      },
    ],
  },
  {
    slug: "jaeger-tracing",
    title: "Jaeger Tracing",
    description:
      "Distributed tracing com Jaeger para rastrear operações entre todos os microsserviços.",
    category: "monitoring",
    icon: "GitBranch",
    difficulty: "advanced",
    tags: ["jaeger", "tracing", "distributed", "microsserviços"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Distributed Tracing com Jaeger",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub utiliza Jaeger para distributed tracing, permitindo visualizar o fluxo completo de uma operação através de todos os microsserviços envolvidos. Cada operação gera um trace composto por spans que representam as etapas individuais do processamento.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Integração nativa",
        text: "O Jaeger está integrado diretamente no admin panel. Não é necessário acessar a interface do Jaeger separadamente — traces podem ser visualizados no contexto de transações, clientes e alertas.",
      },
      {
        type: "heading",
        level: 3,
        text: "Anatomia de um Trace",
      },
      {
        type: "paragraph",
        text: "Um trace típico de transação no CryptoVaultHub percorre múltiplos serviços. Abaixo, a estrutura de spans de uma transação de saque:",
      },
      {
        type: "mermaid",
        chart:
          "graph LR\n  A[API Gateway<br/>12ms] --> B[Auth Service<br/>3ms]\n  B --> C[Transaction Service<br/>45ms]\n  C --> D[Compliance Check<br/>120ms]\n  D --> E[Wallet Service<br/>8ms]\n  E --> F[Key Vault<br/>15ms]\n  F --> G[Chain Connector<br/>200ms]\n  G --> H[RPC Provider<br/>150ms]\n  C --> I[Webhook Service<br/>5ms]",
      },
      {
        type: "heading",
        level: 3,
        text: "Usando o Jaeger no Admin Panel",
      },
      {
        type: "steps",
        items: [
          {
            title: "Buscar um trace",
            description:
              "Use o trace_id (disponível em logs, detalhes de transação e alertas) ou busque por serviço, operação e período na tela de Tracing.",
          },
          {
            title: "Analisar o waterfall",
            description:
              "O diagrama de waterfall mostra cada span com seu timing, serviço de origem e status. Spans vermelhos indicam erros.",
          },
          {
            title: "Identificar bottlenecks",
            description:
              "O span mais longo geralmente é o bottleneck. Para transações, tipicamente é a comunicação com o RPC Provider ou a verificação de compliance.",
          },
          {
            title: "Examinar detalhes do span",
            description:
              "Clique em um span para ver tags (metadata), logs internos e referências a outros traces. Links para logs no Elasticsearch estão disponíveis em cada span.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Tags Importantes nos Spans",
      },
      {
        type: "table",
        headers: ["Tag", "Descrição", "Exemplo"],
        rows: [
          ["http.method", "Método HTTP da chamada", "POST"],
          ["http.status_code", "Status code da resposta", "200, 429, 500"],
          ["db.statement", "Query executada (ofuscada)", "SELECT * FROM wallets WHERE..."],
          ["chain.name", "Blockchain envolvida", "ethereum"],
          ["tx.hash", "Hash da transação on-chain", "0x1234...abcd"],
          ["error", "Indica se o span teve erro", "true"],
        ],
      },
      {
        type: "code",
        language: "typescript",
        code: '// Buscar traces de transações lentas via API\nconst traces = await adminClient.tracing.search({\n  service: "transaction-service",\n  operation: "submit_transaction",\n  min_duration_ms: 5000, // traces > 5 segundos\n  start: "2026-04-22T00:00:00Z",\n  end: "2026-04-22T23:59:59Z",\n  limit: 20,\n});\n\ntraces.forEach((trace) => {\n  console.log(\n    `Trace ${trace.trace_id}: ${trace.duration_ms}ms - ` +\n    `${trace.spans.length} spans - ${trace.errors ? "COM ERRO" : "OK"}`\n  );\n});',
        filename: "search-traces.ts",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use o recurso 'Compare Traces' para comparar duas execuções da mesma operação lado a lado. Ideal para entender por que uma transação foi lenta enquanto outra similar foi rápida.",
      },
      {
        type: "quote",
        text: "Distributed tracing não é luxo — é necessidade. Em uma arquitetura de microsserviços, sem tracing você está voando às cegas quando problemas acontecem.",
        author: "Equipe de Platform Engineering",
      },
      {
        type: "link-card",
        href: "/support/kb/traceability/timeline-visual",
        title: "Timeline Visual",
        description:
          "Veja como os traces alimentam a timeline visual de transações para uma visão de negócio",
      },
    ],
  },
];
