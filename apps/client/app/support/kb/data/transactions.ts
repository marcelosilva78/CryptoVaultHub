import type { Article } from "../components/types";

export const transactionsArticles: Article[] = [
  {
    slug: "enviar-transacao",
    title: "Enviar uma Transação",
    description:
      "Guia completo para enviar uma transação on-chain pela interface ou API, incluindo estimativa de gas e confirmação.",
    category: "transactions",
    icon: "Send",
    difficulty: "beginner",
    tags: ["transação", "enviar", "transfer", "gas"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Enviando uma Transação",
      },
      {
        type: "paragraph",
        text: "Enviar uma transação na plataforma CryptoVaultHub significa transferir fundos de uma wallet gerenciada para um endereço de destino na blockchain. O processo inclui validação de saldo, estimativa de gas, aprovação (se necessário) e broadcast na rede.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Transações são irreversíveis",
        text: "Uma vez confirmada na blockchain, uma transação não pode ser revertida. Verifique cuidadosamente o endereço de destino, a rede e o valor antes de confirmar. Enviar fundos para a rede errada pode resultar em perda permanente.",
      },
      {
        type: "heading",
        level: 3,
        text: "Envio pela Interface",
      },
      {
        type: "steps",
        items: [
          {
            title: "Selecionar a wallet de origem",
            description:
              "Na tela de Wallets, clique na wallet da qual deseja enviar fundos. Verifique se o saldo é suficiente para cobrir o valor + taxas de gas.",
          },
          {
            title: "Clicar em 'Enviar'",
            description:
              "Clique no botão 'Enviar' na página da wallet. O formulário de transferência será aberto.",
          },
          {
            title: "Preencher os dados da transação",
            description:
              "Informe o endereço de destino (será validado automaticamente), o valor a enviar e, opcionalmente, uma nota interna para referência.",
          },
          {
            title: "Revisar estimativa de gas",
            description:
              "O sistema calculará automaticamente a taxa de gas estimada. Você pode optar por prioridade slow, medium ou fast, que afeta o tempo de confirmação.",
          },
          {
            title: "Confirmar com 2FA",
            description:
              "Insira o código 2FA para autorizar a transação. Se a wallet for co-sign, a transação entrará em fila de aprovação.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Envio via API",
      },
      {
        type: "code",
        language: "bash",
        code: 'curl -X POST https://api.vaulthub.live/v1/transactions \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "wallet_id": "wal_abc123",\n    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD78",\n    "amount": "0.5",\n    "currency": "ETH",\n    "priority": "medium",\n    "note": "Pagamento fornecedor #1234",\n    "idempotency_key": "pay_1234_20260422"\n  }\'',
        filename: "send-transaction.sh",
      },
      {
        type: "heading",
        level: 3,
        text: "Prioridades de Gas",
      },
      {
        type: "table",
        headers: ["Prioridade", "Tempo Estimado (ETH)", "Custo Relativo"],
        rows: [
          ["Slow", "5-10 minutos", "Menor (base fee)"],
          ["Medium", "1-3 minutos", "Moderado (+20% base)"],
          ["Fast", "15-30 segundos", "Maior (+50% base)"],
        ],
      },
      {
        type: "callout",
        variant: "tip",
        title: "Idempotency Key",
        text: "Sempre envie um idempotency_key único por transação ao usar a API. Isso previne duplicação em caso de retry por timeout ou falha de rede. A plataforma rejeitará transações duplicadas com a mesma key.",
      },
      {
        type: "paragraph",
        text: "Após o envio, a transação receberá o status 'pending' e você poderá acompanhar o progresso em tempo real pela tela de Transactions ou via webhooks.",
      },
      {
        type: "link-card",
        href: "/support/kb/transactions/receber-transacao",
        title: "Receber uma Transação",
        description:
          "Saiba como receber fundos nos seus endereços de depósito",
      },
    ],
  },
  {
    slug: "receber-transacao",
    title: "Receber uma Transação",
    description:
      "Como receber fundos nos seus endereços de depósito e configurar notificações automáticas de recebimento.",
    category: "transactions",
    icon: "Download",
    difficulty: "beginner",
    tags: ["transação", "receber", "depósito", "endereço"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Recebendo Fundos",
      },
      {
        type: "paragraph",
        text: "Para receber fundos na plataforma CryptoVaultHub, basta compartilhar um endereço de depósito da wallet desejada com o remetente. A plataforma monitora automaticamente todos os endereços e notifica quando fundos são recebidos.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Monitoramento automático",
        text: "A plataforma monitora todos os seus endereços 24/7, detectando depósitos automaticamente. Você receberá notificações por webhook e/ou e-mail conforme configurado.",
      },
      {
        type: "heading",
        level: 3,
        text: "Compartilhar Endereço de Depósito",
      },
      {
        type: "steps",
        items: [
          {
            title: "Selecionar a wallet",
            description:
              "Na tela de Wallets, clique na wallet onde deseja receber os fundos.",
          },
          {
            title: "Copiar endereço de depósito",
            description:
              "Na aba 'Endereços', copie o endereço desejado clicando no ícone de cópia. Você também pode gerar um novo endereço dedicado.",
          },
          {
            title: "Compartilhar com o remetente",
            description:
              "Envie o endereço ao remetente por um canal seguro. Verifique a rede — enviar para a rede errada pode resultar em perda de fundos.",
          },
          {
            title: "Aguardar confirmações",
            description:
              "Após o envio pelo remetente, a transação aparecerá no seu dashboard com status 'pending' até atingir o número de confirmações necessárias.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Confirmações por Chain",
      },
      {
        type: "table",
        headers: ["Chain", "Confirmações Necessárias", "Tempo Estimado"],
        rows: [
          ["Bitcoin", "3 blocos", "~30 minutos"],
          ["Ethereum", "12 blocos", "~3 minutos"],
          ["Polygon", "30 blocos", "~1 minuto"],
          ["Tron", "20 blocos", "~1 minuto"],
          ["BSC", "15 blocos", "~45 segundos"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Notificações de Recebimento",
      },
      {
        type: "paragraph",
        text: "Configure webhooks para receber notificações automáticas de depósito. O evento 'deposit.confirmed' é disparado quando a transação atinge o número mínimo de confirmações da chain.",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "event": "deposit.confirmed",\n  "data": {\n    "transaction_id": "tx_abc123",\n    "wallet_id": "wal_abc123",\n    "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD78",\n    "amount": "1.5",\n    "currency": "ETH",\n    "confirmations": 12,\n    "tx_hash": "0xabc123...def456"\n  }\n}',
        filename: "deposit-webhook-payload.json",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use endereços únicos para cada pagamento para facilitar a conciliação automática. O campo 'label' e 'metadata' do endereço são incluídos no webhook, permitindo identificar a origem do depósito.",
      },
      {
        type: "link-card",
        href: "/support/kb/transactions/rastrear-status",
        title: "Rastrear Status da Transação",
        description:
          "Acompanhe o progresso e status de qualquer transação em tempo real",
      },
    ],
  },
  {
    slug: "rastrear-status",
    title: "Rastrear Status da Transação",
    description:
      "Como acompanhar o status de transações em tempo real, entender os estados e usar o explorer integrado.",
    category: "transactions",
    icon: "Search",
    difficulty: "intermediate",
    tags: ["transação", "status", "rastrear", "explorer", "hash"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Rastreamento de Transações",
      },
      {
        type: "paragraph",
        text: "A plataforma CryptoVaultHub oferece rastreamento em tempo real de todas as transações com rastreabilidade completa. Cada transação possui um ciclo de vida com estados bem definidos, acessíveis pela interface e API.",
      },
      {
        type: "heading",
        level: 3,
        text: "Estados da Transação",
      },
      {
        type: "table",
        headers: ["Status", "Descrição", "Ação Possível"],
        rows: [
          ["draft", "Transação criada mas não submetida", "Editar, cancelar, submeter"],
          ["pending_approval", "Aguardando aprovação (co-sign)", "Aprovar, rejeitar"],
          ["pending", "Submetida à rede, aguardando confirmação", "Aguardar"],
          ["confirming", "Primeira confirmação recebida", "Aguardar"],
          ["confirmed", "Confirmações mínimas atingidas", "Nenhuma"],
          ["failed", "Falha na execução on-chain", "Reenviar"],
          ["cancelled", "Cancelada antes do broadcast", "Nenhuma"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Fluxo de Vida",
      },
      {
        type: "mermaid",
        chart:
          "stateDiagram-v2\n  [*] --> draft\n  draft --> pending_approval: Wallet co-sign\n  draft --> pending: Wallet managed\n  pending_approval --> pending: Aprovada\n  pending_approval --> cancelled: Rejeitada\n  pending --> confirming: 1a confirmação\n  confirming --> confirmed: Confirmações OK\n  pending --> failed: Erro on-chain\n  draft --> cancelled: Cancelada",
      },
      {
        type: "heading",
        level: 3,
        text: "Consulta por Hash",
      },
      {
        type: "paragraph",
        text: "Você pode rastrear qualquer transação usando o hash (tx_hash) retornado após o broadcast. A plataforma integra links diretos para block explorers de cada chain (Etherscan, Blockchair, Polygonscan, etc.).",
      },
      {
        type: "code",
        language: "bash",
        code: '# Consultar status da transação via API\ncurl https://api.vaulthub.live/v1/transactions/tx_abc123 \\\n  -H "Authorization: Bearer $API_KEY"\n\n# Resposta inclui:\n# - status atual\n# - número de confirmações\n# - tx_hash para explorer\n# - timestamps de cada estado\n# - detalhes de gas utilizado',
        filename: "track-transaction.sh",
      },
      {
        type: "callout",
        variant: "info",
        title: "Traceability JSON",
        text: "Cada transação possui um objeto de traceability completo com todos os timestamps, estados intermediários, IPs de origem, aprovações e detalhes de gas. Esse JSON pode ser exportado para compliance e auditoria.",
      },
      {
        type: "paragraph",
        text: "A tela de detalhes da transação exibe uma timeline visual com todos os eventos, desde a criação até a confirmação final. Clique em qualquer evento para ver os detalhes expandidos.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Configure webhooks para eventos de transação (transaction.confirmed, transaction.failed) para automatizar seu fluxo de negócio sem precisar consultar o status manualmente.",
      },
      {
        type: "link-card",
        href: "/support/kb/transactions/historico-filtros",
        title: "Histórico e Filtros",
        description:
          "Explore o histórico completo de transações com filtros avançados",
      },
    ],
  },
  {
    slug: "historico-filtros",
    title: "Histórico e Filtros",
    description:
      "Como navegar pelo histórico de transações com filtros avançados, exportação e busca full-text.",
    category: "transactions",
    icon: "Filter",
    difficulty: "intermediate",
    tags: ["histórico", "filtros", "busca", "exportar", "transações"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Histórico de Transações",
      },
      {
        type: "paragraph",
        text: "A tela de Transactions exibe o histórico completo de todas as transações da sua conta, com suporte a filtros avançados, ordenação multi-coluna e exportação em múltiplos formatos. A tabela é otimizada para grandes volumes.",
      },
      {
        type: "heading",
        level: 3,
        text: "Filtros Disponíveis",
      },
      {
        type: "table",
        headers: ["Filtro", "Opções", "Descrição"],
        rows: [
          ["Status", "draft, pending, confirming, confirmed, failed, cancelled", "Filtrar por estado atual"],
          ["Direção", "incoming, outgoing", "Depósitos ou envios"],
          ["Chain", "Qualquer chain habilitada", "Filtrar por blockchain"],
          ["Wallet", "Qualquer wallet da conta", "Filtrar por wallet específica"],
          ["Período", "Hoje, 7 dias, 30 dias, customizado", "Filtrar por intervalo de datas"],
          ["Valor", "Min / Max", "Filtrar por faixa de valor"],
        ],
      },
      {
        type: "callout",
        variant: "tip",
        title: "Filtros persistentes",
        text: "Os filtros selecionados são salvos na URL, permitindo compartilhar links filtrados com colegas ou salvar como favorito no navegador para acesso rápido.",
      },
      {
        type: "heading",
        level: 3,
        text: "Busca Full-Text",
      },
      {
        type: "paragraph",
        text: "O campo de busca permite pesquisar por hash de transação, endereço de destino, nota interna ou ID da transação. A busca é instantânea e funciona em conjunto com os filtros aplicados.",
      },
      {
        type: "heading",
        level: 3,
        text: "Exportação de Dados",
      },
      {
        type: "paragraph",
        text: "Exporte o histórico de transações nos formatos CSV, JSON ou PDF. A exportação respeita os filtros aplicados, permitindo gerar relatórios customizados. Para exportações agendadas, utilize a seção Exports.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Exportar transações via API com filtros\ncurl "https://api.vaulthub.live/v1/transactions/export?format=csv&status=confirmed&chain=ethereum&from=2026-04-01&to=2026-04-22" \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -o transactions_april.csv',
        filename: "export-transactions.sh",
      },
      {
        type: "heading",
        level: 3,
        text: "Ordenação",
      },
      {
        type: "paragraph",
        text: "Clique em qualquer cabeçalho de coluna para ordenar. Segure Shift e clique em múltiplas colunas para ordenação multi-nível (ex: primeiro por status, depois por data).",
      },
      {
        type: "callout",
        variant: "info",
        text: "O histórico retém todas as transações desde a criação da conta, sem limite de retenção. Transações mais antigas são armazenadas em archive e podem ter um tempo de consulta ligeiramente maior.",
      },
      {
        type: "link-card",
        href: "/support/kb/transactions/pendentes-falhas",
        title: "Transações Pendentes e Falhas",
        description:
          "Entenda por que transações ficam pendentes ou falham e como resolver",
      },
    ],
  },
  {
    slug: "pendentes-falhas",
    title: "Transações Pendentes e Falhas",
    description:
      "Diagnóstico e resolução de transações pendentes por muito tempo ou que falharam na execução on-chain.",
    category: "transactions",
    icon: "AlertTriangle",
    difficulty: "advanced",
    tags: ["transação", "pendente", "falha", "troubleshooting", "gas"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Diagnóstico de Transações Pendentes e Falhas",
      },
      {
        type: "paragraph",
        text: "Transações podem ficar pendentes ou falhar por diversos motivos: gas insuficiente, nonce incorreto, congestionamento da rede ou rejeição pelo smart contract. Este guia ajuda a diagnosticar e resolver os problemas mais comuns.",
      },
      {
        type: "heading",
        level: 3,
        text: "Causas Comuns de Pendência",
      },
      {
        type: "table",
        headers: ["Causa", "Sintoma", "Solução"],
        rows: [
          ["Gas muito baixo", "Transação não é incluída em blocos", "Aumentar gas price (speed up)"],
          ["Congestionamento de rede", "Tempo de confirmação acima do normal", "Aguardar ou speed up"],
          ["Nonce gap", "Transação presa aguardando transação anterior", "Resolver transação anterior"],
          ["Saldo insuficiente para gas", "Transação rejeitada pelo nó", "Depositar fundos para gas"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Speed Up",
        text: "A funcionalidade 'Speed Up' permite reenviar uma transação pendente com gas price maior, acelerando sua inclusão em um bloco. O sistema substitui a transação original usando o mesmo nonce.",
      },
      {
        type: "heading",
        level: 3,
        text: "Causas Comuns de Falha",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Out of gas — o gas limit foi insuficiente para executar a transação completa",
          "Revert — o smart contract rejeitou a transação (ex: token com blacklist, saldo ERC-20 insuficiente)",
          "Bad instruction — bytecode incompatível com a versão da EVM",
          "Insufficient funds — saldo insuficiente no momento da mineração (mudou entre envio e mineração)",
          "Contract execution error — erro lógico no contrato de destino",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Como Speed Up uma Transação",
      },
      {
        type: "steps",
        items: [
          {
            title: "Localizar a transação pendente",
            description:
              "Na tela de Transactions, filtre por status 'pending' para encontrar transações pendentes.",
          },
          {
            title: "Clicar em 'Speed Up'",
            description:
              "Na página de detalhes da transação, clique no botão 'Speed Up'. O sistema calculará um novo gas price.",
          },
          {
            title: "Confirmar o novo gas price",
            description:
              "O gas price sugerido será 20-50% acima do original. Você pode ajustar manualmente se desejar prioridade maior.",
          },
          {
            title: "Confirmar com 2FA",
            description:
              "Autorize a substituição com seu código 2FA. A transação original será substituída pela nova.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Reenvio de Transações Falhadas",
      },
      {
        type: "code",
        language: "bash",
        code: '# Reenviar transação falhada via API\ncurl -X POST https://api.vaulthub.live/v1/transactions/tx_abc123/retry \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "gas_price_multiplier": 1.5,\n    "gas_limit_multiplier": 1.2\n  }\'',
        filename: "retry-transaction.sh",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Não faça retry manual",
        text: "Nunca tente reenviar uma transação manualmente criando uma nova transação com os mesmos dados. Use sempre a funcionalidade de retry da plataforma para garantir o gerenciamento correto de nonce.",
      },
      {
        type: "paragraph",
        text: "Se uma transação continuar falhando após o retry, verifique se o endereço de destino é um contrato e se aceita a operação que você está tentando realizar. Para suporte adicional, utilize a seção de FAQ ou entre em contato com o administrador.",
      },
      {
        type: "link-card",
        href: "/support/kb/deposits-withdrawals/como-depositar",
        title: "Como Fazer um Depósito",
        description:
          "Aprenda os detalhes específicos sobre depósitos e suas confirmações",
      },
    ],
  },
];
