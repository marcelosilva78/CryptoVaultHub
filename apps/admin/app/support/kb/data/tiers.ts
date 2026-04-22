import type { Article } from "../components/types";

export const tiersArticles: Article[] = [
  {
    slug: "visao-geral",
    title: "Visão Geral de Planos e Tiers",
    description:
      "Entenda a estrutura de tiers, como definem limites operacionais e como são atribuídos aos clientes.",
    category: "tiers",
    icon: "Layers",
    difficulty: "beginner",
    tags: ["tiers", "planos", "visão geral", "limites"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Estrutura de Tiers no CryptoVaultHub",
      },
      {
        type: "paragraph",
        text: "Os Tiers são o mecanismo central de controle de acesso e limites operacionais da plataforma. Cada tier define um conjunto de parâmetros que determinam o que um cliente pode fazer, quanto pode transacionar e com que frequência pode acessar a API. A estrutura é flexível e permite criar tiers customizados para atender diferentes perfis de clientes.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Tiers padrão",
        text: "O sistema vem pré-configurado com 4 tiers: Starter, Standard, Professional e Enterprise. Estes podem ser editados ou novos tiers podem ser criados conforme necessidade.",
      },
      {
        type: "heading",
        level: 3,
        text: "Comparação dos Tiers Padrão",
      },
      {
        type: "table",
        headers: ["Recurso", "Starter", "Standard", "Professional", "Enterprise"],
        rows: [
          ["Wallets por chain", "5", "25", "100", "Ilimitado"],
          ["Transação máxima (USD)", "$10,000", "$100,000", "$1,000,000", "Customizado"],
          ["Volume diário (USD)", "$50,000", "$500,000", "$5,000,000", "Customizado"],
          ["API calls/min", "60", "300", "1,000", "5,000"],
          ["Chains habilitadas", "3", "10", "Todas", "Todas"],
          ["Suporte", "E-mail", "E-mail + Chat", "Dedicado", "Dedicado 24/7"],
          ["Compliance", "Básico", "Avançado", "Avançado", "Customizado"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Hierarquia de Limites",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Tier] --> B[Limites de Transação]\n  A --> C[Rate Limits API]\n  A --> D[Limites de Wallets]\n  A --> E[Funcionalidades]\n  B --> B1[Por Transação]\n  B --> B2[Diário]\n  B --> B3[Mensal]\n  C --> C1[Requests/min]\n  C --> C2[Requests/hora]\n  D --> D1[Total por Chain]\n  D --> D2[Total Geral]\n  E --> E1[Chains Permitidas]\n  E --> E2[Features Habilitadas]",
      },
      {
        type: "paragraph",
        text: "Os limites são avaliados em cascata: primeiro o limite por transação individual, depois o acumulado diário e finalmente o mensal. Se qualquer um dos limites for excedido, a transação é bloqueada e o cliente recebe uma notificação com detalhes do limite atingido.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use a funcionalidade de 'Override Temporário' para conceder limites extras a um cliente específico sem alterar seu tier. Útil para situações pontuais como liquidações programadas.",
      },
      {
        type: "quote",
        text: "Um bom sistema de tiers equilibra a experiência do cliente com a gestão de risco da plataforma. Seja generoso nos limites padrão e rigoroso nas exceções.",
        author: "Práticas de Custódia Institucional",
      },
      {
        type: "paragraph",
        text: "Para visualizar todos os tiers configurados, acesse Admin > Tiers & Limits. A tela exibe uma visão geral com o número de clientes em cada tier, utilização média de limites e receita gerada.",
      },
      {
        type: "link-card",
        href: "/support/kb/clients/editar-tiers",
        title: "Editar Tiers de Cliente",
        description:
          "Saiba como alterar o tier de um cliente e os impactos dessa mudança",
      },
    ],
  },
  {
    slug: "criar-tier",
    title: "Criar Novo Tier",
    description:
      "Como criar um tier customizado com limites e funcionalidades específicas.",
    category: "tiers",
    icon: "Plus",
    difficulty: "intermediate",
    tags: ["tiers", "criar", "customizado"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Criando um Tier Customizado",
      },
      {
        type: "paragraph",
        text: "Além dos tiers padrão, é possível criar tiers customizados para atender necessidades específicas. Tiers customizados são comuns para clientes institucionais com requisitos únicos de volume, compliance ou funcionalidades.",
      },
      {
        type: "heading",
        level: 3,
        text: "Passo a Passo",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar a criação de tiers",
            description:
              "Navegue até Admin > Tiers & Limits e clique em 'Criar Novo Tier'.",
          },
          {
            title: "Informações básicas",
            description:
              "Preencha nome, descrição e selecione um tier existente como base (opcional). Usar um tier como base pré-preenche todos os campos com os valores daquele tier.",
          },
          {
            title: "Configurar limites de transação",
            description:
              "Defina os limites por transação, diário e mensal em USD. Configure também limites específicos por chain se necessário.",
          },
          {
            title: "Configurar rate limits",
            description:
              "Defina os limites de API: requests por minuto, por hora e por dia. Configure limites por endpoint se necessário (ex: mais requests para consulta que para transação).",
          },
          {
            title: "Selecionar funcionalidades",
            description:
              "Marque as funcionalidades habilitadas: chains permitidas, tokens especiais, acesso a APIs específicas, nível de suporte e features beta.",
          },
          {
            title: "Revisar e criar",
            description:
              "Revise a configuração completa. O tier será criado mas não atribuído a nenhum cliente automaticamente.",
          },
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Tiers em uso",
        text: "Depois que um tier é atribuído a pelo menos um cliente, alterações nos limites afetarão todos os clientes vinculados. Se precisa de configurações diferentes, crie um novo tier.",
      },
      {
        type: "code",
        language: "typescript",
        code: '// Criar tier via API\nconst newTier = await adminClient.tiers.create({\n  name: "Institutional Gold",\n  description: "Tier para clientes institucionais com alto volume",\n  base_tier_id: "tier_professional", // clona configurações base\n  overrides: {\n    transaction_limits: {\n      per_transaction_usd: 5_000_000,\n      daily_usd: 25_000_000,\n      monthly_usd: 500_000_000,\n    },\n    rate_limits: {\n      requests_per_minute: 3000,\n      requests_per_hour: 100_000,\n    },\n    features: {\n      enabled_chains: ["*"], // todas as chains\n      dedicated_support: true,\n      custom_compliance: true,\n      multi_sig: true,\n    },\n  },\n});',
        filename: "create-tier.ts",
      },
      {
        type: "paragraph",
        text: "Após a criação, o tier aparece na listagem geral e pode ser atribuído a clientes via interface ou API. O tier pode ser editado a qualquer momento, mas mudanças em tiers com clientes vinculados devem ser feitas com cautela.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Nomeie tiers customizados de forma descritiva, incluindo o tipo de cliente e o diferencial. Ex: 'Institutional - High Volume', 'Fund Manager - Multi-Chain'. Isso facilita a gestão quando houver muitos tiers.",
      },
      {
        type: "link-card",
        href: "/support/kb/tiers/configurar-limites",
        title: "Configurar Limites de Operação",
        description:
          "Detalhes avançados sobre configuração de limites por transação, diário e mensal",
      },
    ],
  },
  {
    slug: "configurar-limites",
    title: "Configurar Limites de Operação",
    description:
      "Detalhamento completo dos limites operacionais por transação, diário e mensal.",
    category: "tiers",
    icon: "Gauge",
    difficulty: "intermediate",
    tags: ["limites", "transação", "diário", "mensal", "configuração"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Limites de Operação",
      },
      {
        type: "paragraph",
        text: "Os limites de operação são a principal ferramenta de gestão de risco da plataforma. Cada tier possui um conjunto de limites que controlam o volume de transações que um cliente pode realizar. Os limites são avaliados em USD, com conversão automática baseada em cotações de mercado em tempo real.",
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Limites",
      },
      {
        type: "table",
        headers: ["Tipo", "Escopo", "Reset", "Descrição"],
        rows: [
          ["Per-Transaction", "Individual", "N/A", "Valor máximo de uma única transação"],
          ["Daily", "Acumulado 24h", "00:00 UTC", "Volume total em 24 horas"],
          ["Monthly", "Acumulado 30d", "Dia 1 00:00 UTC", "Volume total no mês"],
          ["Per-Chain", "Por blockchain", "Mesmo do tipo base", "Limites específicos por chain"],
          ["Per-Token", "Por token", "Mesmo do tipo base", "Limites específicos por token"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Conversão de moeda",
        text: "Todos os limites são configurados em USD. O sistema converte automaticamente usando o preço de mercado no momento da transação. O feed de preço é atualizado a cada 15 segundos via múltiplas fontes (CoinGecko, Binance, Kraken).",
      },
      {
        type: "heading",
        level: 3,
        text: "Configuração Avançada",
      },
      {
        type: "paragraph",
        text: "Além dos limites padrão por tier, é possível configurar limites granulares por chain, token e até por direção (depósito vs. saque). Isso permite criar regras como 'cliente pode depositar até $1M/dia em BTC mas apenas $500K/dia em ETH'.",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "tier_id": "tier_professional",\n  "transaction_limits": {\n    "default": {\n      "per_transaction_usd": 1000000,\n      "daily_usd": 5000000,\n      "monthly_usd": 50000000\n    },\n    "per_chain_overrides": {\n      "bitcoin": {\n        "per_transaction_usd": 2000000,\n        "daily_usd": 10000000\n      },\n      "ethereum": {\n        "per_transaction_usd": 1500000\n      }\n    },\n    "per_direction": {\n      "deposit": { "multiplier": 2.0 },\n      "withdrawal": { "multiplier": 1.0 }\n    }\n  }\n}',
        filename: "limits-config.json",
      },
      {
        type: "heading",
        level: 3,
        text: "Fluxo de Validação",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Transação Recebida] --> B{Limite por Transação OK?}\n  B -->|Não| C[Rejeitar: Excede limite individual]\n  B -->|Sim| D{Limite Diário OK?}\n  D -->|Não| E[Rejeitar: Excede limite diário]\n  D -->|Sim| F{Limite Mensal OK?}\n  F -->|Não| G[Rejeitar: Excede limite mensal]\n  F -->|Sim| H{Limite per-Chain OK?}\n  H -->|Não| I[Rejeitar: Excede limite da chain]\n  H -->|Sim| J[Aprovar Transação]",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Alterações de limite em tiers com clientes vinculados entram em vigor imediatamente. Reduções de limite não cancelam transações em andamento, mas bloqueiam novas transações que excedam os novos valores.",
      },
      {
        type: "paragraph",
        text: "O dashboard de Tiers exibe em tempo real a utilização de limites por cliente, permitindo identificar clientes que estão próximos dos limites e podem precisar de upgrade.",
      },
      {
        type: "link-card",
        href: "/support/kb/analytics/operations",
        title: "Operations Analytics",
        description:
          "Analise volumes de transação e utilização de limites com gráficos detalhados",
      },
    ],
  },
  {
    slug: "rate-limits",
    title: "Rate Limits por Tier",
    description:
      "Configuração e monitoramento de rate limiting de API por tier de serviço.",
    category: "tiers",
    icon: "Timer",
    difficulty: "advanced",
    tags: ["rate limits", "API", "throttling", "performance"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Rate Limiting de API",
      },
      {
        type: "paragraph",
        text: "O Rate Limiting controla a frequência de chamadas de API que cada cliente pode realizar. É essencial para garantir a estabilidade da plataforma, distribuir recursos de forma justa e prevenir abusos. Os limites são configurados por tier e avaliados em múltiplas janelas de tempo.",
      },
      {
        type: "heading",
        level: 3,
        text: "Janelas de Rate Limit",
      },
      {
        type: "table",
        headers: ["Janela", "Starter", "Standard", "Professional", "Enterprise"],
        rows: [
          ["Por segundo", "5", "20", "50", "200"],
          ["Por minuto", "60", "300", "1,000", "5,000"],
          ["Por hora", "1,000", "10,000", "50,000", "200,000"],
          ["Por dia", "10,000", "100,000", "500,000", "2,000,000"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Sliding Window",
        text: "O rate limiting usa o algoritmo de sliding window (janela deslizante), não fixed window. Isso garante uma distribuição mais uniforme e evita bursts no início de cada janela.",
      },
      {
        type: "heading",
        level: 3,
        text: "Rate Limits por Endpoint",
      },
      {
        type: "paragraph",
        text: "Além dos limites globais, é possível configurar limites específicos por grupo de endpoints. Endpoints de leitura (consultas) geralmente têm limites mais altos que endpoints de escrita (transações).",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "GET /wallets, /balances, /transactions: 100% do limite do tier",
          "POST /transactions (criar transação): 20% do limite do tier",
          "POST /wallets (criar wallet): 10% do limite do tier",
          "GET /admin/* (endpoints admin): limite separado, não conta no tier do cliente",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Headers de Rate Limit",
      },
      {
        type: "code",
        language: "http",
        code: "HTTP/1.1 200 OK\nX-RateLimit-Limit: 300\nX-RateLimit-Remaining: 287\nX-RateLimit-Reset: 1745350260\nX-RateLimit-Window: 60\nX-RateLimit-Policy: sliding-window\n\n# Quando o limite é excedido:\nHTTP/1.1 429 Too Many Requests\nRetry-After: 12\nX-RateLimit-Limit: 300\nX-RateLimit-Remaining: 0\nX-RateLimit-Reset: 1745350260",
        filename: "rate-limit-headers.http",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Clientes que consistentemente atingem 429 podem estar precisando de upgrade de tier. Use os relatórios de Analytics para identificar esses padrões e sugerir proativamente um upgrade.",
      },
      {
        type: "paragraph",
        text: "O monitoramento de rate limits em tempo real está disponível no dashboard de Monitoring. É possível ver quais clientes estão mais próximos dos limites, histórico de 429s e tendências de uso.",
      },
      {
        type: "quote",
        text: "Rate limiting não é apenas proteção técnica — é uma ferramenta de monetização. Cada tier deve ter limites que reflitam seu valor e incentivem upgrades naturais.",
        author: "Boas Práticas de API Management",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/dashboard-metricas",
        title: "Dashboard de Métricas",
        description:
          "Monitore rate limits em tempo real e identifique padrões de uso",
      },
    ],
  },
  {
    slug: "upgrade-downgrade",
    title: "Upgrade e Downgrade de Cliente",
    description:
      "Processo completo de mudança de tier, incluindo regras de negócio e impactos.",
    category: "tiers",
    icon: "ArrowUpDown",
    difficulty: "intermediate",
    tags: ["upgrade", "downgrade", "tier", "migração"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Processo de Upgrade e Downgrade",
      },
      {
        type: "paragraph",
        text: "A mudança de tier de um cliente pode ser iniciada pelo administrador ou pelo próprio cliente (se self-service estiver habilitado). O processo envolve validação de pré-requisitos, aplicação imediata dos novos limites e ajustes de billing proporcional.",
      },
      {
        type: "heading",
        level: 3,
        text: "Regras de Upgrade",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "O cliente deve estar com KYC aprovado e conta ativa",
          "Não pode haver alertas de compliance pendentes",
          "O tier de destino deve estar disponível (ativo e não arquivado)",
          "Se self-service, o pagamento deve ser confirmado antes da ativação",
          "Novos limites entram em vigor imediatamente após confirmação",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Regras de Downgrade",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Validações de downgrade",
        text: "O downgrade pode ser bloqueado se o cliente possuir mais wallets do que o tier de destino permite, ou se houver transações pendentes que excedam os novos limites. Nesses casos, o sistema exibe os conflitos para resolução.",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Verificar se o número de wallets ativas não excede o limite do novo tier",
          "Verificar se não há transações pendentes acima dos novos limites",
          "Grace period de 7 dias para funcionalidades que serão desabilitadas",
          "Crédito proporcional calculado automaticamente no billing",
          "Notificação ao cliente sobre funcionalidades que perderá acesso",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Fluxo de Mudança de Tier",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Solicitar Mudança] --> B{Validar Pré-requisitos}\n  B -->|Falha| C[Exibir Conflitos]\n  C --> D[Resolver Conflitos]\n  D --> A\n  B -->|OK| E{Tipo de Mudança}\n  E -->|Upgrade| F[Aplicar Novos Limites]\n  F --> G[Cobrar Pró-rata]\n  E -->|Downgrade| H[Grace Period 7 dias]\n  H --> I[Aplicar Novos Limites]\n  I --> J[Gerar Crédito]\n  G --> K[Notificar Cliente]\n  J --> K\n  K --> L[Registrar no Audit Log]",
      },
      {
        type: "steps",
        items: [
          {
            title: "Iniciar mudança",
            description:
              "Acesse o cliente > Tier & Limites > 'Alterar Tier'. Ou via API PATCH /v1/admin/clients/{id}/tier.",
          },
          {
            title: "Validação automática",
            description:
              "O sistema valida pré-requisitos e exibe um resumo comparativo dos tiers (atual vs. destino).",
          },
          {
            title: "Confirmação com 2FA",
            description:
              "O administrador confirma a mudança com autenticação de dois fatores e informa o motivo da alteração.",
          },
          {
            title: "Aplicação e notificação",
            description:
              "Limites são atualizados, billing é ajustado e o cliente é notificado por e-mail com detalhes da mudança.",
          },
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Configure automações para sugerir upgrades quando um cliente atingir 80% do limite de seu tier em 3 meses consecutivos. Isso melhora a experiência e aumenta receita.",
      },
      {
        type: "link-card",
        href: "/support/kb/clients/visao-geral",
        title: "Visão Geral do Gerenciamento de Clientes",
        description:
          "Volte à visão geral de clientes para entender todo o ciclo de vida",
      },
    ],
  },
];
