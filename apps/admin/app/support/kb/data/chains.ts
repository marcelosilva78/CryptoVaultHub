import type { Article } from "../components/types";

export const chainsArticles: Article[] = [
  {
    slug: "adicionar-chain",
    title: "Adicionar Nova Chain",
    description:
      "Como configurar e habilitar uma nova blockchain na plataforma de custódia.",
    category: "chains",
    icon: "Link",
    difficulty: "advanced",
    tags: ["chains", "blockchain", "configuração", "nova chain"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Adicionando uma Nova Blockchain",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub suporta múltiplas blockchains simultaneamente. Adicionar uma nova chain envolve configurar os parâmetros de rede, endpoints RPC, derivação de wallets HD e regras de gas. Atualmente o sistema suporta EVM-compatible chains, Bitcoin-like (UTXO), e chains com modelos customizados como Solana e Tron.",
      },
      {
        type: "callout",
        variant: "danger",
        title: "Ambiente de teste obrigatório",
        text: "Sempre teste uma nova chain em ambiente de staging antes de habilitar em produção. Erros de configuração podem resultar em perda de fundos ou transações presas em estado pendente.",
      },
      {
        type: "heading",
        level: 3,
        text: "Pré-requisitos",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Pelo menos 2 endpoints RPC confiáveis (primário + fallback)",
          "Documentação da chain sobre derivação de endereços (BIP-44 path)",
          "Gas Tank com fundos suficientes para operações iniciais",
          "Contrato de token wrapper (se aplicável)",
          "Testnet funcional para validação",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Passo a Passo de Configuração",
      },
      {
        type: "steps",
        items: [
          {
            title: "Registrar a chain",
            description:
              "Acesse Admin > Chains & Tokens > 'Adicionar Chain'. Preencha: nome, chain ID, tipo (EVM/UTXO/Custom), símbolo nativo e número de confirmações requeridas.",
          },
          {
            title: "Configurar RPC Providers",
            description:
              "Adicione pelo menos 2 endpoints RPC. Configure health check interval, timeout e prioridade de failover. O sistema testará a conectividade automaticamente.",
          },
          {
            title: "Definir parâmetros de derivação",
            description:
              "Configure o BIP-44 coin type, depth de derivação e formato de endereço. Para EVM chains, geralmente é m/44'/60'/0'/0/x.",
          },
          {
            title: "Configurar Gas Tank",
            description:
              "Crie um Gas Tank dedicado para a chain e deposite fundos nativos suficientes. Configure alertas de saldo mínimo.",
          },
          {
            title: "Testar em staging",
            description:
              "Execute a suíte de testes de integração da chain: criação de wallet, envio de transação, recebimento e verificação de saldo.",
          },
          {
            title: "Habilitar em produção",
            description:
              "Após validação completa em staging, ative a chain em produção. Clientes existentes poderão criar wallets nesta chain conforme seu tier permitir.",
          },
        ],
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "name": "Arbitrum One",\n  "chain_id": 42161,\n  "type": "EVM",\n  "native_symbol": "ETH",\n  "confirmations_required": 12,\n  "bip44_coin_type": 60,\n  "derivation_path": "m/44\'/60\'/0\'/0",\n  "block_time_ms": 250,\n  "explorer_url": "https://arbiscan.io",\n  "rpc_providers": [\n    {\n      "url": "https://arb1.arbitrum.io/rpc",\n      "priority": 1,\n      "timeout_ms": 5000\n    },\n    {\n      "url": "https://arbitrum-mainnet.infura.io/v3/${INFURA_KEY}",\n      "priority": 2,\n      "timeout_ms": 5000\n    }\n  ]\n}',
        filename: "chain-config-example.json",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Para chains EVM-compatible, a maior parte da configuração é reaproveitada. Use a opção 'Clonar de Chain Existente' para acelerar o setup.",
      },
      {
        type: "paragraph",
        text: "Após a ativação, o sistema inicia automaticamente o sync de blocos a partir do bloco configurado como 'start_block'. O progresso do sync pode ser acompanhado no dashboard de Monitoring.",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/sync-health",
        title: "Sync Health",
        description:
          "Monitore o progresso e saúde da sincronização de blocos das chains configuradas",
      },
    ],
  },
  {
    slug: "configurar-tokens",
    title: "Configurar Tokens",
    description:
      "Como adicionar e gerenciar tokens (ERC-20, BEP-20, etc.) nas chains habilitadas.",
    category: "chains",
    icon: "Coins",
    difficulty: "intermediate",
    tags: ["tokens", "ERC-20", "configuração", "smart contract"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Gerenciamento de Tokens",
      },
      {
        type: "paragraph",
        text: "Além das moedas nativas de cada blockchain, o CryptoVaultHub suporta tokens baseados em smart contracts como ERC-20 (Ethereum), BEP-20 (BSC), SPL (Solana) e TRC-20 (Tron). Cada token precisa ser registrado e configurado individualmente para que o sistema possa rastrear saldos e processar transações corretamente.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Verificação automática",
        text: "Ao informar o endereço do contrato, o sistema automaticamente busca nome, símbolo, decimais e supply total do token on-chain. Verifique se os dados estão corretos antes de confirmar.",
      },
      {
        type: "heading",
        level: 3,
        text: "Adicionando um Token",
      },
      {
        type: "steps",
        items: [
          {
            title: "Selecionar a chain",
            description:
              "Acesse Admin > Chains & Tokens, selecione a chain desejada e clique na aba 'Tokens'.",
          },
          {
            title: "Informar endereço do contrato",
            description:
              "Cole o endereço do smart contract do token. O sistema buscará os metadados automaticamente.",
          },
          {
            title: "Revisar metadados",
            description:
              "Confirme nome, símbolo, decimais e ícone. Opcionalmente, adicione um ícone customizado para o token.",
          },
          {
            title: "Configurar limites",
            description:
              "Defina limites mínimos e máximos de transação para o token, além de fee percentages se aplicável.",
          },
          {
            title: "Ativar",
            description:
              "Ative o token. Ele aparecerá automaticamente nas wallets dos clientes que possuem a chain habilitada.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Tokens Suportados por Tipo",
      },
      {
        type: "table",
        headers: ["Padrão", "Chain", "Exemplos", "Detecção Automática"],
        rows: [
          ["ERC-20", "Ethereum, Arbitrum, Polygon", "USDT, USDC, DAI", "Sim"],
          ["BEP-20", "BNB Smart Chain", "BUSD, CAKE", "Sim"],
          ["TRC-20", "Tron", "USDT-TRC20", "Sim"],
          ["SPL", "Solana", "USDC-SPL, RAY", "Sim"],
          ["Native", "Todas", "ETH, BTC, BNB", "Pré-configurado"],
        ],
      },
      {
        type: "code",
        language: "typescript",
        code: '// Verificar se um token já está registrado\nconst token = await adminClient.chains.tokens.get({\n  chain_id: "ethereum",\n  contract_address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",\n});\n\nconsole.log(token);\n// {\n//   symbol: "USDT",\n//   name: "Tether USD",\n//   decimals: 6,\n//   status: "active",\n//   total_tracked_balance: "1250000.00"\n// }',
        filename: "check-token.ts",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Nunca adicione tokens de contratos não verificados. Sempre confirme o endereço do contrato em um block explorer oficial antes de registrar.",
      },
      {
        type: "paragraph",
        text: "O sistema monitora continuamente eventos de Transfer dos tokens registrados. Depósitos são detectados automaticamente e refletidos no saldo do cliente em tempo real, com o número de confirmações configurado para a chain.",
      },
      {
        type: "link-card",
        href: "/support/kb/traceability/rastrear-transacoes",
        title: "Rastrear Transações",
        description:
          "Veja como rastrear transações de tokens com detalhamento completo",
      },
    ],
  },
  {
    slug: "gas-tanks",
    title: "Gas Tanks",
    description:
      "Gerenciamento de Gas Tanks para financiar transações on-chain dos clientes.",
    category: "chains",
    icon: "Fuel",
    difficulty: "intermediate",
    tags: ["gas", "tanks", "fees", "transações"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "O que são Gas Tanks?",
      },
      {
        type: "paragraph",
        text: "Gas Tanks são wallets especiais mantidas pela plataforma que financiam o custo de gas (taxas de rede) das transações dos clientes. Em vez de cada cliente precisar manter saldo de moeda nativa para pagar fees, a plataforma centraliza esse gerenciamento através dos Gas Tanks, simplificando a experiência do usuário final.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Um Gas Tank por chain",
        text: "Cada blockchain habilitada possui seu próprio Gas Tank. O saldo do Gas Tank é em moeda nativa da chain (ex: ETH para Ethereum, BNB para BSC). O custo de gas é repassado ao cliente via billing ou absorvido conforme configuração do tier.",
      },
      {
        type: "heading",
        level: 3,
        text: "Monitoramento de Saldo",
      },
      {
        type: "paragraph",
        text: "O dashboard de Gas Tanks exibe em tempo real o saldo de cada tank, consumo médio diário, projeção de esgotamento e histórico de recargas. Alertas automáticos são disparados quando o saldo atinge os thresholds configurados.",
      },
      {
        type: "table",
        headers: ["Nível de Alerta", "Threshold Padrão", "Ação"],
        rows: [
          ["Info", "< 30% do saldo ideal", "Notificação no dashboard"],
          ["Warning", "< 15% do saldo ideal", "E-mail + Slack para equipe financeira"],
          ["Critical", "< 5% do saldo ideal", "SMS + bloqueio de novas transações"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Recarga de Gas Tanks",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar Gas Tanks",
            description:
              "Navegue até Admin > Chains & Tokens > Gas Tanks. Selecione a chain que precisa de recarga.",
          },
          {
            title: "Verificar saldo e consumo",
            description:
              "Analise o saldo atual, consumo médio dos últimos 7 dias e projeção de esgotamento para determinar o valor da recarga.",
          },
          {
            title: "Iniciar recarga",
            description:
              "Clique em 'Recarregar'. Informe o valor e selecione a origem dos fundos (hot wallet operacional ou endereço externo).",
          },
          {
            title: "Aprovar transação",
            description:
              "Recargas acima do threshold configurado requerem aprovação multi-sig. A transação será submetida após as aprovações necessárias.",
          },
        ],
      },
      {
        type: "mermaid",
        chart:
          "graph LR\n  A[Cliente solicita saque] --> B[Transaction Service]\n  B --> C{Gas disponível?}\n  C -->|Sim| D[Gas Tank financia fee]\n  D --> E[Transação submetida on-chain]\n  C -->|Não| F[Transação enfileirada]\n  F --> G[Alerta de Gas Low]\n  G --> H[Recarga do Gas Tank]\n  H --> C",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Mantenha sempre um buffer de segurança nos Gas Tanks. Em períodos de alta volatilidade de gas (como durante mint events em Ethereum), o consumo pode aumentar 10x ou mais em poucas horas.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Verificar saldo de todos os Gas Tanks\ncurl -s https://api.vaulthub.live/v1/admin/gas-tanks \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" | jq \'.\n\n# Resposta:\n# [\n#   {\n#     "chain": "ethereum",\n#     "address": "0x1234...abcd",\n#     "balance": "12.5 ETH",\n#     "avg_daily_consumption": "0.8 ETH",\n#     "days_remaining": 15.6,\n#     "alert_level": "normal"\n#   },\n#   ...\n# ]',
        filename: "check-gas-tanks.sh",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/configurar-alertas",
        title: "Configurar Alertas",
        description:
          "Configure alertas personalizados para saldo de Gas Tanks e outros recursos",
      },
    ],
  },
  {
    slug: "sync-health",
    title: "Sync Health",
    description:
      "Monitore a saúde da sincronização de blocos e identifique problemas de atraso.",
    category: "chains",
    icon: "RefreshCw",
    difficulty: "intermediate",
    tags: ["sync", "blocos", "monitoramento", "health"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Monitoramento de Sync Health",
      },
      {
        type: "paragraph",
        text: "O Sync Health monitora o progresso da sincronização de blocos de cada blockchain configurada. Um sync saudável é fundamental para detectar depósitos, confirmar transações e manter saldos atualizados. Atrasos no sync podem resultar em depósitos não detectados e saldos desatualizados.",
      },
      {
        type: "heading",
        level: 3,
        text: "Métricas de Sync",
      },
      {
        type: "table",
        headers: ["Métrica", "Descrição", "Valor Ideal"],
        rows: [
          ["Block Lag", "Diferença entre último bloco processado e head da chain", "< 5 blocos"],
          ["Sync Speed", "Blocos processados por segundo", "> 10 bps"],
          ["Error Rate", "Percentual de blocos com erro de processamento", "< 0.01%"],
          ["Reorg Depth", "Profundidade máxima de reorganização detectada", "< 3 blocos"],
          ["Last Processed", "Timestamp do último bloco processado", "< 30s atrás"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Block Lag elevado",
        text: "Se o Block Lag ultrapassar 50 blocos, o sistema automaticamente marca a chain como 'degraded' e transações de saída são pausadas até a recuperação. Isso previne double-spends e inconsistências de saldo.",
      },
      {
        type: "heading",
        level: 3,
        text: "Causas Comuns de Problemas de Sync",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "RPC Provider instável ou com rate limiting — verifique o health dos providers",
          "Alto volume de transações em bloco causando timeout de processamento",
          "Reorganização de chain (reorg) exigindo reprocessamento de blocos",
          "Disco cheio no servidor impedindo gravação de dados indexados",
          "Bug em parser de chain customizada — verifique logs de erro",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Ações de Recuperação",
      },
      {
        type: "steps",
        items: [
          {
            title: "Identificar a causa",
            description:
              "Acesse Monitoring > Sync Health e verifique qual chain está com problemas. Clique na chain para ver logs detalhados.",
          },
          {
            title: "Verificar RPC Providers",
            description:
              "Se o problema for RPC, verifique o health de cada provider. Troque a prioridade ou adicione um provider temporário.",
          },
          {
            title: "Forçar re-sync",
            description:
              "Se necessário, execute um re-sync a partir de um bloco específico. Use com cautela: 'Admin > Chain > Re-sync from block'.",
          },
          {
            title: "Monitorar recuperação",
            description:
              "Após a ação corretiva, acompanhe a taxa de sync speed. O sistema deve convergir para o head da chain progressivamente.",
          },
        ],
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Block Scanner] --> B{RPC Response OK?}\n  B -->|Sim| C[Parse Block]\n  C --> D[Index Transactions]\n  D --> E[Update Balances]\n  E --> F[Emit Events]\n  B -->|Não| G[Failover to Backup RPC]\n  G --> B\n  C -->|Erro| H[Log Error + Retry]\n  H --> C",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Configure alertas de Sync Health no Slack ou via webhook para ser notificado imediatamente sobre atrasos. Um atraso de sync detectado cedo é muito mais fácil de resolver.",
      },
      {
        type: "link-card",
        href: "/support/kb/chains/rpc-providers",
        title: "RPC Providers",
        description:
          "Gerencie e monitore os providers RPC que alimentam o sync de cada chain",
      },
    ],
  },
  {
    slug: "rpc-providers",
    title: "RPC Providers",
    description:
      "Configuração e monitoramento de provedores RPC para comunicação com as blockchains.",
    category: "chains",
    icon: "Server",
    difficulty: "advanced",
    tags: ["RPC", "providers", "endpoints", "failover"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Gerenciamento de RPC Providers",
      },
      {
        type: "paragraph",
        text: "Os RPC Providers são a ponte de comunicação entre o CryptoVaultHub e as blockchains. Cada chamada on-chain — consulta de saldo, envio de transação, leitura de eventos — passa por um provider RPC. A qualidade e confiabilidade dos providers impacta diretamente a performance e disponibilidade da plataforma.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Redundância obrigatória",
        text: "Cada chain deve ter no mínimo 2 providers RPC configurados. O sistema utiliza failover automático — se o provider primário falhar, as requisições são redirecionadas para o secundário sem interrupção do serviço.",
      },
      {
        type: "heading",
        level: 3,
        text: "Adicionando um Provider",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar configuração de providers",
            description:
              "Navegue até Admin > Chains & Tokens > selecione a chain > aba 'RPC Providers'.",
          },
          {
            title: "Adicionar endpoint",
            description:
              "Clique em 'Add Provider'. Informe a URL, tipo (HTTP/WebSocket), prioridade e credenciais se necessário.",
          },
          {
            title: "Configurar health check",
            description:
              "Defina o intervalo de health check (padrão: 30s), timeout (padrão: 5s) e método de verificação (eth_blockNumber, net_version, etc.).",
          },
          {
            title: "Testar conectividade",
            description:
              "O sistema executará uma bateria de testes automáticos: latência, suporte a métodos necessários e rate limit detection.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Métricas de Provider",
      },
      {
        type: "table",
        headers: ["Métrica", "Descrição", "Threshold de Alerta"],
        rows: [
          ["Latência P50", "Latência mediana das requisições", "> 200ms"],
          ["Latência P99", "Latência do percentil 99", "> 2000ms"],
          ["Error Rate", "Taxa de erro nas requisições", "> 1%"],
          ["Uptime", "Disponibilidade do provider", "< 99.5%"],
          ["Rate Limit Hits", "Vezes que o rate limit foi atingido", "> 10/hora"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Estratégias de Failover",
      },
      {
        type: "paragraph",
        text: "O sistema suporta três estratégias de failover configuráveis por chain:",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Priority-based: requisições vão sempre para o provider de maior prioridade. Failover ocorre apenas em caso de falha.",
          "Round-robin: requisições são distribuídas igualmente entre todos os providers saudáveis. Bom para distribuir carga.",
          "Latency-based: requisições vão para o provider com menor latência medida. Ideal para otimizar performance.",
        ],
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "chain_id": "ethereum",\n  "failover_strategy": "latency-based",\n  "providers": [\n    {\n      "name": "Infura Primary",\n      "url": "https://mainnet.infura.io/v3/${KEY}",\n      "type": "http",\n      "priority": 1,\n      "health_check_interval_ms": 30000,\n      "timeout_ms": 5000,\n      "max_retries": 3\n    },\n    {\n      "name": "Alchemy Backup",\n      "url": "https://eth-mainnet.g.alchemy.com/v2/${KEY}",\n      "type": "http",\n      "priority": 2,\n      "health_check_interval_ms": 30000,\n      "timeout_ms": 5000,\n      "max_retries": 3\n    },\n    {\n      "name": "Tatum Fallback",\n      "url": "https://ethereum-mainnet.gateway.tatum.io",\n      "type": "http",\n      "priority": 3,\n      "health_check_interval_ms": 60000,\n      "timeout_ms": 10000,\n      "max_retries": 2,\n      "headers": { "x-api-key": "${TATUM_KEY}" }\n    }\n  ]\n}',
        filename: "rpc-config.json",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Considere usar o Tatum.io como provider fallback para múltiplas chains. Com uma única API key, você cobre Ethereum, BSC, Polygon, Tron e várias outras chains, simplificando o gerenciamento.",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/dashboard-metricas",
        title: "Dashboard de Métricas",
        description:
          "Visualize métricas detalhadas de latência e uptime dos seus RPC providers",
      },
    ],
  },
];
