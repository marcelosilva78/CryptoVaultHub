import type { Article } from "../components/types";

export const gettingStartedArticles: Article[] = [
  {
    slug: "primeiro-acesso",
    title: "Primeiro Acesso ao Portal",
    description:
      "Guia completo para seu primeiro acesso ao portal de cliente CryptoVaultHub, desde o recebimento do convite até o login seguro.",
    category: "getting-started",
    icon: "LogIn",
    difficulty: "beginner",
    tags: ["primeiro acesso", "login", "onboarding", "portal"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Bem-vindo ao CryptoVaultHub",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub é uma plataforma de custódia de ativos digitais que oferece segurança institucional para gerenciar suas wallets, transações e integrações blockchain. Este guia vai ajudá-lo a configurar sua conta e realizar o primeiro acesso.",
      },
      {
        type: "paragraph",
        text: "Após a aprovação do seu cadastro pelo administrador da plataforma, você receberá um e-mail de convite no endereço registrado. Esse e-mail contém um link único de ativação válido por 48 horas.",
      },
      {
        type: "callout",
        variant: "info",
        title: "E-mail não recebido?",
        text: "Verifique a pasta de spam ou lixo eletrônico. Caso não encontre o convite, entre em contato com o administrador para reenvio. O link de ativação expira em 48 horas.",
      },
      {
        type: "heading",
        level: 3,
        text: "Passo a Passo do Primeiro Acesso",
      },
      {
        type: "steps",
        items: [
          {
            title: "Abrir o e-mail de convite",
            description:
              "Localize o e-mail com assunto 'Ativação da sua conta CryptoVaultHub' e clique no botão 'Ativar Minha Conta'.",
          },
          {
            title: "Definir sua senha",
            description:
              "Crie uma senha forte com no mínimo 12 caracteres, incluindo letras maiúsculas, minúsculas, números e caracteres especiais. A plataforma verificará a força da senha em tempo real.",
          },
          {
            title: "Configurar autenticação 2FA",
            description:
              "A configuração de 2FA é obrigatória. Escaneie o QR code com um aplicativo autenticador (Google Authenticator, Authy ou 1Password) e confirme com o código de 6 dígitos.",
          },
          {
            title: "Aceitar os termos de uso",
            description:
              "Leia e aceite os Termos de Serviço e a Política de Privacidade. Esses documentos detalham suas responsabilidades e os SLAs da plataforma.",
          },
          {
            title: "Acessar o dashboard",
            description:
              "Após a configuração inicial, você será redirecionado ao dashboard principal com uma visão geral das suas wallets, transações recentes e status da conta.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Requisitos de Senha",
      },
      {
        type: "table",
        headers: ["Requisito", "Mínimo"],
        rows: [
          ["Comprimento", "12 caracteres"],
          ["Letras maiúsculas", "1 caractere"],
          ["Letras minúsculas", "1 caractere"],
          ["Números", "1 dígito"],
          ["Caracteres especiais", "1 símbolo (!@#$%...)"],
          ["Senhas anteriores", "Não pode repetir as últimas 5"],
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Recomendamos o uso de um gerenciador de senhas como 1Password, Bitwarden ou LastPass para criar e armazenar senhas seguras. Nunca reutilize senhas de outros serviços.",
      },
      {
        type: "paragraph",
        text: "Seu acesso ao portal está vinculado ao tier de serviço definido pelo administrador. Dependendo do tier, você terá diferentes limites de transação, número de wallets e funcionalidades disponíveis.",
      },
      {
        type: "link-card",
        href: "/support/kb/getting-started/visao-dashboard",
        title: "Visão Geral do Dashboard",
        description:
          "Conheça os principais elementos e funcionalidades do dashboard após o primeiro login",
      },
    ],
  },
  {
    slug: "visao-dashboard",
    title: "Visão Geral do Dashboard",
    description:
      "Tour completo pelo dashboard do portal de cliente, incluindo widgets, métricas e navegação principal.",
    category: "getting-started",
    icon: "LayoutDashboard",
    difficulty: "beginner",
    tags: ["dashboard", "visão geral", "métricas", "navegação"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "O Dashboard do Cliente",
      },
      {
        type: "paragraph",
        text: "O dashboard é a tela principal do portal CryptoVaultHub. Ele apresenta uma visão consolidada de todas as suas operações: saldos de wallets, transações recentes, status de webhooks e alertas importantes. A interface é atualizada em tempo real.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Personalização",
        text: "Você pode reorganizar os widgets do dashboard arrastando-os para diferentes posições. As preferências são salvas automaticamente no seu perfil.",
      },
      {
        type: "heading",
        level: 3,
        text: "Elementos Principais",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Saldo Total — Consolidação do valor em todas as wallets convertido para USD ou BRL",
          "Wallets Ativas — Lista resumida das wallets com saldo e última atividade",
          "Transações Recentes — Últimas 10 transações com status e valores",
          "Alertas — Notificações de segurança, expiração de API keys e limites próximos",
          "Status dos Serviços — Indicador de saúde dos serviços consumidos",
          "Atalhos Rápidos — Acesso direto a criar wallet, enviar transação e configurar webhook",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Navegação Lateral",
      },
      {
        type: "paragraph",
        text: "A barra lateral (sidebar) organiza todas as funcionalidades em seções lógicas: Main (Dashboard, Wallets, Transactions), Projects (gestão de projetos e deploy), Operations (depósitos, saques, flush) e Integration (webhooks, co-sign, API keys). A seção Settings oferece configurações de notificação e segurança.",
      },
      {
        type: "mermaid",
        chart:
          "graph LR\n  A[Dashboard] --> B[Wallets]\n  A --> C[Transactions]\n  A --> D[Projects]\n  A --> E[Operations]\n  A --> F[Integration]\n  B --> B1[Criar]\n  B --> B2[Gerenciar]\n  C --> C1[Enviar]\n  C --> C2[Receber]\n  E --> E1[Depósitos]\n  E --> E2[Saques]\n  F --> F1[Webhooks]\n  F --> F2[API Keys]",
      },
      {
        type: "heading",
        level: 3,
        text: "Temas e Acessibilidade",
      },
      {
        type: "paragraph",
        text: "O portal suporta tema claro e escuro, alternáveis pelo ícone de sol/lua no header. A preferência é salva no navegador e sincronizada entre dispositivos quando logado. Todos os componentes seguem padrões de acessibilidade WCAG 2.1 AA.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use o atalho de teclado Ctrl+K (ou Cmd+K no Mac) para abrir a busca rápida e navegar para qualquer seção do portal instantaneamente.",
      },
      {
        type: "link-card",
        href: "/support/kb/getting-started/setup-wizard",
        title: "Setup Wizard",
        description:
          "Configure seu projeto e primeiras wallets usando o assistente guiado",
      },
    ],
  },
  {
    slug: "setup-wizard",
    title: "Setup Wizard",
    description:
      "Use o assistente de configuração para criar seu primeiro projeto, wallets e integrações de forma guiada.",
    category: "getting-started",
    icon: "Wand2",
    difficulty: "beginner",
    tags: ["setup", "wizard", "configuração", "primeiro projeto"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Assistente de Configuração Inicial",
      },
      {
        type: "paragraph",
        text: "O Setup Wizard é um assistente passo a passo que guia você na configuração inicial da plataforma. Ele é apresentado automaticamente no primeiro acesso e pode ser reexecutado a qualquer momento pelo menu Projects > Setup Wizard.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Quando usar o wizard?",
        text: "O wizard é ideal para novos usuários ou quando você precisa configurar um novo projeto do zero. Usuários avançados podem preferir usar a API ou os formulários individuais de cada seção.",
      },
      {
        type: "heading",
        level: 3,
        text: "Etapas do Wizard",
      },
      {
        type: "steps",
        items: [
          {
            title: "Escolher nome do projeto",
            description:
              "Defina um nome descritivo para o projeto. O nome será usado em dashboards, relatórios e API calls. Exemplo: 'Produção - Exchange BRL', 'Staging - Testes QA'.",
          },
          {
            title: "Selecionar blockchains",
            description:
              "Escolha quais redes blockchain serão habilitadas: Ethereum, Bitcoin, Polygon, Tron, BSC, entre outras. Cada chain selecionada terá uma wallet HD criada automaticamente.",
          },
          {
            title: "Configurar wallets iniciais",
            description:
              "Para cada chain selecionada, defina um label para a wallet e configure se deseja gerar endereços de depósito automaticamente. A derivação segue o padrão BIP-44.",
          },
          {
            title: "Configurar webhook (opcional)",
            description:
              "Informe uma URL de callback para receber notificações de transações, depósitos e eventos do sistema. O wizard enviará um ping de teste para validar a conectividade.",
          },
          {
            title: "Gerar API key",
            description:
              "Uma API key será gerada automaticamente para integração programática. Copie e armazene a key em local seguro — ela não será exibida novamente.",
          },
          {
            title: "Revisão e finalização",
            description:
              "Revise todas as configurações na tela de resumo. Clique em 'Finalizar' para provisionar todos os recursos. O processo leva alguns segundos.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Chains Disponíveis",
      },
      {
        type: "table",
        headers: ["Chain", "Tipo", "Tempo Médio de Confirmação"],
        rows: [
          ["Ethereum (ETH)", "EVM", "~15 segundos"],
          ["Bitcoin (BTC)", "UTXO", "~10 minutos"],
          ["Polygon (MATIC)", "EVM", "~2 segundos"],
          ["Tron (TRX)", "TVM", "~3 segundos"],
          ["BSC (BNB)", "EVM", "~3 segundos"],
          ["Solana (SOL)", "SVM", "~0.4 segundos"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "API Key visível apenas uma vez",
        text: "A API key gerada no wizard é exibida apenas uma vez na tela de confirmação. Copie e armazene em um vault seguro (ex: HashiCorp Vault, AWS Secrets Manager). Se perder, será necessário gerar uma nova key.",
      },
      {
        type: "paragraph",
        text: "Após finalizar o wizard, você será redirecionado ao dashboard do projeto recém-criado. A partir dali, pode começar a enviar transações, monitorar depósitos e configurar integrações adicionais.",
      },
      {
        type: "link-card",
        href: "/support/kb/getting-started/configuracao-inicial",
        title: "Configuração Inicial do Projeto",
        description:
          "Ajuste as configurações avançadas do projeto após a criação pelo wizard",
      },
    ],
  },
  {
    slug: "configuracao-inicial",
    title: "Configuração Inicial do Projeto",
    description:
      "Ajuste as configurações avançadas do projeto após a criação, incluindo limites, notificações e políticas de aprovação.",
    category: "getting-started",
    icon: "Settings",
    difficulty: "intermediate",
    tags: ["configuração", "projeto", "limites", "notificações"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Configurações Avançadas do Projeto",
      },
      {
        type: "paragraph",
        text: "Após criar um projeto pelo Setup Wizard ou pela API, é importante revisar e ajustar as configurações avançadas conforme as necessidades do seu negócio. Este guia cobre as principais configurações disponíveis na página de detalhes do projeto.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "As configurações padrão são seguras e funcionais para a maioria dos casos. Ajuste apenas se necessário para o seu fluxo específico.",
      },
      {
        type: "heading",
        level: 3,
        text: "Limites de Transação",
      },
      {
        type: "paragraph",
        text: "Os limites de transação definem os valores máximos permitidos por operação e por período. Esses limites são adicionais aos limites do seu tier e aplicam-se apenas ao projeto específico.",
      },
      {
        type: "table",
        headers: ["Configuração", "Padrão", "Descrição"],
        rows: [
          ["Limite por transação", "10 ETH / 0.5 BTC", "Valor máximo por operação individual"],
          ["Limite diário", "50 ETH / 2 BTC", "Soma máxima de operações em 24 horas"],
          ["Limite mensal", "500 ETH / 20 BTC", "Soma máxima de operações em 30 dias"],
          ["Auto-aprovação até", "1 ETH / 0.05 BTC", "Transações abaixo deste valor são aprovadas automaticamente"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Políticas de Aprovação",
      },
      {
        type: "paragraph",
        text: "Configure quantas aprovações são necessárias para diferentes faixas de valor. A política de co-sign garante que transações de alto valor passem por múltiplos aprovadores antes da execução on-chain.",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "approval_policies": [\n    { "min_value_usd": 0, "max_value_usd": 1000, "required_approvals": 0 },\n    { "min_value_usd": 1000, "max_value_usd": 10000, "required_approvals": 1 },\n    { "min_value_usd": 10000, "max_value_usd": null, "required_approvals": 2 }\n  ]\n}',
        filename: "approval-policy.json",
      },
      {
        type: "heading",
        level: 3,
        text: "Notificações do Projeto",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "E-mail para depósitos acima de um valor configurável",
          "Webhook para todas as transações (entrada e saída)",
          "Alerta quando limites atingem 80% de utilização",
          "Notificação de falhas em transações",
          "Resumo diário de operações por e-mail",
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Alterações sensíveis requerem 2FA",
        text: "Modificações em limites de transação e políticas de aprovação requerem confirmação de 2FA. Essa camada adicional de segurança protege contra alterações não autorizadas.",
      },
      {
        type: "paragraph",
        text: "Todas as alterações de configuração são registradas no histórico do projeto com data, hora e responsável pela mudança, garantindo rastreabilidade total.",
      },
      {
        type: "link-card",
        href: "/support/kb/getting-started/glossario",
        title: "Glossário de Termos",
        description:
          "Consulte definições de termos técnicos usados na plataforma",
      },
    ],
  },
  {
    slug: "glossario",
    title: "Glossário de Termos",
    description:
      "Definições dos termos técnicos e siglas utilizados na plataforma CryptoVaultHub.",
    category: "getting-started",
    icon: "BookOpen",
    difficulty: "beginner",
    tags: ["glossário", "termos", "definições", "conceitos"],
    updatedAt: "22 Abr 2026",
    readingTime: 8,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Termos e Conceitos da Plataforma",
      },
      {
        type: "paragraph",
        text: "Este glossário contém definições dos principais termos utilizados na plataforma CryptoVaultHub. Use-o como referência rápida sempre que encontrar um termo desconhecido na documentação ou interface.",
      },
      {
        type: "heading",
        level: 3,
        text: "Blockchain e Criptoativos",
      },
      {
        type: "table",
        headers: ["Termo", "Definição"],
        rows: [
          ["Blockchain", "Livro-razão distribuído e imutável que registra todas as transações de uma rede"],
          ["Chain", "Uma rede blockchain específica (ex: Ethereum, Bitcoin, Polygon)"],
          ["Token", "Ativo digital criado sobre uma blockchain existente (ex: USDT na Ethereum)"],
          ["Gas", "Taxa paga para executar operações em redes EVM (Ethereum, Polygon, BSC)"],
          ["UTXO", "Modelo de transação usado pelo Bitcoin — Unspent Transaction Output"],
          ["Smart Contract", "Programa autônomo executado na blockchain com regras predefinidas"],
          ["Confirmação", "Número de blocos adicionados à chain após uma transação, validando-a"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Wallets e Endereços",
      },
      {
        type: "table",
        headers: ["Termo", "Definição"],
        rows: [
          ["HD Wallet", "Hierarchical Deterministic Wallet — gera múltiplos endereços a partir de uma seed"],
          ["Seed Phrase", "Conjunto de 12 ou 24 palavras que permite recuperar uma wallet"],
          ["Endereço de Depósito", "Endereço gerado para receber fundos em uma chain específica"],
          ["Derivation Path", "Caminho usado para gerar endereços a partir da seed (BIP-44)"],
          ["Cold Wallet", "Wallet offline para armazenamento seguro de longo prazo"],
          ["Hot Wallet", "Wallet online usada para operações do dia-a-dia"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Operações e Segurança",
      },
      {
        type: "table",
        headers: ["Termo", "Definição"],
        rows: [
          ["Co-Sign", "Processo de assinatura colaborativa que requer múltiplas aprovações"],
          ["2FA", "Autenticação de dois fatores — código temporário além da senha"],
          ["TOTP", "Time-based One-Time Password — algoritmo usado pelo Google Authenticator"],
          ["Flush", "Consolidação de saldos de múltiplos endereços em um único endereço"],
          ["Webhook", "Notificação HTTP enviada automaticamente quando um evento ocorre"],
          ["Rate Limit", "Limite de requisições à API por período de tempo"],
          ["Tier", "Nível de serviço que define limites e funcionalidades disponíveis"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Siglas Comuns",
        text: "API = Application Programming Interface | JWT = JSON Web Token | RBAC = Role-Based Access Control | KYC = Know Your Customer | AML = Anti-Money Laundering | SLA = Service Level Agreement",
      },
      {
        type: "paragraph",
        text: "Este glossário é atualizado continuamente conforme novas funcionalidades são adicionadas à plataforma. Se encontrar um termo que não está listado, utilize o FAQ ou entre em contato com o suporte.",
      },
      {
        type: "link-card",
        href: "/support/kb/wallets/criar-wallet",
        title: "Criar uma Wallet",
        description:
          "Agora que você conhece os termos, aprenda a criar sua primeira wallet",
      },
    ],
  },
];
