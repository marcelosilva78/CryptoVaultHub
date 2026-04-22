import type { Article } from "../components/types";

export const traceabilityArticles: Article[] = [
  {
    slug: "rastrear-transacoes",
    title: "Rastrear Transações",
    description:
      "Como rastrear transações de ponta a ponta na plataforma com detalhamento completo.",
    category: "traceability",
    icon: "FileSearch",
    difficulty: "beginner",
    tags: ["transações", "rastreamento", "busca", "detalhes"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Rastreamento Completo de Transações",
      },
      {
        type: "paragraph",
        text: "O módulo de Traceability do CryptoVaultHub oferece rastreamento de transações com um nível de detalhamento extremamente rico e transparente. Cada transação — desde o momento em que é solicitada até sua confirmação final on-chain — gera um trail de auditoria completo com JSON artifacts, timeline visual e links diretos para block explorers.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Rastreabilidade é core",
        text: "Em custódia institucional, rastreabilidade não é feature — é requisito fundamental. Cada ação, cada estado intermediário, cada decisão automatizada ou manual é registrada de forma imutável e auditável.",
      },
      {
        type: "heading",
        level: 3,
        text: "Buscando uma Transação",
      },
      {
        type: "paragraph",
        text: "Existem múltiplas formas de localizar uma transação no sistema. Use a que for mais conveniente para o seu caso:",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Por ID interno: busca pelo UUID da transação no sistema (tx_abc123...)",
          "Por hash on-chain: cole o transaction hash da blockchain (0x1234...)",
          "Por cliente: navegue até o cliente e veja todas as suas transações",
          "Por endereço: busque por endereço de origem ou destino",
          "Por período: filtre transações em um range de datas",
          "Por valor: busque transações acima ou abaixo de um valor específico",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Detalhes de uma Transação",
      },
      {
        type: "paragraph",
        text: "Ao abrir uma transação, a tela de detalhes exibe todas as informações organizadas em seções:",
      },
      {
        type: "table",
        headers: ["Seção", "Informações", "Uso"],
        rows: [
          ["Overview", "Status, valor, chain, token, timestamps", "Visão rápida da transação"],
          ["Timeline", "Todos os estados desde criação até confirmação", "Diagnóstico de delays"],
          ["Blockchain", "TX hash, bloco, gas, confirmações", "Verificação on-chain"],
          ["Compliance", "Resultado do screening, decisões de revisão", "Auditoria regulatória"],
          ["Artifacts", "JSON artifacts de cada etapa do processamento", "Deep debugging"],
          ["Related", "Transações relacionadas, alerts, audit log entries", "Contexto completo"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Ciclo de Vida de uma Transação",
      },
      {
        type: "mermaid",
        chart:
          "graph LR\n  A[Created] --> B[Compliance Check]\n  B -->|Aprovada| C[Signing]\n  B -->|Manual Review| D[Pending Review]\n  D -->|Aprovada| C\n  D -->|Rejeitada| E[Rejected]\n  C --> F[Submitted]\n  F --> G[Pending Confirmation]\n  G --> H{Confirmada?}\n  H -->|Sim| I[Confirmed]\n  H -->|Timeout| J[Failed]\n  J --> K[Retry?]\n  K -->|Sim| F\n  K -->|Não| L[Failed Final]",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use Ctrl+K (ou Cmd+K no Mac) para abrir a busca rápida de transações em qualquer tela do admin panel. Aceita ID interno, TX hash e endereço.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Buscar transação por hash on-chain\ncurl -s "https://api.vaulthub.live/v1/admin/transactions/search?tx_hash=0x1234abcd" \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" | jq \'.\'\n\n# Buscar transações de um cliente com filtros\ncurl -s "https://api.vaulthub.live/v1/admin/transactions?client_id=client_x9y8z7&chain=ethereum&status=confirmed&limit=20" \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" | jq \'.transactions[] | {id, value_usd, status, confirmed_at}\'',
        filename: "search-transactions.sh",
      },
      {
        type: "link-card",
        href: "/support/kb/traceability/json-artifacts",
        title: "JSON Artifacts",
        description:
          "Explore os artifacts JSON gerados em cada etapa do processamento de transações",
      },
    ],
  },
  {
    slug: "json-artifacts",
    title: "JSON Artifacts",
    description:
      "Entenda os JSON artifacts gerados em cada etapa do processamento de transações.",
    category: "traceability",
    icon: "FileJson",
    difficulty: "advanced",
    tags: ["JSON", "artifacts", "auditoria", "detalhamento"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "JSON Artifacts de Transação",
      },
      {
        type: "paragraph",
        text: "Os JSON Artifacts são registros estruturados e imutáveis gerados automaticamente em cada etapa do processamento de uma transação. Eles capturam o estado completo do sistema naquele momento, incluindo dados de entrada, decisões tomadas, resultados de verificações e dados on-chain. São a base para auditoria, compliance e debugging.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Imutabilidade garantida",
        text: "Artifacts são armazenados com hash SHA-256 e assinatura digital. Qualquer tentativa de adulteração é detectada automaticamente. A integridade pode ser verificada a qualquer momento pelo auditor.",
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Artifacts",
      },
      {
        type: "table",
        headers: ["Artifact", "Gerado Quando", "Contém"],
        rows: [
          ["tx_request", "Transação é solicitada", "Request original, IP, user agent, client metadata"],
          ["compliance_check", "Screening é executado", "Regras avaliadas, scores, decisão, matches"],
          ["signing_result", "Transação é assinada", "Key ID, algoritmo, signed tx (sem private key)"],
          ["chain_submission", "TX é submetida on-chain", "RPC provider usado, gas price, nonce, raw tx"],
          ["confirmation", "TX é confirmada", "Block number, confirmations, receipt, logs"],
          ["webhook_delivery", "Webhook é enviado ao cliente", "Payload, response, retry count"],
          ["reconciliation", "Saldo é reconciliado", "Balance before/after, delta, source"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Estrutura de um Artifact",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "artifact_id": "art_7f8g9h0i",\n  "transaction_id": "tx_abc123",\n  "type": "compliance_check",\n  "version": "2.1",\n  "created_at": "2026-04-22T14:30:00.456Z",\n  "trace_id": "trace_xyz789",\n  "data": {\n    "rules_evaluated": 15,\n    "rules_triggered": 1,\n    "triggered_rules": [\n      {\n        "rule_id": "large_transaction",\n        "condition": "value_usd > 50000",\n        "actual_value": 75000,\n        "action": "flag_for_review",\n        "severity": "medium"\n      }\n    ],\n    "sanctions_screening": {\n      "provider": "chainalysis",\n      "result": "clear",\n      "risk_score": 0.12,\n      "categories": ["exchange"]\n    },\n    "decision": "flag_for_review",\n    "processing_time_ms": 120\n  },\n  "hash": "sha256:a1b2c3d4e5f6...",\n  "signature": "sig_abc123..."\n}',
        filename: "compliance-artifact.json",
      },
      {
        type: "heading",
        level: 3,
        text: "Acessando Artifacts",
      },
      {
        type: "steps",
        items: [
          {
            title: "Via interface",
            description:
              "Abra a transação > aba 'Artifacts'. Cada artifact é expandível e mostra o JSON formatado com syntax highlighting.",
          },
          {
            title: "Via API",
            description:
              "GET /v1/admin/transactions/{id}/artifacts retorna todos os artifacts da transação em ordem cronológica.",
          },
          {
            title: "Verificar integridade",
            description:
              "Clique em 'Verify Integrity' em qualquer artifact para recalcular o hash e comparar com o armazenado.",
          },
          {
            title: "Exportar para auditoria",
            description:
              "Exporte todos os artifacts de uma transação em um único arquivo JSON para entrega a auditores externos.",
          },
        ],
      },
      {
        type: "callout",
        variant: "warning",
        text: "Artifacts contêm dados sensíveis como endereços de carteira e valores de transação. O acesso é restrito a administradores com permissão 'traceability.artifacts.read'. Todas as visualizações são registradas no Audit Log.",
      },
      {
        type: "quote",
        text: "JSON Artifacts são a memória permanente e à prova de fraude da plataforma. Cada artifact conta uma parte da história — juntos, contam a história completa.",
        author: "Arquitetura de Traceability CryptoVaultHub",
      },
      {
        type: "link-card",
        href: "/support/kb/exports/audit-log",
        title: "Audit Log",
        description:
          "Entenda como os artifacts são referenciados no Audit Log para rastreabilidade completa",
      },
    ],
  },
  {
    slug: "timeline-visual",
    title: "Timeline Visual",
    description:
      "Visualização em timeline de todas as etapas do processamento de uma transação.",
    category: "traceability",
    icon: "Clock",
    difficulty: "beginner",
    tags: ["timeline", "visual", "etapas", "processamento"],
    updatedAt: "22 Abr 2026",
    readingTime: 4,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Timeline Visual de Transações",
      },
      {
        type: "paragraph",
        text: "A Timeline Visual é uma representação gráfica de todas as etapas que uma transação percorreu, desde a criação até a confirmação final. Cada ponto na timeline mostra o evento, o timestamp com precisão de milissegundos, o responsável (sistema ou humano) e links para artifacts e logs relacionados.",
      },
      {
        type: "heading",
        level: 3,
        text: "Elementos da Timeline",
      },
      {
        type: "table",
        headers: ["Ícone", "Significado", "Cor"],
        rows: [
          ["Círculo sólido", "Etapa concluída com sucesso", "Verde"],
          ["Círculo com borda", "Etapa em andamento", "Azul pulsante"],
          ["Triângulo", "Atenção ou alerta nesta etapa", "Amarelo"],
          ["X vermelho", "Erro ou rejeição nesta etapa", "Vermelho"],
          ["Relógio", "Aguardando ação manual", "Cinza"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Interatividade",
        text: "Cada ponto na timeline é clicável. Ao clicar, expande-se um painel lateral com detalhes completos da etapa, incluindo o JSON artifact correspondente e links para o trace no Jaeger.",
      },
      {
        type: "heading",
        level: 3,
        text: "Exemplo de Timeline",
      },
      {
        type: "paragraph",
        text: "Uma transação de saque típica gera a seguinte timeline:",
      },
      {
        type: "steps",
        items: [
          {
            title: "14:30:00.123 — Transação criada",
            description:
              "Cliente solicitou saque de 2.5 ETH via API. Request validado pelo API Gateway.",
          },
          {
            title: "14:30:00.245 — Compliance check iniciado",
            description:
              "15 regras avaliadas. Score de risco: 0.12 (baixo). Decisão: aprovada automaticamente.",
          },
          {
            title: "14:30:00.890 — Transação assinada",
            description:
              "Key Vault assinou a transação usando ECDSA. Key ID: key_eth_main_001.",
          },
          {
            title: "14:30:01.100 — Submetida à blockchain",
            description:
              "TX submetida via Infura (provider primário). Gas: 21000, Gas Price: 25 Gwei.",
          },
          {
            title: "14:30:13.500 — Primeira confirmação",
            description:
              "Transação incluída no bloco #19,845,623. Aguardando 12 confirmações.",
          },
          {
            title: "14:33:01.200 — Confirmação final (12/12)",
            description:
              "12 confirmações alcançadas. Saldo atualizado. Webhook enviado ao cliente.",
          },
        ],
      },
      {
        type: "paragraph",
        text: "A timeline também mostra o tempo decorrido entre cada etapa, facilitando a identificação de gargalos. No exemplo acima, a maior parte do tempo (3 minutos) foi gasta aguardando confirmações on-chain — comportamento esperado para Ethereum.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use a timeline para comparar transações similares. Se uma transação demorou muito mais que o normal em uma etapa específica, pode indicar um problema no serviço ou provider daquela etapa.",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/jaeger-tracing",
        title: "Jaeger Tracing",
        description:
          "Para análise técnica mais profunda, veja o trace distribuído completo no Jaeger",
      },
    ],
  },
  {
    slug: "filtros-avancados",
    title: "Filtros Avançados",
    description:
      "Filtros avançados para buscar transações por múltiplos critérios no módulo de Traceability.",
    category: "traceability",
    icon: "SlidersHorizontal",
    difficulty: "intermediate",
    tags: ["filtros", "busca avançada", "critérios", "segmentação"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Filtros Avançados de Transações",
      },
      {
        type: "paragraph",
        text: "O módulo de Traceability oferece um sistema de filtros avançados que permite combinar múltiplos critérios para localizar exatamente as transações que você precisa analisar. Os filtros são especialmente úteis para investigações de compliance, análise de padrões e auditoria.",
      },
      {
        type: "heading",
        level: 3,
        text: "Critérios de Filtro",
      },
      {
        type: "table",
        headers: ["Critério", "Operadores", "Exemplo"],
        rows: [
          ["Valor (USD)", "=, >, <, >=, <=, between", "> $50,000"],
          ["Chain", "=, in", "ethereum, polygon"],
          ["Token", "=, in", "USDT, USDC"],
          ["Status", "=, in, not", "confirmed, pending"],
          ["Data", "between, before, after", "entre 1-15 Abr 2026"],
          ["Cliente", "=, in", "client_x9y8z7"],
          ["Endereço", "=, starts_with", "0x1234..."],
          ["Compliance Flag", "=, exists", "flagged, reviewed"],
          ["Tempo de confirmação", ">, <", "> 10 minutos"],
          ["Número de retries", ">, >=", ">= 2"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Construindo Queries Complexas",
      },
      {
        type: "paragraph",
        text: "Os filtros podem ser combinados usando operadores lógicos AND e OR, com suporte a agrupamento de condições. Isso permite queries sofisticadas para investigações específicas.",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "filters": {\n    "AND": [\n      { "chain": { "in": ["ethereum", "polygon"] } },\n      { "value_usd": { "gte": 10000 } },\n      { "created_at": { "between": ["2026-04-01", "2026-04-22"] } },\n      {\n        "OR": [\n          { "compliance_flag": { "eq": "flagged" } },\n          { "retry_count": { "gte": 2 } }\n        ]\n      }\n    ]\n  },\n  "sort": { "field": "value_usd", "order": "desc" },\n  "limit": 50\n}',
        filename: "advanced-filter.json",
      },
      {
        type: "callout",
        variant: "info",
        title: "Query Builder visual",
        text: "Na interface, use o Query Builder visual que permite arrastar e soltar condições. Cada condição mostra em tempo real quantos resultados correspondem, facilitando o refinamento do filtro.",
      },
      {
        type: "heading",
        level: 3,
        text: "Presets de Filtro Úteis",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Transações grandes recentes: value > $100K AND últimas 24h",
          "Transações com problemas: status = failed OR retry_count > 0",
          "Flags de compliance: compliance_flag = flagged AND status != rejected",
          "Transações lentas: confirmation_time > 30min AND status = confirmed",
          "Primeiro saque de cliente: type = withdrawal AND tx_sequence = 1",
        ],
      },
      {
        type: "steps",
        items: [
          {
            title: "Abrir filtros avançados",
            description:
              "Na tela de Traceability, clique em 'Filtros Avançados' para expandir o painel completo de filtros.",
          },
          {
            title: "Adicionar condições",
            description:
              "Clique em 'Adicionar Condição' e selecione o critério, operador e valor. Repita para cada condição.",
          },
          {
            title: "Agrupar condições",
            description:
              "Use os botões AND/OR para definir a lógica entre condições. Crie grupos para queries mais complexas.",
          },
          {
            title: "Salvar como preset",
            description:
              "Dê um nome ao filtro e salve. Presets salvos aparecem como botões rápidos no topo da tela.",
          },
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Exporte os resultados filtrados diretamente para CSV, JSON ou XLSX. O export mantém todos os campos das transações, incluindo artifacts resumidos.",
      },
      {
        type: "link-card",
        href: "/support/kb/traceability/links-explorers",
        title: "Links para Explorers",
        description:
          "Verifique transações diretamente nos block explorers a partir do módulo de Traceability",
      },
    ],
  },
  {
    slug: "links-explorers",
    title: "Links para Explorers",
    description:
      "Navegação direta para block explorers a partir das transações rastreadas no sistema.",
    category: "traceability",
    icon: "ExternalLink",
    difficulty: "beginner",
    tags: ["explorers", "blockchain", "verificação", "links"],
    updatedAt: "22 Abr 2026",
    readingTime: 4,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Links para Block Explorers",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub gera automaticamente links para block explorers de cada blockchain configurada. Esses links permitem verificar transações diretamente na blockchain, confirmando de forma independente que os dados exibidos na plataforma correspondem à realidade on-chain.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Verificação independente",
        text: "Links para explorers são essenciais para auditoria e transparência. Eles permitem que qualquer pessoa — administrador, auditor ou regulador — verifique a transação diretamente na blockchain sem precisar confiar exclusivamente nos dados da plataforma.",
      },
      {
        type: "heading",
        level: 3,
        text: "Explorers por Chain",
      },
      {
        type: "table",
        headers: ["Chain", "Explorer", "URL Base"],
        rows: [
          ["Ethereum", "Etherscan", "https://etherscan.io"],
          ["Bitcoin", "Mempool.space", "https://mempool.space"],
          ["Polygon", "Polygonscan", "https://polygonscan.com"],
          ["BSC", "BscScan", "https://bscscan.com"],
          ["Arbitrum", "Arbiscan", "https://arbiscan.io"],
          ["Tron", "Tronscan", "https://tronscan.org"],
          ["Solana", "Solscan", "https://solscan.io"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Links Disponíveis",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Transação: link direto para os detalhes da transação no explorer",
          "Endereço: link para o histórico completo de um endereço",
          "Bloco: link para o bloco onde a transação foi confirmada",
          "Token: link para o contrato e métricas do token",
          "Internal Transactions: link para transações internas (traces) quando disponível",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Onde Encontrar os Links",
      },
      {
        type: "paragraph",
        text: "Links para explorers estão disponíveis em múltiplos locais da interface:",
      },
      {
        type: "steps",
        items: [
          {
            title: "Na lista de transações",
            description:
              "Cada linha da tabela de transações possui um ícone de link externo que abre a transação no explorer da chain correspondente.",
          },
          {
            title: "Na página de detalhes",
            description:
              "A seção 'Blockchain' dos detalhes da transação exibe links para a transação, bloco e endereços envolvidos.",
          },
          {
            title: "Na timeline",
            description:
              "O ponto de 'Submissão' na timeline inclui o link do explorer quando disponível (após submissão on-chain).",
          },
          {
            title: "Nos artifacts",
            description:
              "Artifacts do tipo 'chain_submission' e 'confirmation' incluem links para explorer em seus dados.",
          },
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Os links de explorer abrem em nova aba por padrão. Configure nas preferências se prefere abrir na mesma aba ou em um painel lateral integrado.",
      },
      {
        type: "code",
        language: "typescript",
        code: '// A API retorna links de explorer para cada transação\nconst tx = await adminClient.transactions.get("tx_abc123");\n\nconsole.log(tx.explorer_links);\n// {\n//   transaction: "https://etherscan.io/tx/0x1234...abcd",\n//   from_address: "https://etherscan.io/address/0xaaaa...",\n//   to_address: "https://etherscan.io/address/0xbbbb...",\n//   block: "https://etherscan.io/block/19845623",\n//   token_contract: "https://etherscan.io/token/0xdac17f..."\n// }',
        filename: "explorer-links.ts",
      },
      {
        type: "paragraph",
        text: "Para chains customizadas, o administrador pode configurar o explorer URL pattern em Admin > Chains & Tokens > [chain] > Explorer Settings. O pattern aceita variáveis como {txHash}, {address} e {blockNumber}.",
      },
      {
        type: "link-card",
        href: "/support/kb/chains/adicionar-chain",
        title: "Adicionar Nova Chain",
        description:
          "Ao adicionar uma nova chain, configure também o explorer para links automáticos",
      },
    ],
  },
];
