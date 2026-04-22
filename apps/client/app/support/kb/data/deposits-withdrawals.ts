import type { Article } from "../components/types";

export const depositsWithdrawalsArticles: Article[] = [
  {
    slug: "como-depositar",
    title: "Como Fazer um Depósito",
    description:
      "Guia passo a passo para depositar fundos na plataforma, incluindo chains suportadas e valores mínimos.",
    category: "deposits-withdrawals",
    icon: "ArrowDownToLine",
    difficulty: "beginner",
    tags: ["depósito", "deposit", "fundos", "receber"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Depositando Fundos na Plataforma",
      },
      {
        type: "paragraph",
        text: "Depósitos são a principal forma de adicionar fundos às suas wallets no CryptoVaultHub. O processo envolve enviar criptoativos para um endereço de depósito gerado pela plataforma. A detecção é automática e você será notificado assim que as confirmações forem atingidas.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Verifique a rede antes de enviar",
        text: "Sempre verifique se está enviando na rede correta. Enviar ETH para um endereço Tron ou tokens ERC-20 para a rede Bitcoin resultará em perda permanente dos fundos. A plataforma não pode recuperar fundos enviados na rede errada.",
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
            title: "Acessar a tela de Depósitos",
            description:
              "No menu lateral, clique em Operations > Deposits. Você verá o histórico de depósitos e o botão para iniciar um novo.",
          },
          {
            title: "Selecionar a wallet e chain",
            description:
              "Escolha a wallet de destino e a blockchain correspondente. Somente endereços compatíveis com a chain selecionada serão exibidos.",
          },
          {
            title: "Obter o endereço de depósito",
            description:
              "O sistema exibirá o endereço de depósito com QR code. Copie o endereço ou escaneie o QR code com sua wallet de origem.",
          },
          {
            title: "Enviar os fundos",
            description:
              "Realize o envio pela wallet de origem (exchange, wallet pessoal, etc.). A plataforma detectará automaticamente a transação.",
          },
          {
            title: "Aguardar confirmações",
            description:
              "O depósito aparecerá como 'pending' até atingir o número de confirmações necessárias para a chain. Após confirmação, os fundos estarão disponíveis.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Valores Mínimos de Depósito",
      },
      {
        type: "table",
        headers: ["Chain", "Moeda Nativa", "Mínimo", "Tokens (ERC-20/TRC-20)"],
        rows: [
          ["Ethereum", "ETH", "0.001 ETH", "10 USDT"],
          ["Bitcoin", "BTC", "0.0001 BTC", "N/A"],
          ["Polygon", "MATIC", "1 MATIC", "10 USDT"],
          ["Tron", "TRX", "10 TRX", "10 USDT"],
          ["BSC", "BNB", "0.01 BNB", "10 USDT"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Depósitos abaixo do mínimo",
        text: "Depósitos abaixo do valor mínimo serão detectados pela plataforma mas NÃO creditados automaticamente. Esses valores serão acumulados e creditados quando a soma atingir o mínimo.",
      },
      {
        type: "paragraph",
        text: "Após a confirmação, o saldo da wallet será atualizado automaticamente e um webhook 'deposit.confirmed' será disparado se configurado. O depósito aparecerá no histórico de transações com todos os detalhes de rastreabilidade.",
      },
      {
        type: "link-card",
        href: "/support/kb/deposits-withdrawals/confirmacoes",
        title: "Confirmações de Depósito",
        description:
          "Entenda como funciona o processo de confirmação por chain e tempo estimado",
      },
    ],
  },
  {
    slug: "confirmacoes",
    title: "Confirmações de Depósito",
    description:
      "Como funciona o processo de confirmação de depósitos, número de confirmações por chain e como monitorar.",
    category: "deposits-withdrawals",
    icon: "CheckCircle2",
    difficulty: "intermediate",
    tags: ["confirmação", "depósito", "blocos", "segurança"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Processo de Confirmação",
      },
      {
        type: "paragraph",
        text: "Confirmações são blocos adicionados à blockchain após o bloco que contém sua transação. Cada novo bloco torna mais difícil reverter a transação, aumentando sua segurança. A plataforma exige um número mínimo de confirmações antes de creditar os fundos.",
      },
      {
        type: "heading",
        level: 3,
        text: "Por que Confirmações são Necessárias?",
      },
      {
        type: "paragraph",
        text: "Em blockchains públicas, existe a possibilidade teórica de reorganização de blocos (reorg), onde uma cadeia alternativa substitui os blocos recentes. Aguardar múltiplas confirmações garante que a transação seja efetivamente irreversível.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Segurança vs Velocidade",
        text: "O número de confirmações é calibrado para equilibrar segurança e velocidade. Chains mais rápidas (Polygon, BSC) precisam de mais confirmações por bloco para atingir o mesmo nível de segurança que chains mais lentas (Bitcoin).",
      },
      {
        type: "heading",
        level: 3,
        text: "Confirmações por Chain",
      },
      {
        type: "table",
        headers: ["Chain", "Confirmações", "Tempo Estimado", "Razão"],
        rows: [
          ["Bitcoin", "3", "~30 min", "Alta segurança por bloco, PoW robusto"],
          ["Ethereum", "12", "~3 min", "Finalidade probabilística, PoS com finality gadget"],
          ["Polygon", "30", "~1 min", "Blocos rápidos, reorgs mais frequentes"],
          ["Tron", "20", "~1 min", "DPoS com período curto de bloco"],
          ["BSC", "15", "~45 seg", "Validadores autorizados, blocos rápidos"],
          ["Solana", "32", "~13 seg", "Alta velocidade, confirmação probabilística"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Monitoramento de Confirmações",
      },
      {
        type: "paragraph",
        text: "Na tela de detalhes do depósito, uma barra de progresso exibe o número atual de confirmações vs. o necessário. A atualização é em tempo real via WebSocket, sem necessidade de refresh manual.",
      },
      {
        type: "mermaid",
        chart:
          "sequenceDiagram\n  participant U as Usuário\n  participant P as Plataforma\n  participant B as Blockchain\n  U->>B: Envia transação\n  B->>P: Transação detectada (0 conf)\n  P->>U: Webhook: deposit.detected\n  loop A cada bloco\n    B->>P: Nova confirmação\n    P->>P: Atualiza contador\n  end\n  P->>U: Webhook: deposit.confirmed\n  P->>P: Credita saldo",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Utilize o webhook 'deposit.detected' para notificar seu usuário que o depósito foi identificado, mesmo antes da confirmação completa. Isso melhora a experiência do usuário final.",
      },
      {
        type: "link-card",
        href: "/support/kb/deposits-withdrawals/solicitar-withdrawal",
        title: "Solicitar Withdrawal",
        description:
          "Saiba como solicitar saques e os limites aplicáveis",
      },
    ],
  },
  {
    slug: "solicitar-withdrawal",
    title: "Solicitar Withdrawal",
    description:
      "Como solicitar um saque (withdrawal) da plataforma, incluindo limites, aprovações e tempos de processamento.",
    category: "deposits-withdrawals",
    icon: "ArrowUpFromLine",
    difficulty: "intermediate",
    tags: ["withdrawal", "saque", "envio", "limites"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Solicitando um Withdrawal",
      },
      {
        type: "paragraph",
        text: "Um withdrawal (saque) é o processo de transferir fundos de uma wallet na plataforma para um endereço externo. O processo pode incluir etapas de aprovação dependendo do valor e das políticas do seu projeto.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Endereço de destino",
        text: "Verifique cuidadosamente o endereço de destino antes de confirmar. Saques para endereços incorretos são irreversíveis. A plataforma valida o formato do endereço mas não pode verificar a propriedade.",
      },
      {
        type: "heading",
        level: 3,
        text: "Processo de Withdrawal",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar a tela de Withdrawals",
            description:
              "No menu lateral, clique em Operations > Withdrawals. A tela exibe o histórico de saques e o botão para nova solicitação.",
          },
          {
            title: "Selecionar wallet e valor",
            description:
              "Escolha a wallet de origem, o valor a sacar e o endereço de destino. O sistema verificará automaticamente se o saldo e os limites permitem a operação.",
          },
          {
            title: "Escolher prioridade",
            description:
              "Selecione a prioridade da transação (slow, medium, fast) que define o gas price e tempo estimado de confirmação.",
          },
          {
            title: "Confirmar com 2FA",
            description:
              "Insira seu código 2FA para autorizar o saque. Para wallets co-sign, a solicitação será enviada para aprovação dos co-signers.",
          },
          {
            title: "Acompanhar processamento",
            description:
              "A transação será processada conforme a prioridade e políticas de aprovação. Acompanhe o status em tempo real na tela de Withdrawals.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Fluxo de Aprovação",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Solicitação] --> B{Valor < Auto-aprovação?}\n  B -- Sim --> C[Processamento Automático]\n  B -- Não --> D{Co-Sign habilitado?}\n  D -- Sim --> E[Fila de Aprovação]\n  D -- Não --> C\n  E --> F{Aprovações suficientes?}\n  F -- Sim --> C\n  F -- Não --> G[Aguardando Aprovadores]\n  G --> F\n  C --> H[Broadcast on-chain]\n  H --> I[Confirmação]",
      },
      {
        type: "heading",
        level: 3,
        text: "Tempos de Processamento",
      },
      {
        type: "table",
        headers: ["Cenário", "Tempo Estimado"],
        rows: [
          ["Auto-aprovado + Fast gas", "1-5 minutos"],
          ["Auto-aprovado + Medium gas", "3-10 minutos"],
          ["Co-sign com 1 aprovação", "Depende do aprovador + tempo de rede"],
          ["Co-sign com 2+ aprovações", "Depende dos aprovadores + tempo de rede"],
          ["Valor acima do limite diário", "Requer aprovação administrativa"],
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Para saques recorrentes, configure a funcionalidade de Whitelist de endereços. Endereços whitelistados podem ter limites de auto-aprovação mais altos, acelerando o processo.",
      },
      {
        type: "code",
        language: "bash",
        code: 'curl -X POST https://api.vaulthub.live/v1/withdrawals \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "wallet_id": "wal_abc123",\n    "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD78",\n    "amount": "2.5",\n    "currency": "ETH",\n    "priority": "medium",\n    "idempotency_key": "wd_20260422_001"\n  }\'',
        filename: "request-withdrawal.sh",
      },
      {
        type: "link-card",
        href: "/support/kb/deposits-withdrawals/limites-regras",
        title: "Limites e Regras",
        description:
          "Conheça os limites de operação e regras aplicáveis a saques",
      },
    ],
  },
  {
    slug: "limites-regras",
    title: "Limites e Regras",
    description:
      "Entenda os limites de transação por tier, limites diários/mensais e regras de compliance aplicáveis.",
    category: "deposits-withdrawals",
    icon: "Gauge",
    difficulty: "intermediate",
    tags: ["limites", "regras", "tier", "diário", "mensal"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Limites e Regras de Operação",
      },
      {
        type: "paragraph",
        text: "A plataforma CryptoVaultHub aplica limites de operação baseados no tier de serviço da sua conta. Esses limites existem para proteger tanto o cliente quanto a plataforma contra operações não autorizadas e garantir conformidade regulatória.",
      },
      {
        type: "heading",
        level: 3,
        text: "Limites por Tier",
      },
      {
        type: "table",
        headers: ["Limite", "Standard", "Professional", "Enterprise"],
        rows: [
          ["Por transação (USD)", "$5.000", "$50.000", "$500.000"],
          ["Diário (USD)", "$25.000", "$250.000", "$2.500.000"],
          ["Mensal (USD)", "$250.000", "$2.500.000", "Ilimitado"],
          ["Wallets por chain", "5", "50", "Ilimitado"],
          ["Endereços por wallet", "1.000", "10.000", "Ilimitado"],
          ["API requests/min", "60", "300", "1.000"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Limites são acumulativos",
        text: "O limite diário é a soma de todas as operações (envios e saques) em todas as wallets dentro de 24 horas. O limite mensal funciona de forma similar para um período de 30 dias corridos.",
      },
      {
        type: "heading",
        level: 3,
        text: "Regras de Compliance",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Transações acima de $10.000 USD requerem verificação KYC completa",
          "Transferências para endereços em listas de sanções são bloqueadas automaticamente",
          "Transações para exchanges descentralizadas podem requerer aprovação adicional",
          "Saques para novos endereços têm um cooldown de 24 horas na primeira vez",
          "Operações em horários atípicos podem acionar verificação adicional",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Consultar Limites Atuais",
      },
      {
        type: "code",
        language: "bash",
        code: '# Consultar limites e utilização atual\ncurl https://api.vaulthub.live/v1/account/limits \\\n  -H "Authorization: Bearer $API_KEY"\n\n# Resposta:\n# {\n#   "tier": "professional",\n#   "limits": {\n#     "per_transaction_usd": 50000,\n#     "daily_usd": 250000,\n#     "daily_used_usd": 12500,\n#     "daily_remaining_usd": 237500,\n#     "monthly_usd": 2500000,\n#     "monthly_used_usd": 145000\n#   }\n# }',
        filename: "check-limits.sh",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Monitore seu consumo de limites pelo dashboard ou configure alertas para receber notificação quando atingir 80% do limite diário ou mensal. Isso evita que operações sejam bloqueadas inesperadamente.",
      },
      {
        type: "paragraph",
        text: "Caso precise de limites maiores, entre em contato com o administrador para solicitar upgrade de tier. O processo de upgrade é imediato e os novos limites entram em vigor instantaneamente.",
      },
      {
        type: "link-card",
        href: "/support/kb/deposits-withdrawals/flush-enderecos",
        title: "Flush de Endereços",
        description:
          "Aprenda a consolidar saldos de múltiplos endereços em um único endereço",
      },
    ],
  },
  {
    slug: "flush-enderecos",
    title: "Flush de Endereços",
    description:
      "Como utilizar a funcionalidade de flush para consolidar saldos de múltiplos endereços de depósito em uma wallet central.",
    category: "deposits-withdrawals",
    icon: "Droplets",
    difficulty: "advanced",
    tags: ["flush", "consolidação", "endereços", "saldos", "gas"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Flush (Consolidação de Saldos)",
      },
      {
        type: "paragraph",
        text: "O flush é o processo de consolidar saldos distribuídos em múltiplos endereços de depósito para um endereço central (master address). Isso é essencial para otimizar custos de gas e facilitar a gestão de fundos quando você utiliza muitos endereços de depósito únicos.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Quando fazer flush?",
        text: "O flush é recomendado quando você tem saldos espalhados em dezenas ou centenas de endereços de depósito. A consolidação reduz o custo total de gas para operações futuras e simplifica a contabilidade.",
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Flush",
      },
      {
        type: "table",
        headers: ["Tipo", "Descrição", "Uso Recomendado"],
        rows: [
          ["Manual", "Selecionar endereços e executar flush sob demanda", "Quando precisa de controle granular"],
          ["Automático", "Flush automático quando saldo atinge threshold configurado", "Para alto volume de depósitos"],
          ["Agendado", "Flush em horários pré-definidos (ex: diário às 2h)", "Para previsibilidade de custos"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Configurar Flush Automático",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar a tela de Flush",
            description:
              "No menu lateral, clique em Operations > Flush. A tela exibe endereços com saldo pendente de consolidação.",
          },
          {
            title: "Selecionar modo de flush",
            description:
              "Escolha entre Manual, Automático ou Agendado. Para automático, configure o threshold mínimo de saldo.",
          },
          {
            title: "Definir endereço de destino",
            description:
              "Selecione o master address para onde os saldos serão consolidados. Geralmente é o endereço principal da wallet.",
          },
          {
            title: "Configurar gas strategy",
            description:
              "Defina a estratégia de gas: economia (slow), equilibrado (medium) ou rápido (fast). Flush em batch economiza gas significativamente.",
          },
          {
            title: "Revisar e confirmar",
            description:
              "O sistema estimará o custo total de gas para o flush. Revise e confirme com 2FA.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Economia de Gas com Batch",
      },
      {
        type: "paragraph",
        text: "O flush em batch agrupa múltiplas transferências em uma única transação quando possível (tokens ERC-20 via multicall). Isso pode reduzir o custo de gas em até 60% comparado a transferências individuais.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Executar flush manual via API\ncurl -X POST https://api.vaulthub.live/v1/flush \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "wallet_id": "wal_abc123",\n    "destination": "0xMasterAddress...",\n    "min_balance": "0.01",\n    "currency": "ETH",\n    "gas_priority": "slow",\n    "batch": true\n  }\'',
        filename: "execute-flush.sh",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Custo de gas para flush",
        text: "O flush consome gas para cada transferência. Certifique-se de que o custo de gas não exceda o saldo sendo consolidado. A plataforma alerta automaticamente quando o flush não é econômico.",
      },
      {
        type: "paragraph",
        text: "Após o flush, todas as transações de consolidação serão listadas no histórico com referência ao flush ID, permitindo rastreabilidade completa das movimentações.",
      },
      {
        type: "link-card",
        href: "/support/kb/projects/criar-projeto",
        title: "Criar um Projeto",
        description:
          "Organize suas operações criando projetos separados para diferentes fins",
      },
    ],
  },
];
