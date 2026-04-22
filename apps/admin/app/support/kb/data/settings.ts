import type { Article } from "../components/types";

export const settingsArticles: Article[] = [
  {
    slug: "configuracoes-gerais",
    title: "Configurações Gerais",
    description:
      "Visão geral das configurações gerais do sistema e como ajustá-las.",
    category: "settings",
    icon: "Settings",
    difficulty: "beginner",
    tags: ["configurações", "gerais", "sistema", "preferências"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Configurações Gerais do Sistema",
      },
      {
        type: "paragraph",
        text: "As configurações gerais definem o comportamento global da plataforma CryptoVaultHub. Aqui são controlados parâmetros como nome da instância, domínio, moeda padrão para exibição, idioma da interface administrativa e configurações de e-mail. Alterações nesta seção afetam toda a plataforma.",
      },
      {
        type: "heading",
        level: 3,
        text: "Parâmetros Principais",
      },
      {
        type: "table",
        headers: ["Parâmetro", "Descrição", "Valor Padrão"],
        rows: [
          ["Instance Name", "Nome da instância exibido no header e e-mails", "CryptoVaultHub"],
          ["Base Domain", "Domínio principal da plataforma", "vaulthub.live"],
          ["Default Currency", "Moeda padrão para exibição de valores", "USD"],
          ["Default Language", "Idioma padrão da interface", "pt-BR"],
          ["Session Timeout", "Tempo de inatividade para logout automático", "30 minutos"],
          ["Max Login Attempts", "Tentativas de login antes de bloqueio", "5"],
          ["Maintenance Mode", "Modo de manutenção (bloqueia acesso de clientes)", "Desligado"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Alterações sensíveis",
        text: "Mudanças no Base Domain, configurações de e-mail e modo de manutenção requerem confirmação com 2FA. Todas as alterações são registradas no Audit Log.",
      },
      {
        type: "heading",
        level: 3,
        text: "Configuração de E-mail",
      },
      {
        type: "paragraph",
        text: "O sistema envia e-mails para notificações de clientes, alertas administrativos e relatórios. Configure o provedor SMTP, templates e regras de envio nesta seção.",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "email": {\n    "provider": "smtp",\n    "host": "smtp.vaulthub.live",\n    "port": 587,\n    "encryption": "STARTTLS",\n    "from_name": "CryptoVaultHub",\n    "from_email": "no-reply@vaulthub.live",\n    "reply_to": "support@vaulthub.live",\n    "rate_limit": {\n      "per_minute": 100,\n      "per_hour": 2000\n    }\n  }\n}',
        filename: "email-config.json",
      },
      {
        type: "heading",
        level: 3,
        text: "Modo de Manutenção",
      },
      {
        type: "paragraph",
        text: "O modo de manutenção desabilita o acesso de clientes à API e ao dashboard, exibindo uma página de manutenção personalizada. Administradores mantêm acesso total. Útil para upgrades, migrações de banco e operações que requerem downtime.",
      },
      {
        type: "steps",
        items: [
          {
            title: "Ativar modo manutenção",
            description:
              "Acesse Settings > General > Maintenance Mode. Defina a mensagem personalizada e o tempo estimado de manutenção.",
          },
          {
            title: "Verificar ativação",
            description:
              "O sistema enviará notificação aos clientes com API ativa e exibirá a página de manutenção.",
          },
          {
            title: "Realizar manutenção",
            description:
              "Execute os procedimentos necessários. O admin panel permanece funcional durante a manutenção.",
          },
          {
            title: "Desativar modo manutenção",
            description:
              "Ao concluir, desative o modo. Clientes recuperam acesso imediatamente e APIs voltam a responder normalmente.",
          },
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Programe manutenções para horários de menor atividade. Use o Analytics para identificar os horários com menor volume de transações — geralmente entre 03:00 e 06:00 UTC para mercados americanos e europeus.",
      },
      {
        type: "link-card",
        href: "/support/kb/settings/seguranca-sistema",
        title: "Segurança do Sistema",
        description:
          "Configure parâmetros de segurança como 2FA, políticas de senha e rate limiting",
      },
    ],
  },
  {
    slug: "seguranca-sistema",
    title: "Segurança do Sistema",
    description:
      "Configurações de segurança: autenticação, criptografia, políticas de acesso e auditoria.",
    category: "settings",
    icon: "Lock",
    difficulty: "advanced",
    tags: ["segurança", "2FA", "criptografia", "autenticação", "acesso"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Segurança do Sistema",
      },
      {
        type: "paragraph",
        text: "A segurança é a prioridade máxima em uma plataforma de custódia de criptoativos. O CryptoVaultHub implementa múltiplas camadas de segurança que protegem desde o acesso administrativo até as chaves criptográficas que custodiam os ativos dos clientes.",
      },
      {
        type: "callout",
        variant: "danger",
        title: "Segurança em camadas",
        text: "Nunca desabilite camadas de segurança para 'facilitar' o acesso. Cada camada existe para proteger contra um vetor de ataque específico. A remoção de uma camada pode expor a plataforma e os ativos custodiados.",
      },
      {
        type: "heading",
        level: 3,
        text: "Autenticação de Administradores",
      },
      {
        type: "table",
        headers: ["Recurso", "Descrição", "Configurável"],
        rows: [
          ["2FA Obrigatório", "TOTP ou hardware key (YubiKey) para todos os admins", "Tipo de 2FA"],
          ["Política de Senha", "Mínimo 16 caracteres, complexidade, sem reuso", "Requisitos"],
          ["Session Timeout", "Logout automático após inatividade", "Tempo (15-60 min)"],
          ["IP Allowlist", "Restringir acesso admin a IPs específicos", "Lista de IPs/CIDRs"],
          ["Login Lockout", "Bloqueio após tentativas falhadas", "Tentativas e duração"],
          ["SSO/SAML", "Single Sign-On com IdP corporativo", "Provider e mapping"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Criptografia",
      },
      {
        type: "paragraph",
        text: "A proteção de chaves criptográficas é o aspecto mais crítico da segurança de uma plataforma de custódia. O CryptoVaultHub utiliza um Key Vault com múltiplas camadas de criptografia e suporte a HSM (Hardware Security Module).",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Dados em trânsito: TLS 1.3 obrigatório para todas as comunicações",
          "Dados em repouso: AES-256-GCM para banco de dados e storage",
          "Chaves privadas: Envelope encryption com master key em HSM",
          "Comunicação entre serviços: mTLS com certificados rotativos",
          "Secrets: HashiCorp Vault para gerenciamento de secrets e credenciais",
          "Shamir Secret Sharing: para chaves de alta criticidade com split M-of-N",
        ],
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Chave Privada do Cliente] -->|Encrypted by| B[Data Encryption Key - DEK]\n  B -->|Encrypted by| C[Key Encryption Key - KEK]\n  C -->|Stored in| D[HSM / Key Vault]\n  D -->|Protected by| E[Master Key]\n  E -->|Split via| F[Shamir M-of-N]",
      },
      {
        type: "heading",
        level: 3,
        text: "Controle de Acesso (RBAC)",
      },
      {
        type: "paragraph",
        text: "O sistema implementa Role-Based Access Control granular. Cada administrador recebe um ou mais roles que definem exatamente quais ações pode realizar. Roles são compostos por permissions individuais.",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "role": "compliance_officer",\n  "description": "Acesso completo a compliance, leitura em outros módulos",\n  "permissions": [\n    "compliance.*",\n    "clients.read",\n    "transactions.read",\n    "traceability.read",\n    "exports.compliance",\n    "audit_log.read"\n  ],\n  "restrictions": {\n    "ip_allowlist": ["10.0.0.0/8"],\n    "require_2fa": true,\n    "max_session_duration_hours": 8\n  }\n}',
        filename: "rbac-role.json",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Aplique o princípio do menor privilégio: cada administrador deve ter apenas as permissões necessárias para sua função. Revise as permissões trimestralmente e remova acessos não utilizados.",
      },
      {
        type: "quote",
        text: "Em custódia de criptoativos, segurança não é um feature — é a razão pela qual clientes confiam seus ativos à plataforma. Cada compromisso de segurança é um compromisso de confiança.",
        author: "Política de Segurança CryptoVaultHub",
      },
      {
        type: "link-card",
        href: "/support/kb/exports/audit-log",
        title: "Audit Log",
        description:
          "Todas as ações de segurança são registradas no Audit Log para rastreabilidade completa",
      },
    ],
  },
  {
    slug: "notificacoes",
    title: "Notificações Administrativas",
    description:
      "Configuração de notificações para administradores: canais, regras e preferências.",
    category: "settings",
    icon: "BellRing",
    difficulty: "intermediate",
    tags: ["notificações", "alertas", "e-mail", "Slack", "configuração"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Notificações Administrativas",
      },
      {
        type: "paragraph",
        text: "O sistema de notificações mantém os administradores informados sobre eventos importantes da plataforma. Notificações podem ser entregues por múltiplos canais e filtradas por tipo de evento, severidade e área de responsabilidade do administrador.",
      },
      {
        type: "heading",
        level: 3,
        text: "Canais de Notificação",
      },
      {
        type: "table",
        headers: ["Canal", "Configuração", "Uso Ideal"],
        rows: [
          ["In-app", "Sempre ativo, sem configuração", "Todas as notificações do dia-a-dia"],
          ["E-mail", "Endereço de e-mail do admin", "Resumos, relatórios, alertas medium"],
          ["Slack", "Webhook URL ou app integration", "Alertas em tempo real para equipe"],
          ["SMS", "Número de telefone verificado", "Alertas critical fora do expediente"],
          ["Webhook", "URL de destino customizada", "Integração com PagerDuty, OpsGenie, etc."],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Notificação",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Security: tentativas de login falhadas, 2FA bypass attempts, IP suspeito",
          "Compliance: novos alertas, SARs pendentes, KYC expirados",
          "Operations: transações falhadas, Gas Tank low, sync lag",
          "Clients: novos clientes, desativações, upgrade requests",
          "System: deployments, erros críticos, manutenção programada",
          "Reports: relatórios diários/semanais prontos para revisão",
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Preferências individuais",
        text: "Cada administrador pode configurar suas próprias preferências de notificação sem afetar os demais. Acesse seu perfil > Notificações para ajustar quais tipos de notificação receber em cada canal.",
      },
      {
        type: "heading",
        level: 3,
        text: "Configurando Slack",
      },
      {
        type: "steps",
        items: [
          {
            title: "Criar Slack App ou Webhook",
            description:
              "Crie uma Slack App com permissão de incoming webhooks ou gere um webhook URL para o canal desejado.",
          },
          {
            title: "Configurar no sistema",
            description:
              "Acesse Settings > Notificações > Slack. Informe o Webhook URL e selecione quais tipos de eventos enviar.",
          },
          {
            title: "Mapear canais",
            description:
              "Configure canais diferentes para tipos diferentes: #alerts-critical para critical, #alerts-general para info/warning.",
          },
          {
            title: "Testar integração",
            description:
              "Envie uma mensagem de teste para validar que as notificações chegam corretamente no canal.",
          },
        ],
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "slack_integration": {\n    "enabled": true,\n    "channels": {\n      "critical": {\n        "webhook_url": "https://hooks.slack.com/services/T.../B.../xxx",\n        "events": ["security.*", "compliance.critical", "operations.critical"]\n      },\n      "general": {\n        "webhook_url": "https://hooks.slack.com/services/T.../B.../yyy",\n        "events": ["compliance.*", "operations.*", "clients.*"]\n      },\n      "reports": {\n        "webhook_url": "https://hooks.slack.com/services/T.../B.../zzz",\n        "events": ["reports.*"],\n        "schedule": "09:00 UTC weekdays"\n      }\n    }\n  }\n}',
        filename: "slack-config.json",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Cuidado com notification fatigue! Configure filtros adequados e use canais separados para diferentes severidades. Administradores sobrecarregados de notificações tendem a ignorá-las, inclusive as críticas.",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/configurar-alertas",
        title: "Configurar Alertas",
        description:
          "Configure alertas técnicos que complementam as notificações administrativas",
      },
    ],
  },
  {
    slug: "integracoes",
    title: "Integrações de Sistema",
    description:
      "Configuração de integrações externas: Tatum.io, provedores KYC, analytics e mais.",
    category: "settings",
    icon: "Plug",
    difficulty: "advanced",
    tags: ["integrações", "API", "Tatum", "KYC", "terceiros"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Integrações Externas",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub integra-se com diversos serviços externos para funcionalidades como comunicação com blockchains (Tatum.io), verificação KYC, screening de compliance, price feeds e notificações. Cada integração é configurada e monitorada centralmente na seção de Settings.",
      },
      {
        type: "heading",
        level: 3,
        text: "Integrações Disponíveis",
      },
      {
        type: "table",
        headers: ["Serviço", "Função", "Status"],
        rows: [
          ["Tatum.io", "Blockchain API, wallet management, transaction processing", "Core"],
          ["Chainalysis", "Blockchain analytics, sanctions screening, risk scoring", "Compliance"],
          ["Onfido / Jumio", "Verificação de identidade (KYC), document verification", "Compliance"],
          ["CoinGecko / Binance", "Price feeds para conversão de moedas", "Pricing"],
          ["SendGrid / SES", "Envio de e-mails transacionais", "Comunicação"],
          ["Slack", "Notificações em tempo real", "Comunicação"],
          ["PagerDuty", "Gestão de incidentes e escalação", "Operações"],
          ["Datadog / NewRelic", "APM e observabilidade adicional (opcional)", "Monitoramento"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Tatum.io como core",
        text: "Tatum.io é a integração core do CryptoVaultHub, fornecendo a camada de abstração para comunicação com múltiplas blockchains. A configuração da API key e endpoints Tatum é essencial para o funcionamento da plataforma.",
      },
      {
        type: "heading",
        level: 3,
        text: "Configurando uma Integração",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar integrações",
            description:
              "Navegue até Settings > Integrations. A tela exibe todas as integrações disponíveis com status de cada uma.",
          },
          {
            title: "Selecionar integração",
            description:
              "Clique na integração que deseja configurar. O painel exibirá os campos necessários (API keys, endpoints, opções).",
          },
          {
            title: "Informar credenciais",
            description:
              "Preencha as credenciais de API. As credentials são armazenadas de forma segura usando envelope encryption via HashiCorp Vault.",
          },
          {
            title: "Testar conexão",
            description:
              "Clique em 'Test Connection' para validar que a integração está funcionando. O sistema executa uma chamada de teste específica para cada serviço.",
          },
          {
            title: "Ativar e monitorar",
            description:
              "Após o teste bem-sucedido, ative a integração. O health de cada integração é monitorado continuamente no dashboard.",
          },
        ],
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "integrations": {\n    "tatum": {\n      "api_key": "vault:secret/tatum#api_key",\n      "base_url": "https://api.tatum.io/v3",\n      "rate_limit": {\n        "requests_per_second": 50\n      },\n      "timeout_ms": 10000,\n      "retry_policy": {\n        "max_retries": 3,\n        "backoff": "exponential"\n      }\n    },\n    "chainalysis": {\n      "api_key": "vault:secret/chainalysis#api_key",\n      "base_url": "https://api.chainalysis.com/api/risk/v2",\n      "timeout_ms": 5000\n    }\n  }\n}',
        filename: "integrations-config.json",
      },
      {
        type: "heading",
        level: 3,
        text: "Health Monitoring",
      },
      {
        type: "paragraph",
        text: "Cada integração é monitorada com health checks periódicos. O dashboard de integrações exibe: status (healthy/degraded/down), latência média, taxa de erro e última verificação. Alertas são disparados quando uma integração degrada.",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Nunca exponha API keys diretamente nos arquivos de configuração. Todas as credentials devem ser armazenadas no HashiCorp Vault e referenciadas via path seguro (vault:secret/...).",
      },
      {
        type: "quote",
        text: "Integrações são tão fortes quanto seu elo mais fraco. Monitore cada provider externo como se fosse um serviço interno — porque para seus clientes, é.",
        author: "Princípios de Resiliência CryptoVaultHub",
      },
      {
        type: "link-card",
        href: "/support/kb/chains/rpc-providers",
        title: "RPC Providers",
        description:
          "Os RPC providers são a integração mais crítica — veja como configurá-los adequadamente",
      },
    ],
  },
  {
    slug: "timezone-localizacao",
    title: "Timezone e Localização",
    description:
      "Configuração de timezone, idioma e formatos regionais do sistema.",
    category: "settings",
    icon: "Globe",
    difficulty: "beginner",
    tags: ["timezone", "localização", "idioma", "formato", "regional"],
    updatedAt: "22 Abr 2026",
    readingTime: 4,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Timezone e Localização",
      },
      {
        type: "paragraph",
        text: "Configurações de timezone e localização determinam como datas, horários, números e moedas são exibidos na interface administrativa. Importante: o sistema armazena todos os dados internamente em UTC — as configurações de timezone afetam apenas a exibição.",
      },
      {
        type: "callout",
        variant: "info",
        title: "UTC interno",
        text: "Todos os timestamps no banco de dados, APIs e logs são em UTC. A conversão para o timezone configurado ocorre apenas na camada de apresentação. Isso garante consistência global e elimina ambiguidades.",
      },
      {
        type: "heading",
        level: 3,
        text: "Configurações Disponíveis",
      },
      {
        type: "table",
        headers: ["Configuração", "Opções", "Padrão"],
        rows: [
          ["Timezone", "Todos os timezones IANA (ex: America/Sao_Paulo)", "UTC"],
          ["Idioma", "pt-BR, en-US, es-ES", "pt-BR"],
          ["Formato de data", "DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD", "DD/MM/YYYY"],
          ["Formato de hora", "24h, 12h (AM/PM)", "24h"],
          ["Separador decimal", "Vírgula (,) ou ponto (.)", "Vírgula"],
          ["Separador de milhar", "Ponto (.) ou vírgula (,)", "Ponto"],
          ["Moeda padrão", "USD, BRL, EUR, etc.", "USD"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Escopos de Configuração",
      },
      {
        type: "paragraph",
        text: "As configurações de localização podem ser definidas em dois escopos:",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Global (sistema): aplicada como padrão para todos os administradores e nas APIs",
          "Por administrador: cada admin pode sobrescrever com suas preferências pessoais (acessível no perfil)",
        ],
      },
      {
        type: "steps",
        items: [
          {
            title: "Configuração global",
            description:
              "Acesse Settings > Localização para definir os padrões do sistema que se aplicam a todos os usuários.",
          },
          {
            title: "Configuração pessoal",
            description:
              "Cada administrador pode ajustar seu timezone e formato no perfil pessoal (avatar > Preferências).",
          },
          {
            title: "Verificar exibição",
            description:
              "Após alterar, verifique que datas e valores estão formatados corretamente em diferentes telas do sistema.",
          },
        ],
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "localization": {\n    "global": {\n      "timezone": "America/Sao_Paulo",\n      "locale": "pt-BR",\n      "date_format": "DD/MM/YYYY",\n      "time_format": "24h",\n      "number_format": {\n        "decimal_separator": ",",\n        "thousand_separator": "."\n      },\n      "default_currency": "USD"\n    },\n    "admin_overrides_allowed": true\n  }\n}',
        filename: "localization-config.json",
      },
      {
        type: "callout",
        variant: "warning",
        title: "APIs sempre em UTC",
        text: "Independente da configuração de timezone, todas as respostas de API retornam timestamps em UTC (formato ISO 8601). A conversão deve ser feita pelo cliente da API. Isso é intencional e não deve ser alterado.",
      },
      {
        type: "paragraph",
        text: "Para exportações, o timezone aplicado é o do administrador que solicitou a exportação. Datas nos arquivos exportados incluem indicação do timezone para evitar ambiguidade.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Se sua equipe está distribuída em múltiplos fusos horários, mantenha o padrão do sistema em UTC e permita que cada administrador configure seu timezone pessoal. Isso evita confusão em análises compartilhadas.",
      },
      {
        type: "link-card",
        href: "/support/kb/settings/configuracoes-gerais",
        title: "Configurações Gerais",
        description:
          "Volte às configurações gerais para ajustar outros parâmetros do sistema",
      },
    ],
  },
];
