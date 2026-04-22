import type { Article } from "../components/types";

export const analyticsArticles: Article[] = [
  {
    slug: "overview",
    title: "Analytics Overview",
    description:
      "Visão geral do módulo de Analytics integrado ao Admin Panel.",
    category: "analytics",
    icon: "BarChart3",
    difficulty: "beginner",
    tags: ["analytics", "visão geral", "dashboard", "BI"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Módulo de Analytics",
      },
      {
        type: "paragraph",
        text: "O módulo de Analytics é o centro de inteligência de negócios do CryptoVaultHub, integrado diretamente no Admin Panel. Aqui você encontra dashboards analíticos que transformam dados operacionais em insights acionáveis sobre volume de transações, comportamento de clientes, performance de compliance e saúde financeira da plataforma.",
      },
      {
        type: "callout",
        variant: "info",
        title: "BI integrado ao Admin Panel",
        text: "Todo o analytics é acessível diretamente no Admin Panel — não há necessidade de ferramentas externas ou aplicações separadas. Os dados são atualizados em near-real-time com delay máximo de 60 segundos.",
      },
      {
        type: "heading",
        level: 3,
        text: "Dashboards Disponíveis",
      },
      {
        type: "table",
        headers: ["Dashboard", "Foco", "Atualização"],
        rows: [
          ["Operations", "Transações, volumes, receita", "Near-real-time"],
          ["Clients", "Crescimento, churn, engajamento", "Diário"],
          ["Compliance", "Alertas, KYC, taxa de revisão", "Near-real-time"],
          ["Financial", "Receita, custos, margem por chain", "Horário"],
          ["Chains", "Volume por chain, gas costs, uptime", "Near-real-time"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Arquitetura do Analytics",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Serviços Operacionais] -->|Eventos| B[Event Bus]\n  B --> C[Analytics Aggregator]\n  C --> D[Time-Series DB]\n  C --> E[Aggregated Tables]\n  D --> F[Dashboard Widgets]\n  E --> F\n  F --> G[Admin Panel UI]",
      },
      {
        type: "paragraph",
        text: "Os dados analíticos são processados a partir de eventos emitidos pelos serviços operacionais. O Analytics Aggregator processa esses eventos e armazena agregações em múltiplas granularidades: por minuto, hora, dia e mês. Isso permite consultas rápidas em qualquer escala temporal.",
      },
      {
        type: "heading",
        level: 3,
        text: "Widgets e Componentes",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "KPI Cards: métricas numéricas com comparativo de período (ex: +15% vs. semana passada)",
          "Line Charts: séries temporais de volume, receita, transações",
          "Bar Charts: comparativos por chain, tier, tipo de operação",
          "Pie/Donut Charts: distribuição de volume por chain ou token",
          "Heatmaps: concentração de atividade por hora/dia da semana",
          "Tables: rankings de clientes, tokens mais transacionados, etc.",
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Todos os widgets suportam drill-down: clique em qualquer ponto de dados para ver o detalhamento. Ex: clique em 'Ethereum' no gráfico de volume por chain para ver o breakdown por token.",
      },
      {
        type: "paragraph",
        text: "Para começar a explorar, acesse Admin Panel > Analytics no menu lateral. O dashboard padrão exibe um overview executivo com as métricas mais relevantes. Use os filtros de período no topo para ajustar o range temporal.",
      },
      {
        type: "link-card",
        href: "/support/kb/analytics/operations",
        title: "Operations Analytics",
        description:
          "Mergulhe nos dados de operações: transações, volumes e receita",
      },
    ],
  },
  {
    slug: "operations",
    title: "Operations Analytics",
    description:
      "Análise detalhada de operações, volumes de transação e receita por chain e token.",
    category: "analytics",
    icon: "TrendingUp",
    difficulty: "intermediate",
    tags: ["operações", "transações", "volume", "receita"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Analytics de Operações",
      },
      {
        type: "paragraph",
        text: "O dashboard de Operations Analytics oferece uma visão profunda sobre todas as transações processadas pela plataforma. Analise volumes, receita, custos de gas, tempos de confirmação e padrões de uso para tomar decisões informadas sobre pricing, capacidade e expansão de chains.",
      },
      {
        type: "heading",
        level: 3,
        text: "KPIs Principais",
      },
      {
        type: "table",
        headers: ["KPI", "Descrição", "Granularidade"],
        rows: [
          ["Total Volume (USD)", "Volume total transacionado em dólares", "Hora/Dia/Mês"],
          ["Transaction Count", "Número total de transações processadas", "Hora/Dia/Mês"],
          ["Avg Transaction Size", "Valor médio por transação", "Dia/Mês"],
          ["Revenue", "Receita gerada com fees de transação", "Dia/Mês"],
          ["Gas Cost", "Custo total de gas pago pela plataforma", "Dia/Mês"],
          ["Net Margin", "Receita menos custo de gas", "Dia/Mês"],
          ["Confirmation Time (P50)", "Tempo mediano de confirmação on-chain", "Hora/Dia"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Conversão de moeda",
        text: "Todos os valores são normalizados em USD usando o preço de mercado no momento da transação. Para análise em outra moeda, use o seletor de moeda no canto superior direito do dashboard.",
      },
      {
        type: "heading",
        level: 3,
        text: "Análise por Chain",
      },
      {
        type: "paragraph",
        text: "O breakdown por chain mostra a distribuição de volume e receita entre as blockchains habilitadas. Essa análise é fundamental para decidir investimentos em infraestrutura, priorizar integrações de tokens e negociar com provedores RPC.",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Volume e transações por chain com trend line",
          "Custo de gas por chain como percentual da receita",
          "Tempo médio de confirmação por chain",
          "Top tokens por volume em cada chain",
          "Crescimento mês-a-mês por chain",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Análise por Tier",
      },
      {
        type: "paragraph",
        text: "Entenda como cada tier contribui para o volume e receita da plataforma. Identifique tiers com alta utilização de limites (candidatos a upgrade) e tiers com baixa utilização (possível overprovisioning).",
      },
      {
        type: "code",
        language: "typescript",
        code: '// Consultar analytics de operações via API\nconst analytics = await adminClient.analytics.operations({\n  period: "last_30_days",\n  group_by: ["chain", "tier"],\n  metrics: ["volume_usd", "transaction_count", "revenue_usd", "gas_cost_usd"],\n});\n\n// Resultado:\n// {\n//   total_volume_usd: 125_000_000,\n//   total_transactions: 45_200,\n//   total_revenue_usd: 187_500,\n//   breakdown_by_chain: [\n//     { chain: "ethereum", volume_usd: 85_000_000, pct: 68 },\n//     { chain: "polygon", volume_usd: 25_000_000, pct: 20 },\n//     ...\n//   ]\n// }',
        filename: "operations-analytics.ts",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Exporte os dados do dashboard para XLSX ou CSV para análises customizadas. O botão de exportação está disponível em cada widget e no dashboard completo.",
      },
      {
        type: "quote",
        text: "Dados sem ação são apenas números. Use o Operations Analytics para identificar oportunidades de otimização de custos de gas e ajuste de pricing por chain.",
        author: "Equipe de Produto CryptoVaultHub",
      },
      {
        type: "link-card",
        href: "/support/kb/analytics/interpretar-graficos",
        title: "Interpretar Gráficos",
        description:
          "Aprenda a interpretar corretamente os gráficos e indicadores do Analytics",
      },
    ],
  },
  {
    slug: "compliance-analytics",
    title: "Compliance Analytics",
    description:
      "Dashboard analítico de compliance: alertas, KYC status e eficiência de revisão.",
    category: "analytics",
    icon: "ShieldCheck",
    difficulty: "intermediate",
    tags: ["compliance", "analytics", "KYC", "alertas"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Analytics de Compliance",
      },
      {
        type: "paragraph",
        text: "O Compliance Analytics fornece métricas essenciais para avaliar a eficiência e eficácia do programa de compliance. Acompanhe KPIs de KYC, volume de alertas, tempos de resolução e taxa de falsos positivos para otimizar continuamente suas políticas.",
      },
      {
        type: "heading",
        level: 3,
        text: "KPIs de Compliance",
      },
      {
        type: "table",
        headers: ["KPI", "Descrição", "Meta"],
        rows: [
          ["KYC Approval Rate", "Percentual de KYCs aprovados vs. total", "> 85%"],
          ["KYC Avg Time", "Tempo médio de aprovação de KYC", "< 24h"],
          ["Alert Volume", "Total de alertas gerados no período", "Monitorar tendência"],
          ["False Positive Rate", "Alertas que resultaram em liberação", "< 30%"],
          ["Avg Resolution Time", "Tempo médio de resolução de alertas", "< 2h"],
          ["SLA Compliance", "Percentual de alertas resolvidos dentro do SLA", "> 95%"],
          ["SAR Filings", "Número de SARs reportados ao regulador", "Monitorar"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Benchmark",
        text: "Os valores de 'Meta' são baseados em benchmarks da indústria de custódia crypto. Ajuste conforme o volume e perfil de risco da sua operação.",
      },
      {
        type: "heading",
        level: 3,
        text: "Análise de Tendências",
      },
      {
        type: "paragraph",
        text: "O dashboard de tendências mostra a evolução dos KPIs de compliance ao longo do tempo. Use para identificar: se novas regras estão gerando muitos falsos positivos, se o tempo de resposta da equipe está melhorando e se há sazonalidade nos alertas.",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Gráfico de volume de alertas por severidade ao longo do tempo",
          "Gráfico de tempo de resolução com P50 e P95",
          "Taxa de falso positivo por tipo de regra",
          "Distribuição de alertas por dia da semana e hora",
          "Funnel de KYC: iniciados > em análise > aprovados > rejeitados",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Eficiência da Equipe",
      },
      {
        type: "paragraph",
        text: "Métricas de produtividade da equipe de compliance ajudam a dimensionar o time e identificar necessidades de treinamento. Visualize alertas resolvidos por analista, tempo médio por tipo de investigação e distribuição de carga.",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Atenção: métricas de produtividade individual devem ser usadas para dimensionamento e melhoria de processos, nunca como ferramenta punitiva. A qualidade da análise é mais importante que a velocidade.",
      },
      {
        type: "code",
        language: "typescript",
        code: '// Consultar compliance analytics via API\nconst complianceData = await adminClient.analytics.compliance({\n  period: "last_30_days",\n  metrics: [\n    "alert_volume",\n    "resolution_time_p50",\n    "resolution_time_p95",\n    "false_positive_rate",\n    "kyc_approval_rate",\n  ],\n  group_by: "week",\n});\n\n// Gera gráfico de tendência semanal',
        filename: "compliance-analytics.ts",
      },
      {
        type: "link-card",
        href: "/support/kb/compliance/relatorios",
        title: "Relatórios de Conformidade",
        description:
          "Gere relatórios formais de compliance baseados nos dados analíticos",
      },
    ],
  },
  {
    slug: "interpretar-graficos",
    title: "Interpretar Gráficos",
    description:
      "Guia para interpretar corretamente os gráficos e indicadores do módulo de Analytics.",
    category: "analytics",
    icon: "HelpCircle",
    difficulty: "beginner",
    tags: ["gráficos", "interpretação", "indicadores", "tutorial"],
    updatedAt: "22 Abr 2026",
    readingTime: 4,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Como Interpretar os Gráficos",
      },
      {
        type: "paragraph",
        text: "Entender corretamente os gráficos do Analytics é fundamental para tomar decisões informadas. Este guia explica cada tipo de visualização, como ler os dados e quais armadilhas evitar na interpretação.",
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Gráfico",
      },
      {
        type: "table",
        headers: ["Tipo", "Quando Usar", "O que Observar"],
        rows: [
          ["Line Chart", "Tendências ao longo do tempo", "Direção, inclinação, sazonalidade"],
          ["Bar Chart", "Comparação entre categorias", "Diferenças absolutas e relativas"],
          ["Stacked Bar", "Composição de um total", "Proporção de cada componente"],
          ["Pie/Donut", "Distribuição percentual", "Concentração, diversificação"],
          ["Heatmap", "Padrões em duas dimensões", "Concentração de atividade"],
          ["Sparkline", "Tendência rápida em KPI cards", "Direção geral (subindo/descendo)"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Lendo KPI Cards",
      },
      {
        type: "paragraph",
        text: "Cada KPI card exibe: o valor atual, o valor do período anterior, a variação percentual (verde = positivo, vermelho = negativo) e um sparkline de tendência. Atenção: nem sempre 'verde' é bom — por exemplo, um aumento no número de alertas de compliance (verde por ser crescimento) é algo preocupante.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Contexto é tudo",
        text: "Nunca interprete um indicador isoladamente. Um aumento de 50% no volume de transações pode ser ótimo (crescimento orgânico) ou preocupante (potencial atividade suspeita). Sempre cruze com outros indicadores.",
      },
      {
        type: "heading",
        level: 3,
        text: "Armadilhas Comuns",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Escala: verifique se o eixo Y começa em zero. Gráficos truncados podem exagerar variações",
          "Sazonalidade: fins de semana e feriados naturalmente têm volume menor. Compare dias iguais",
          "Outliers: uma transação muito grande pode distorcer médias. Prefira medianas (P50)",
          "Lag de dados: lembre-se do delay de atualização (até 60s). Em análises críticas, aguarde o refresh",
          "Período: compare períodos equivalentes (mês vs. mês anterior com mesmo número de dias)",
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use o recurso de 'Annotations' para marcar eventos importantes diretamente nos gráficos: lançamento de nova chain, mudança de pricing, incident, etc. Isso ajuda a correlacionar mudanças nos dados com eventos reais.",
      },
      {
        type: "heading",
        level: 3,
        text: "Drill-down e Filtros",
      },
      {
        type: "paragraph",
        text: "Todos os gráficos suportam drill-down: clique em qualquer ponto de dados para aprofundar. Um clique no volume de Ethereum mostra o breakdown por token. Um clique em um pico de alertas mostra quais regras dispararam. Use filtros no topo do dashboard para focar em chains, tiers ou períodos específicos.",
      },
      {
        type: "quote",
        text: "Um bom dashboard não responde perguntas — ele levanta as perguntas certas. O drill-down é onde você encontra as respostas.",
        author: "Princípios de Data Visualization",
      },
      {
        type: "link-card",
        href: "/support/kb/analytics/filtros-periodos",
        title: "Filtros e Períodos",
        description:
          "Domine os filtros e seletores de período para análises precisas",
      },
    ],
  },
  {
    slug: "filtros-periodos",
    title: "Filtros e Períodos",
    description:
      "Como usar filtros e seletores de período para análises precisas no Analytics.",
    category: "analytics",
    icon: "Filter",
    difficulty: "beginner",
    tags: ["filtros", "períodos", "data range", "segmentação"],
    updatedAt: "22 Abr 2026",
    readingTime: 4,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Filtros e Seletores de Período",
      },
      {
        type: "paragraph",
        text: "Os filtros são ferramentas essenciais para extrair insights específicos dos dashboards de Analytics. Combinando filtros de período, chain, tier e tipo de operação, você pode segmentar os dados para responder a qualquer pergunta de negócio.",
      },
      {
        type: "heading",
        level: 3,
        text: "Seletor de Período",
      },
      {
        type: "table",
        headers: ["Opção", "Descrição", "Granularidade"],
        rows: [
          ["Últimas 24h", "Dados das últimas 24 horas", "Por hora"],
          ["Últimos 7 dias", "Semana corrente", "Por dia"],
          ["Últimos 30 dias", "Mês corrente", "Por dia"],
          ["Últimos 90 dias", "Trimestre corrente", "Por semana"],
          ["Último ano", "12 meses anteriores", "Por mês"],
          ["Custom Range", "Período personalizado", "Automática"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Comparação de períodos",
        text: "Ative a opção 'Comparar com período anterior' para visualizar sobreposição de dados. Ex: ao selecionar 'Últimos 7 dias', a comparação mostrará os 7 dias anteriores como linha pontilhada no mesmo gráfico.",
      },
      {
        type: "heading",
        level: 3,
        text: "Filtros Disponíveis",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Chain: filtre por uma ou múltiplas blockchains",
          "Tier: filtre por tier de serviço do cliente",
          "Token: filtre por token específico (USDT, ETH, BTC, etc.)",
          "Tipo de operação: depósito, saque, transferência interna",
          "Status: completada, pendente, falhada",
          "Cliente: filtre por cliente específico",
          "Valor: range de valor em USD (min/max)",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Combinando Filtros",
      },
      {
        type: "paragraph",
        text: "Filtros podem ser combinados livremente. A lógica é AND entre filtros diferentes e OR dentro do mesmo filtro. Ex: (chain = Ethereum OR Polygon) AND (tier = Professional) AND (período = últimos 30 dias).",
      },
      {
        type: "steps",
        items: [
          {
            title: "Aplicar filtro de período",
            description:
              "Selecione o período desejado no seletor no topo do dashboard. Para custom range, clique nas datas de início e fim no calendário.",
          },
          {
            title: "Adicionar filtros adicionais",
            description:
              "Clique no botão 'Filtros' para expandir o painel de filtros. Selecione os valores desejados em cada categoria.",
          },
          {
            title: "Verificar dados filtrados",
            description:
              "O badge no botão de filtros indica quantos filtros estão ativos. Todos os widgets do dashboard atualizam automaticamente.",
          },
          {
            title: "Salvar preset de filtros",
            description:
              "Para combinações frequentes, salve como preset. Ex: 'Enterprise Ethereum Mensal' para análise recorrente de clientes Enterprise em Ethereum.",
          },
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use a URL do dashboard com filtros aplicados para compartilhar análises específicas com outros administradores. Os filtros são serializados na URL e podem ser bookmarkados.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Consultar analytics com filtros via API\ncurl -s "https://api.vaulthub.live/v1/admin/analytics/operations?\\\nperiod=last_30_days&\\\nchain=ethereum,polygon&\\\ntier=tier_professional,tier_enterprise&\\\ngroup_by=chain,day" \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" | jq \'.summary\'',
        filename: "filtered-analytics.sh",
      },
      {
        type: "link-card",
        href: "/support/kb/exports/exportar-dados",
        title: "Exportar Dados",
        description:
          "Exporte os dados filtrados do Analytics para análises externas",
      },
    ],
  },
];
