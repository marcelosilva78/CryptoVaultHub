import type { Article } from "../components/types";

export const integrationsArticles: Article[] = [
  {
    slug: "configurar-webhooks",
    title: "Configurar Webhooks",
    description:
      "Como configurar webhooks para receber notificações em tempo real de transações, depósitos e eventos do sistema.",
    category: "integrations",
    icon: "Webhook",
    difficulty: "intermediate",
    tags: ["webhook", "configurar", "notificações", "callback"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Webhooks — Notificações em Tempo Real",
      },
      {
        type: "paragraph",
        text: "Webhooks permitem que sua aplicação receba notificações automáticas quando eventos ocorrem na plataforma CryptoVaultHub. Em vez de consultar a API periodicamente (polling), sua aplicação é notificada instantaneamente via HTTP POST.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Quando usar webhooks?",
        text: "Webhooks são essenciais para automação: confirmar pagamentos recebidos, atualizar saldos em tempo real, notificar usuários sobre transações e disparar processos de negócio automaticamente.",
      },
      {
        type: "heading",
        level: 3,
        text: "Configuração pela Interface",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar Webhooks",
            description:
              "No menu lateral, clique em Integration > Webhooks. A tela lista todos os webhooks configurados com status e métricas.",
          },
          {
            title: "Criar novo webhook",
            description:
              "Clique em 'Novo Webhook' e informe a URL de callback (deve ser HTTPS), uma descrição e selecione os eventos desejados.",
          },
          {
            title: "Selecionar eventos",
            description:
              "Escolha os eventos que dispararão o webhook. Você pode selecionar eventos específicos ou assinar todos os eventos de uma categoria.",
          },
          {
            title: "Configurar secret",
            description:
              "Um secret será gerado automaticamente para validação de assinatura (HMAC-SHA256). Copie e armazene em local seguro.",
          },
          {
            title: "Testar webhook",
            description:
              "Clique em 'Enviar Ping' para testar a conectividade. O sistema enviará um evento de teste e exibirá a resposta da sua aplicação.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Validação de Assinatura",
      },
      {
        type: "paragraph",
        text: "Cada webhook enviado inclui um header X-VaultHub-Signature com uma assinatura HMAC-SHA256 do payload usando o secret configurado. Sempre valide essa assinatura antes de processar o evento.",
      },
      {
        type: "code",
        language: "typescript",
        code: "import crypto from 'crypto';\n\nfunction verifyWebhookSignature(\n  payload: string,\n  signature: string,\n  secret: string\n): boolean {\n  const expected = crypto\n    .createHmac('sha256', secret)\n    .update(payload)\n    .digest('hex');\n  return crypto.timingSafeEqual(\n    Buffer.from(signature),\n    Buffer.from(expected)\n  );\n}\n\n// No handler do webhook:\napp.post('/webhook', (req, res) => {\n  const signature = req.headers['x-vaulthub-signature'] as string;\n  const isValid = verifyWebhookSignature(\n    JSON.stringify(req.body),\n    signature,\n    process.env.WEBHOOK_SECRET!\n  );\n  if (!isValid) return res.status(401).send('Invalid signature');\n  // Processar evento...\n  res.status(200).send('OK');\n});",
        filename: "verify-webhook.ts",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Responda em 5 segundos",
        text: "Sua aplicação deve responder com HTTP 200 em até 5 segundos. Respostas mais lentas ou códigos de erro acionarão o mecanismo de retry. Processe o webhook de forma assíncrona se necessário.",
      },
      {
        type: "heading",
        level: 3,
        text: "Política de Retry",
      },
      {
        type: "table",
        headers: ["Tentativa", "Delay", "Total Acumulado"],
        rows: [
          ["1a (imediata)", "0", "0"],
          ["2a retry", "30 segundos", "30s"],
          ["3a retry", "2 minutos", "2m30s"],
          ["4a retry", "10 minutos", "12m30s"],
          ["5a retry", "1 hora", "1h12m30s"],
          ["6a retry (final)", "4 horas", "5h12m30s"],
        ],
      },
      {
        type: "paragraph",
        text: "Após esgotar todas as tentativas, o evento é movido para a dead letter queue e um alerta é gerado. Eventos na dead letter queue podem ser retransmitidos manualmente pela interface.",
      },
      {
        type: "link-card",
        href: "/support/kb/integrations/eventos-disponiveis",
        title: "Eventos Disponíveis",
        description:
          "Lista completa de eventos que podem ser assinados via webhook",
      },
    ],
  },
  {
    slug: "eventos-disponiveis",
    title: "Eventos Disponíveis",
    description:
      "Lista completa de eventos de webhook disponíveis na plataforma, incluindo payloads de exemplo e categorias.",
    category: "integrations",
    icon: "Zap",
    difficulty: "intermediate",
    tags: ["webhook", "eventos", "payload", "referência"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Catálogo de Eventos",
      },
      {
        type: "paragraph",
        text: "A plataforma CryptoVaultHub emite eventos para todas as operações significativas. Cada evento possui um tipo único, um payload estruturado e metadados de contexto. Assine apenas os eventos relevantes para sua integração.",
      },
      {
        type: "heading",
        level: 3,
        text: "Categorias de Eventos",
      },
      {
        type: "table",
        headers: ["Categoria", "Prefixo", "Descrição"],
        rows: [
          ["Transactions", "transaction.*", "Criação, confirmação e falha de transações"],
          ["Deposits", "deposit.*", "Detecção e confirmação de depósitos"],
          ["Withdrawals", "withdrawal.*", "Solicitação e processamento de saques"],
          ["Wallets", "wallet.*", "Criação e alteração de wallets"],
          ["Co-Sign", "cosign.*", "Solicitações e aprovações de co-sign"],
          ["Security", "security.*", "Alertas de segurança e logins"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Eventos de Transação",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "transaction.created — Nova transação criada",
          "transaction.pending — Transação submetida à rede",
          "transaction.confirmed — Transação confirmada on-chain",
          "transaction.failed — Falha na execução",
          "transaction.cancelled — Transação cancelada",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Eventos de Depósito",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "deposit.detected — Depósito identificado na rede (0 confirmações)",
          "deposit.confirming — Confirmações em progresso",
          "deposit.confirmed — Depósito confirmado e creditado",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Payload Padrão",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "id": "evt_abc123",\n  "type": "transaction.confirmed",\n  "created_at": "2026-04-22T15:30:00Z",\n  "data": {\n    "transaction_id": "tx_abc123",\n    "wallet_id": "wal_abc123",\n    "chain": "ethereum",\n    "amount": "1.5",\n    "currency": "ETH",\n    "status": "confirmed",\n    "tx_hash": "0xabc...def",\n    "confirmations": 12\n  },\n  "metadata": {\n    "project_id": "proj_abc123",\n    "idempotency_key": "pay_1234",\n    "ip": "192.168.1.1"\n  }\n}',
        filename: "webhook-payload.json",
      },
      {
        type: "callout",
        variant: "tip",
        title: "Filtrando eventos",
        text: "Ao criar um webhook, você pode usar wildcards para assinar categorias inteiras (ex: 'transaction.*' assina todos os eventos de transação) ou ser específico (ex: 'deposit.confirmed' apenas).",
      },
      {
        type: "paragraph",
        text: "Os campos do payload variam conforme o tipo de evento, mas o envelope (id, type, created_at, data, metadata) é consistente em todos os eventos. Use o campo 'type' para rotear o processamento na sua aplicação.",
      },
      {
        type: "callout",
        variant: "info",
        text: "Novos eventos são adicionados regularmente. Sua aplicação deve ignorar eventos desconhecidos graciosamente (log e retorne 200) para evitar quebras quando novos tipos são introduzidos.",
      },
      {
        type: "link-card",
        href: "/support/kb/integrations/gerenciar-api-keys",
        title: "Gerenciar API Keys",
        description:
          "Aprenda a criar, rotacionar e gerenciar suas API keys",
      },
    ],
  },
  {
    slug: "gerenciar-api-keys",
    title: "Gerenciar API Keys",
    description:
      "Como criar, rotacionar e revogar API keys para integração programática com a plataforma.",
    category: "integrations",
    icon: "KeyRound",
    difficulty: "intermediate",
    tags: ["API key", "gerenciar", "rotacionar", "revogar", "segurança"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Gerenciamento de API Keys",
      },
      {
        type: "paragraph",
        text: "API keys são credenciais que permitem a sua aplicação se comunicar com a API da plataforma CryptoVaultHub de forma programática. Cada key tem permissões específicas e pode ser vinculada a um projeto individual.",
      },
      {
        type: "callout",
        variant: "danger",
        title: "Segurança de API Keys",
        text: "API keys concedem acesso à sua conta e aos fundos. Nunca exponha keys em código público, repositórios, logs ou chats. Use variáveis de ambiente ou secret managers para armazená-las.",
      },
      {
        type: "heading",
        level: 3,
        text: "Criar Nova API Key",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar API Keys",
            description:
              "No menu lateral, clique em Integration > API Keys. A tela lista todas as keys ativas com data de criação e último uso.",
          },
          {
            title: "Criar nova key",
            description:
              "Clique em 'Nova API Key'. Defina um nome descritivo e selecione as permissões (read-only, full-access, custom).",
          },
          {
            title: "Vincular ao projeto",
            description:
              "Opcionalmente, vincule a key a um projeto específico. Keys vinculadas a projetos só podem operar naquele projeto.",
          },
          {
            title: "Configurar restrições",
            description:
              "Configure IP allowlist para restringir o uso da key a IPs específicos. Isso adiciona uma camada extra de segurança.",
          },
          {
            title: "Copiar e armazenar",
            description:
              "A API key será exibida uma única vez. Copie e armazene em local seguro (variável de ambiente, vault de secrets). Ela não será exibida novamente.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Permissões de API Key",
      },
      {
        type: "table",
        headers: ["Nível", "Permissões", "Uso Recomendado"],
        rows: [
          ["Read-Only", "Consultar saldos, transações, status", "Dashboards, monitoramento"],
          ["Transactions", "Read + criar transações", "Integrações de pagamento"],
          ["Full Access", "Todas as operações da API", "Backend principal"],
          ["Custom", "Permissões granulares selecionadas", "Microserviços específicos"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Rotação de Keys",
      },
      {
        type: "paragraph",
        text: "A rotação periódica de API keys é uma prática de segurança recomendada. A plataforma suporta rotação graceful: crie uma nova key, atualize sua aplicação, e depois revogue a antiga.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Criar nova key (rotação)\ncurl -X POST https://api.vaulthub.live/v1/api-keys \\\n  -H "Authorization: Bearer $CURRENT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "name": "Production Key v2 - Rotação Abril 2026",\n    "permissions": ["read", "transactions"],\n    "project_id": "proj_abc123",\n    "ip_allowlist": ["203.0.113.0/24"]\n  }\'\n\n# Depois de atualizar sua aplicação, revogar a key antiga:\ncurl -X DELETE https://api.vaulthub.live/v1/api-keys/key_old123 \\\n  -H "Authorization: Bearer $NEW_KEY"',
        filename: "rotate-api-key.sh",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Configure alertas para receber notificação quando uma API key não é usada há mais de 30 dias ou quando está próxima de 90 dias sem rotação. Keys antigas são um vetor de risco.",
      },
      {
        type: "paragraph",
        text: "Todas as operações com API keys são registradas no audit trail: criação, uso, rotação e revogação. O administrador pode ver e gerenciar todas as keys da conta se necessário.",
      },
      {
        type: "link-card",
        href: "/support/kb/integrations/autenticacao-api",
        title: "Autenticação na API",
        description:
          "Aprenda os detalhes de autenticação para chamadas à API REST",
      },
    ],
  },
  {
    slug: "autenticacao-api",
    title: "Autenticação na API",
    description:
      "Como autenticar chamadas à API REST da plataforma, incluindo tokens, headers e tratamento de erros.",
    category: "integrations",
    icon: "Lock",
    difficulty: "intermediate",
    tags: ["API", "autenticação", "Bearer", "token", "headers"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Autenticação na API REST",
      },
      {
        type: "paragraph",
        text: "Todas as chamadas à API do CryptoVaultHub requerem autenticação via Bearer token. O token é a API key gerada na seção Integration > API Keys. A autenticação é validada em cada request e inclui verificação de permissões, rate limiting e IP allowlist.",
      },
      {
        type: "heading",
        level: 3,
        text: "Formato de Autenticação",
      },
      {
        type: "code",
        language: "bash",
        code: '# Autenticação via header Authorization\ncurl https://api.vaulthub.live/v1/wallets \\\n  -H "Authorization: Bearer vhk_live_abc123def456ghi789jkl012mno345"\n\n# NUNCA passe a key como query parameter\n# ERRADO: https://api.vaulthub.live/v1/wallets?api_key=vhk_live_abc123...\n# CORRETO: Use sempre o header Authorization',
        filename: "api-auth.sh",
      },
      {
        type: "heading",
        level: 3,
        text: "Prefixos de API Key",
      },
      {
        type: "table",
        headers: ["Prefixo", "Ambiente", "Descrição"],
        rows: [
          ["vhk_live_", "Production", "Keys para operações reais com fundos"],
          ["vhk_test_", "Staging/Test", "Keys para ambiente de testes (testnet)"],
          ["vhk_dev_", "Development", "Keys para sandbox local"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Não misture ambientes",
        text: "Keys de production não funcionam em endpoints de staging e vice-versa. Certifique-se de usar a key correta para o ambiente correspondente.",
      },
      {
        type: "heading",
        level: 3,
        text: "Respostas de Erro de Autenticação",
      },
      {
        type: "table",
        headers: ["HTTP Code", "Erro", "Causa"],
        rows: [
          ["401", "Unauthorized", "API key inválida, expirada ou não fornecida"],
          ["403", "Forbidden", "Key válida mas sem permissão para esta operação"],
          ["429", "Too Many Requests", "Rate limit excedido para esta key"],
        ],
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "error": {\n    "code": "UNAUTHORIZED",\n    "message": "Invalid or expired API key",\n    "details": {\n      "hint": "Check that your API key is correct and has not been revoked",\n      "docs": "https://docs.vaulthub.live/auth"\n    }\n  },\n  "request_id": "req_abc123"\n}',
        filename: "auth-error-response.json",
      },
      {
        type: "heading",
        level: 3,
        text: "Headers Adicionais",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "X-Request-Id — ID único para rastreamento (gerado automaticamente se não fornecido)",
          "X-Idempotency-Key — Chave de idempotência para operações de escrita",
          "Content-Type — Sempre application/json para requests com body",
          "Accept — Sempre application/json",
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Sempre inclua o header X-Request-Id nas chamadas. Isso facilita enormemente o diagnóstico de problemas — o suporte pode rastrear uma request específica nos logs usando este ID.",
      },
      {
        type: "link-card",
        href: "/support/kb/integrations/rate-limits",
        title: "Rate Limits e Throttling",
        description:
          "Entenda os limites de requisições e como lidar com throttling",
      },
    ],
  },
  {
    slug: "rate-limits",
    title: "Rate Limits e Throttling",
    description:
      "Entenda os limites de requisições à API por tier, como lidar com throttling e boas práticas de consumo.",
    category: "integrations",
    icon: "Gauge",
    difficulty: "advanced",
    tags: ["rate limit", "throttling", "API", "429", "performance"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Rate Limits e Throttling",
      },
      {
        type: "paragraph",
        text: "A API do CryptoVaultHub aplica rate limiting para garantir estabilidade e disponibilidade para todos os clientes. Os limites são aplicados por API key e variam conforme o tier da sua conta.",
      },
      {
        type: "heading",
        level: 3,
        text: "Limites por Tier",
      },
      {
        type: "table",
        headers: ["Tier", "Requests/min", "Requests/hora", "Burst (10s)"],
        rows: [
          ["Standard", "60", "3.000", "20"],
          ["Professional", "300", "15.000", "50"],
          ["Enterprise", "1.000", "50.000", "200"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Headers de Rate Limit",
      },
      {
        type: "paragraph",
        text: "Cada resposta da API inclui headers informando o estado atual do rate limit. Use esses headers para implementar backoff proativo na sua aplicação.",
      },
      {
        type: "code",
        language: "text",
        code: "HTTP/1.1 200 OK\nX-RateLimit-Limit: 300\nX-RateLimit-Remaining: 247\nX-RateLimit-Reset: 1745352060\nX-RateLimit-Window: 60",
        filename: "rate-limit-headers.txt",
      },
      {
        type: "table",
        headers: ["Header", "Descrição"],
        rows: [
          ["X-RateLimit-Limit", "Limite máximo de requests no período"],
          ["X-RateLimit-Remaining", "Requests restantes no período atual"],
          ["X-RateLimit-Reset", "Timestamp (Unix) quando o contador reseta"],
          ["X-RateLimit-Window", "Tamanho da janela em segundos"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Lidando com HTTP 429",
      },
      {
        type: "paragraph",
        text: "Quando o rate limit é excedido, a API retorna HTTP 429 Too Many Requests. Implemente exponential backoff com jitter para retry:",
      },
      {
        type: "code",
        language: "typescript",
        code: "async function apiCallWithRetry(\n  url: string,\n  options: RequestInit,\n  maxRetries = 3\n): Promise<Response> {\n  for (let attempt = 0; attempt <= maxRetries; attempt++) {\n    const response = await fetch(url, options);\n    \n    if (response.status !== 429) return response;\n    \n    const resetAt = parseInt(\n      response.headers.get('X-RateLimit-Reset') || '0'\n    );\n    const waitMs = resetAt\n      ? (resetAt * 1000 - Date.now())\n      : Math.min(1000 * 2 ** attempt, 30000);\n    \n    // Adicionar jitter (0-25% do wait time)\n    const jitter = waitMs * Math.random() * 0.25;\n    await new Promise(r => setTimeout(r, waitMs + jitter));\n  }\n  throw new Error('Rate limit exceeded after max retries');\n}",
        filename: "rate-limit-retry.ts",
      },
      {
        type: "callout",
        variant: "tip",
        title: "Boas práticas de consumo",
        text: "Use webhooks em vez de polling para reduzir o número de requests. Agrupe operações em batch quando possível. Cache respostas que mudam raramente (ex: lista de chains, configurações).",
      },
      {
        type: "heading",
        level: 3,
        text: "Endpoints com Limites Especiais",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "POST /v1/transactions — Limitado a 10 tx/min independente do tier (proteção anti-fraude)",
          "GET /v1/transactions/export — 5 req/hora (exportações são pesadas)",
          "POST /v1/flush — 2 req/hora (operação custosa em gas)",
          "POST /v1/wallets — 20 req/min (provisioning de wallets)",
        ],
      },
      {
        type: "paragraph",
        text: "Se você precisa de limites maiores para um caso de uso específico, entre em contato com o administrador para avaliar um tier customizado ou ajuste de limites.",
      },
      {
        type: "link-card",
        href: "/support/kb/security/ativar-2fa",
        title: "Ativar Autenticação 2FA",
        description:
          "Configure 2FA para proteger sua conta e autorizar operações sensíveis",
      },
    ],
  },
  {
    slug: "postman-roteiro-integracao",
    title: "Postman — Roteiro de Integração End-to-End",
    description:
      "Coleção Postman pronta para uso e roteiro narrativo, ambos gerados a partir de uma execução real e validada na homologação. Importe, ajuste a API key, e rode do começo ao fim no Collection Runner para reproduzir o ciclo completo de depósito → sweep → saque.",
    category: "integrations",
    icon: "Webhook",
    difficulty: "intermediate",
    tags: ["postman", "integração", "api", "collection", "homologação", "roteiro"],
    updatedAt: "08 Mai 2026",
    readingTime: 8,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Por que essa coleção existe",
      },
      {
        type: "paragraph",
        text: "A coleção Postman foi gerada a partir de uma execução real da suíte de homologação E2E em produção (BSC mainnet, 13/13 passos PASS, com transações confirmadas on-chain). Cada request da coleção corresponde a um passo da suíte; juntos eles reproduzem o ciclo completo de integração: gerar endereço de depósito, receber fundos, sweep automático, saque whitelisted, broadcast e confirmação on-chain.",
      },
      {
        type: "callout",
        variant: "tip",
        title: "Por que isso importa",
        text: "Como os artefatos saem de uma corrida real e bem-sucedida, eles refletem exatamente os endpoints, payloads e respostas atuais. Não há documentação 'aspiracional' aqui — o que está na coleção é exatamente o que a API responde hoje em produção.",
      },
      {
        type: "heading",
        level: 3,
        text: "Pré-requisitos",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Conta no Portal CryptoVaultHub com um projeto criado e com deploy concluído (deploy_status='ready') na chain alvo (ex: BSC).",
          "Uma API Key gerada em Settings → API Keys com escopo write (necessário para criar saques e endereços whitelisted).",
          "Postman 10+ ou Insomnia/Bruno (qualquer cliente que importe o formato Postman v2.1.0).",
          "Um endereço EVM externo de destino para testar o saque (sua MetaMask, por exemplo).",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Download dos artefatos",
      },
      {
        type: "link-card",
        href: "/postman/CryptoVaultHub.postman_collection.json",
        title: "Download da Coleção (Postman v2.1.0 JSON)",
        description:
          "Arquivo importável no Postman, Insomnia ou Bruno. Inclui 5 pastas, scripts de teste com asserts e propagação automática de variáveis entre requests.",
      },
      {
        type: "link-card",
        href: "/postman/postman-walkthrough.md",
        title: "Download do Roteiro completo em Markdown",
        description:
          "Documento narrativo passo-a-passo: o porquê de cada request, payload de exemplo, resposta esperada, erros comuns e referência de webhook.",
      },
      {
        type: "heading",
        level: 3,
        text: "Como importar no Postman",
      },
      {
        type: "steps",
        items: [
          {
            title: "Baixar o arquivo .json",
            description:
              "Clique no link 'Download da Coleção' acima. O arquivo CryptoVaultHub.postman_collection.json baixa para sua pasta de Downloads.",
          },
          {
            title: "Importar no Postman",
            description:
              "No Postman, clique em File → Import (ou Ctrl/Cmd + O), arraste o arquivo .json para a janela ou selecione manualmente. A coleção 'CryptoVaultHub Client API' aparece na barra lateral.",
          },
          {
            title: "Selecionar a coleção",
            description:
              "Clique na coleção para ver as 5 pastas (Setup, Webhook, Deposit, Withdrawal, Cleanup) e a aba 'Variables' onde você vai configurar a API Key.",
          },
          {
            title: "Editar a aba Variables",
            description:
              "Na coleção selecionada, abra a aba 'Variables'. Substitua o valor de apiKey pelo seu cvh_live_… real. Ajuste chainId, tokenSymbol, withdrawalAmount e withdrawalTarget conforme seu cenário de teste.",
          },
          {
            title: "Salvar (Ctrl/Cmd + S)",
            description:
              "Salvar é importante — Postman precisa persistir as variáveis de coleção antes de você executar o Runner.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Variáveis da coleção",
      },
      {
        type: "table",
        headers: ["Variável", "Editar?", "Default", "Onde obter / como funciona"],
        rows: [
          ["baseUrl", "Não", "https://api.vaulthub.live/client/v1", "Fixa, produção"],
          ["apiKey", "SIM", "cvh_live_REPLACE_ME", "Portal → Settings → API Keys → Create. Escopo write."],
          ["chainId", "Sim", "56", "ID numérico da chain alvo. 56 = BSC mainnet, 137 = Polygon, etc."],
          ["tokenSymbol", "Sim", "BNB", "Símbolo do token a sacar. Lista válida em GET /tokens?chainId=…"],
          ["withdrawalTarget", "SIM", "0x0…0", "Endereço EVM externo onde quer receber o saque de teste"],
          ["withdrawalAmount", "Sim", "0.001", "Quanto sacar. Use valor pequeno em testes."],
          ["projectId", "Não — auto", "(vazio)", "Preenchida no passo 1 a partir da resposta de GET /projects"],
          ["depositAddress", "Não — auto", "(vazio)", "Preenchida no passo 5 quando você gera o forwarder"],
          ["webhookId", "Não — auto", "(vazio)", "Preenchida no passo 4 quando você cadastra o webhook"],
          ["withdrawalId", "Não — auto", "(vazio)", "Preenchida no passo 10 quando o saque é criado"],
          ["idempotencyKey", "Não — auto", "(vazio)", "Pre-request script gera uma chave única por execução"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Como a propagação automática funciona",
        text: "Cada request tem um 'test script' (aba Tests) que extrai IDs da resposta e salva nas Collection Variables. Quando o próximo request roda, ele substitui {{withdrawalId}} pelo valor capturado. É por isso que o Runner consegue executar todo o fluxo sem intervenção entre passos.",
      },
      {
        type: "heading",
        level: 3,
        text: "Estrutura da coleção",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "**1. Setup** — Resolve o projeto, lista wallets, valida saúde do gas tank. Smoke test do ambiente.",
          "**2. Webhook (opcional)** — Cadastra um receptor para eventos em tempo real. Em produção, prefira webhook ao invés de polling.",
          "**3. Deposit** — Gera deposit address determinístico (CREATE2), aguarda fundos, valida sweep para a hot wallet.",
          "**4. Withdrawal** — Whitelist do destino, criação do saque, self-approve em modo full-custody, espera por broadcast e confirmação on-chain.",
          "**5. Cleanup** — Remove o webhook de teste.",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Executar a coleção end-to-end",
      },
      {
        type: "steps",
        items: [
          {
            title: "Rodar o passo 1 isolado para validar credenciais",
            description:
              "Antes de usar o Runner, clique no request '1. Setup → Resolve project (smoke test)' e dispare manualmente. Se vier 200 com sua lista de projetos, a API key está válida. Se vier 401, ajuste a apiKey nas Variables.",
          },
          {
            title: "Rodar até gerar o deposit address",
            description:
              "Execute manualmente os requests da pasta Setup, depois Webhook, depois 'Generate deposit address' na pasta Deposit. A variável depositAddress fica preenchida.",
          },
          {
            title: "Enviar fundos para o deposit address",
            description:
              "O endereço gerado aceita o token nativo da chain (BNB na BSC). Envie de uma carteira externa (MetaMask, exchange, etc.). Aguarde 1-2 minutos para detecção on-chain.",
          },
          {
            title: "Polling até status=swept",
            description:
              "Re-execute 'Wait deposit swept (poll)' até o test script confirmar que status atingiu confirmed → sweep_pending → swept. Em geral leva menos de 60s na BSC.",
          },
          {
            title: "Rodar a pasta Withdrawal inteira",
            description:
              "Whitelist + Create + Approve + Wait. O Approve é necessário em modo full-custody; em cosign-mode o cliente assina em vez disso. O Wait re-executa até status=confirmed e imprime o link do BSCScan no console.",
          },
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Cooldown de 24h em endereços recém-whitelisted",
        text: "Se você acabou de whitelistar o destino, o saque vai falhar com 422 'address still in cooldown'. Em produção, prefira rodar o Runner contra um endereço já em status active. Em teste, dá pra forçar via DB (consulte o suporte).",
      },
      {
        type: "heading",
        level: 3,
        text: "Verificar assinatura dos webhooks",
      },
      {
        type: "paragraph",
        text: "Todo webhook é assinado com HMAC-SHA256 sobre o body bruto, usando o secret retornado quando você criou o receptor. Verifique antes de processar para evitar payloads forjados.",
      },
      {
        type: "code",
        language: "javascript",
        filename: "verify-webhook.js",
        code: "const crypto = require('crypto');\n\nfunction verifyWebhook(rawBody, signatureHeader, secret) {\n  const expected = crypto.createHmac('sha256', secret)\n    .update(rawBody)\n    .digest('hex');\n  const got = Buffer.from(signatureHeader, 'utf8');\n  const exp = Buffer.from(expected, 'utf8');\n  if (got.length !== exp.length) return false;\n  return crypto.timingSafeEqual(got, exp);\n}\n\n// Express middleware exemplo\napp.post('/webhooks/cvh',\n  express.raw({ type: 'application/json' }),\n  (req, res) => {\n    const sig = req.header('X-CVH-Signature');\n    if (!verifyWebhook(req.body, sig, process.env.CVH_WEBHOOK_SECRET)) {\n      return res.status(401).send('invalid signature');\n    }\n    const event = JSON.parse(req.body);\n    // process event ...\n    res.status(200).send('ok');\n  });",
      },
      {
        type: "heading",
        level: 3,
        text: "Erros comuns",
      },
      {
        type: "table",
        headers: ["HTTP", "Mensagem", "Causa", "Como corrigir"],
        rows: [
          ["401", "Invalid or missing API key", "Header X-API-Key faltando ou apiKey errada", "Editar apiKey nas Variables"],
          ["403", "Insufficient scope", "Key sem scope write (POSTs falham)", "Gerar nova key com scope write no Portal"],
          ["422", "address still in cooldown", "Whitelist novo, 24h não passaram", "Esperar OU usar address já active"],
          ["422", "project deployment not ready", "Wizard não rodou para a chain", "Portal → Project → Setup → Deploy"],
          ["422", "Token symbol 'X' not found on chain", "tokenSymbol incorreto/desconhecido", "GET /tokens?chainId=… para descobrir"],
          ["409", "idempotency key already used", "Mesma key, body diferente", "Reusar a mesma key apenas para retries idênticos"],
          ["502", "Bad Gateway", "Reciclagem de worker no gateway, transitório", "Re-executar em 1-2 segundos"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Próximos passos",
      },
      {
        type: "link-card",
        href: "/support/kb/integrations/configurar-webhooks",
        title: "Configurar Webhooks",
        description:
          "Em produção, prefira webhook ao invés de polling. Aprenda a estruturar o receptor e validar assinaturas.",
      },
      {
        type: "link-card",
        href: "/support/kb/integrations/api-keys-autenticacao",
        title: "API Keys e Autenticação",
        description:
          "Gerar, escopar e rotacionar suas API Keys com segurança.",
      },
    ],
  },
];
