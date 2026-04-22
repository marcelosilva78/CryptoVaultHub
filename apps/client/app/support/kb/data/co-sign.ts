import type { Article } from "../components/types";

export const coSignArticles: Article[] = [
  {
    slug: "configurar-cosign",
    title: "Configurar Co-Sign",
    description:
      "Como habilitar e configurar a assinatura colaborativa (co-sign) nas suas wallets para maior segurança.",
    category: "co-sign",
    icon: "PenTool",
    difficulty: "intermediate",
    tags: ["co-sign", "configurar", "multi-sig", "segurança"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "O que é Co-Sign?",
      },
      {
        type: "paragraph",
        text: "Co-Sign é a funcionalidade de assinatura colaborativa da plataforma CryptoVaultHub. Quando habilitado, transações requerem a aprovação de múltiplos signatários antes de serem executadas on-chain. Isso adiciona uma camada crítica de segurança para operações de alto valor.",
      },
      {
        type: "paragraph",
        text: "O sistema utiliza Shamir Secret Sharing para dividir a chave privada em shares distribuídos entre os signatários. Nenhum signatário individual possui acesso à chave completa — a assinatura só é possível quando o threshold mínimo de shares é combinado.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Quando usar Co-Sign?",
        text: "Co-Sign é recomendado para wallets com saldo significativo, transações de alto valor ou quando a política corporativa exige múltiplas aprovações. É especialmente útil para separar responsabilidades entre membros da equipe.",
      },
      {
        type: "heading",
        level: 3,
        text: "Habilitando Co-Sign em uma Wallet",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar detalhes da wallet",
            description:
              "Na tela de Wallets, clique na wallet onde deseja habilitar co-sign.",
          },
          {
            title: "Aba 'Segurança'",
            description:
              "Acesse a aba 'Segurança' e clique em 'Habilitar Co-Sign'.",
          },
          {
            title: "Definir signatários",
            description:
              "Adicione os membros da equipe que serão signatários. Cada signatário precisa ter uma conta ativa com 2FA habilitado.",
          },
          {
            title: "Configurar threshold",
            description:
              "Defina o número mínimo de aprovações necessárias. Ex: 2 de 3 significa que 2 dos 3 signatários devem aprovar.",
          },
          {
            title: "Confirmar com todos os signatários",
            description:
              "Cada signatário receberá uma notificação para aceitar o papel. O co-sign só será ativado quando todos aceitarem.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Configurações de Threshold",
      },
      {
        type: "table",
        headers: ["Cenário", "Signatários", "Threshold", "Segurança"],
        rows: [
          ["Equipe pequena", "2", "2 de 2", "Máxima (ambos devem aprovar)"],
          ["Equipe média", "3", "2 de 3", "Alta (quorum necessário)"],
          ["Equipe grande", "5", "3 de 5", "Alta (flexibilidade com segurança)"],
          ["Corporativo", "7", "4 de 7", "Máxima (maioria simples)"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Conversão irreversível",
        text: "A conversão de uma wallet managed para co-sign é permanente. Não é possível reverter para managed após a ativação do co-sign. Planeje com cuidado antes de converter wallets com saldo significativo.",
      },
      {
        type: "code",
        language: "bash",
        code: 'curl -X POST https://api.vaulthub.live/v1/wallets/wal_abc123/co-sign/enable \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "signers": [\n      { "user_id": "usr_001", "role": "admin" },\n      { "user_id": "usr_002", "role": "approver" },\n      { "user_id": "usr_003", "role": "approver" }\n    ],\n    "threshold": 2,\n    "auto_approve_below_usd": 500\n  }\'',
        filename: "enable-cosign.sh",
      },
      {
        type: "link-card",
        href: "/support/kb/co-sign/fluxo-aprovacao",
        title: "Fluxo de Aprovação",
        description:
          "Entenda como funciona o fluxo de aprovação de transações co-sign",
      },
    ],
  },
  {
    slug: "fluxo-aprovacao",
    title: "Fluxo de Aprovação",
    description:
      "Como funciona o fluxo de aprovação de transações em wallets co-sign, desde a solicitação até a execução.",
    category: "co-sign",
    icon: "GitPullRequest",
    difficulty: "intermediate",
    tags: ["co-sign", "aprovação", "fluxo", "pending"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Fluxo de Aprovação Co-Sign",
      },
      {
        type: "paragraph",
        text: "Quando uma transação é criada em uma wallet co-sign, ela não é executada imediatamente. Em vez disso, entra em uma fila de aprovação onde os signatários designados devem analisar e aprovar (ou rejeitar) antes que a transação seja submetida à blockchain.",
      },
      {
        type: "heading",
        level: 3,
        text: "Ciclo de Vida da Aprovação",
      },
      {
        type: "mermaid",
        chart:
          "sequenceDiagram\n  participant S as Solicitante\n  participant P as Plataforma\n  participant A1 as Aprovador 1\n  participant A2 as Aprovador 2\n  participant B as Blockchain\n  S->>P: Cria transação\n  P->>A1: Notificação de aprovação\n  P->>A2: Notificação de aprovação\n  A1->>P: Aprova (2FA)\n  P->>P: 1/2 aprovações\n  A2->>P: Aprova (2FA)\n  P->>P: 2/2 threshold atingido\n  P->>B: Broadcast transação\n  B->>P: Confirmação\n  P->>S: Webhook: transaction.confirmed",
      },
      {
        type: "heading",
        level: 3,
        text: "Status de Aprovação",
      },
      {
        type: "table",
        headers: ["Status", "Descrição", "Ações"],
        rows: [
          ["pending_approval", "Aguardando aprovações dos signatários", "Aprovar, Rejeitar"],
          ["partially_approved", "Algumas aprovações recebidas, threshold não atingido", "Aprovar, Rejeitar"],
          ["approved", "Threshold atingido, transação será executada", "Nenhuma"],
          ["rejected", "Rejeitada por um ou mais signatários", "Resubmeter"],
          ["expired", "Tempo limite de aprovação excedido", "Resubmeter"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Tempo limite de aprovação",
        text: "Transações pendentes de aprovação expiram após 24 horas (configurável). Após a expiração, o solicitante pode resubmeter a transação. Isso previne transações esquecidas na fila.",
      },
      {
        type: "heading",
        level: 3,
        text: "Aprovar uma Transação",
      },
      {
        type: "steps",
        items: [
          {
            title: "Receber notificação",
            description:
              "Quando uma transação requer sua aprovação, você receberá notificação por e-mail, webhook e no dashboard.",
          },
          {
            title: "Revisar detalhes",
            description:
              "Acesse a tela de Co-Sign para ver os detalhes: valor, destino, nota e quem solicitou a transação.",
          },
          {
            title: "Aprovar ou rejeitar",
            description:
              "Clique em 'Aprovar' para concordar com a transação ou 'Rejeitar' para bloquear. Em ambos os casos, 2FA é necessário.",
          },
        ],
      },
      {
        type: "paragraph",
        text: "O histórico completo de aprovações e rejeições é mantido para cada transação, incluindo timestamp, IP do aprovador e comentários opcionais. Esses dados são parte do audit trail imutável.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Configure notificações push ou webhooks para aprovações pendentes para que sua equipe responda rapidamente e não atrase operações críticas.",
      },
      {
        type: "link-card",
        href: "/support/kb/co-sign/multi-sig",
        title: "Multi-Sig Setup",
        description:
          "Configure esquemas multi-sig avançados com diferentes níveis de permissão",
      },
    ],
  },
  {
    slug: "multi-sig",
    title: "Multi-Sig Setup",
    description:
      "Configuração avançada de multi-sig com Shamir Secret Sharing, roles e níveis de permissão diferenciados.",
    category: "co-sign",
    icon: "Users",
    difficulty: "advanced",
    tags: ["multi-sig", "shamir", "shares", "threshold", "avançado"],
    updatedAt: "22 Abr 2026",
    readingTime: 8,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Multi-Sig com Shamir Secret Sharing",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub implementa multi-sig usando Shamir Secret Sharing (SSS), um algoritmo criptográfico que divide um segredo em N shares, dos quais apenas K (threshold) são necessários para reconstituir o segredo original. Isso é fundamentalmente diferente de multisig on-chain.",
      },
      {
        type: "callout",
        variant: "info",
        title: "SSS vs Multisig On-Chain",
        text: "O Shamir Secret Sharing opera na camada de aplicação, não na blockchain. Isso significa que a transação final é uma transação normal (single-sig on-chain), mas a chave de assinatura só é reconstituída quando o threshold de shares é atingido na plataforma.",
      },
      {
        type: "heading",
        level: 3,
        text: "Como Funciona",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  K[Chave Privada] --> SSS[Shamir Split]\n  SSS --> S1[Share 1 - Admin]\n  SSS --> S2[Share 2 - Aprovador A]\n  SSS --> S3[Share 3 - Aprovador B]\n  SSS --> S4[Share 4 - Backup]\n  S1 --> R{Threshold 3/4}\n  S2 --> R\n  S3 --> R\n  R --> RK[Chave Reconstituída]\n  RK --> TX[Transação Assinada]",
      },
      {
        type: "heading",
        level: 3,
        text: "Roles de Signatários",
      },
      {
        type: "table",
        headers: ["Role", "Permissões", "Descrição"],
        rows: [
          ["Admin", "Aprovar, rejeitar, configurar", "Pode alterar configurações de co-sign e aprovar transações"],
          ["Approver", "Aprovar, rejeitar", "Pode aprovar e rejeitar transações"],
          ["Viewer", "Visualizar", "Pode ver transações pendentes mas não pode aprovar"],
          ["Backup", "Aprovar (emergência)", "Share de backup usado apenas quando signatário principal está indisponível"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Configuração Avançada",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "co_sign_config": {\n    "wallet_id": "wal_abc123",\n    "scheme": "shamir",\n    "total_shares": 5,\n    "threshold": 3,\n    "signers": [\n      { "user_id": "usr_001", "role": "admin", "share_index": 1 },\n      { "user_id": "usr_002", "role": "approver", "share_index": 2 },\n      { "user_id": "usr_003", "role": "approver", "share_index": 3 },\n      { "user_id": "usr_004", "role": "approver", "share_index": 4 },\n      { "user_id": "usr_005", "role": "backup", "share_index": 5 }\n    ],\n    "approval_timeout_hours": 24,\n    "auto_approve_below_usd": 1000,\n    "notify_channels": ["email", "webhook"]\n  }\n}',
        filename: "multisig-config.json",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Gerenciamento de shares",
        text: "Shares são distribuídos de forma segura para cada signatário e armazenados encriptados. Se um signatário perder acesso, o share de backup pode ser usado temporariamente enquanto um novo signatário é configurado.",
      },
      {
        type: "heading",
        level: 3,
        text: "Boas Práticas de Multi-Sig",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Sempre mantenha ao menos 1 share de backup para contingência",
          "Não concentre mais de 1 share por pessoa",
          "Revise os signatários periodicamente e remova acessos desnecessários",
          "Configure timeout de aprovação adequado ao seu fluxo de trabalho",
          "Teste o fluxo de aprovação com transações de valor baixo antes de usar em produção",
        ],
      },
      {
        type: "link-card",
        href: "/support/kb/co-sign/politicas-aprovacao",
        title: "Políticas de Aprovação",
        description:
          "Configure políticas de aprovação baseadas em valor, destino e horário",
      },
    ],
  },
  {
    slug: "politicas-aprovacao",
    title: "Políticas de Aprovação",
    description:
      "Como configurar políticas de aprovação granulares baseadas em valor, destino, horário e outras condições.",
    category: "co-sign",
    icon: "FileCheck",
    difficulty: "advanced",
    tags: ["política", "aprovação", "regras", "auto-approve", "condições"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Políticas de Aprovação",
      },
      {
        type: "paragraph",
        text: "As políticas de aprovação permitem definir regras granulares que determinam quantas aprovações são necessárias com base em condições como valor da transação, endereço de destino, horário e chain. Isso proporciona flexibilidade sem comprometer a segurança.",
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Regras",
      },
      {
        type: "table",
        headers: ["Tipo de Regra", "Condição", "Exemplo"],
        rows: [
          ["Valor", "Baseado no valor em USD", "Acima de $10.000 requer 3 aprovações"],
          ["Destino", "Endereço de destino", "Endereços whitelistados: auto-aprovação"],
          ["Horário", "Fora do horário comercial", "Transações após 18h requerem aprovação extra"],
          ["Chain", "Blockchain específica", "Bitcoin sempre requer co-sign"],
          ["Frequência", "Número de transações no período", "Mais de 10 tx/hora requer revisão"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Combinação de regras",
        text: "Múltiplas regras podem ser combinadas. O sistema aplica a regra mais restritiva quando há sobreposição. Por exemplo, uma transação de $50.000 para um endereço desconhecido fora do horário comercial acionará todas as regras aplicáveis.",
      },
      {
        type: "heading",
        level: 3,
        text: "Configurar Política",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar configurações de Co-Sign",
            description:
              "Na wallet co-sign, acesse a aba 'Segurança' e depois 'Políticas de Aprovação'.",
          },
          {
            title: "Criar nova regra",
            description:
              "Clique em 'Nova Regra' e selecione o tipo de condição (valor, destino, horário, etc.).",
          },
          {
            title: "Definir parâmetros",
            description:
              "Configure os parâmetros da regra: threshold, condições de ativação e exceções.",
          },
          {
            title: "Definir prioridade",
            description:
              "Ordene as regras por prioridade. Regras com prioridade mais alta são avaliadas primeiro.",
          },
          {
            title: "Ativar e testar",
            description:
              "Ative a regra e teste com uma transação de valor baixo para verificar o comportamento esperado.",
          },
        ],
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "policies": [\n    {\n      "name": "Auto-approve low value",\n      "priority": 1,\n      "conditions": { "max_value_usd": 500 },\n      "action": { "auto_approve": true }\n    },\n    {\n      "name": "Whitelist auto-approve",\n      "priority": 2,\n      "conditions": { "destination_in_whitelist": true, "max_value_usd": 5000 },\n      "action": { "auto_approve": true }\n    },\n    {\n      "name": "High value transaction",\n      "priority": 3,\n      "conditions": { "min_value_usd": 10000 },\n      "action": { "required_approvals": 3, "timeout_hours": 12 }\n    },\n    {\n      "name": "After hours",\n      "priority": 4,\n      "conditions": { "time_outside": "09:00-18:00" },\n      "action": { "required_approvals": 2 }\n    }\n  ]\n}',
        filename: "approval-policies.json",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Mantenha a whitelist de endereços atualizada. Endereços de fornecedores, exchanges e parceiros frequentes podem ter auto-aprovação até determinado valor, acelerando operações rotineiras.",
      },
      {
        type: "paragraph",
        text: "As políticas podem ser alteradas a qualquer momento, mas a mudança requer aprovação de um signatário admin. O histórico de alterações de políticas é mantido no audit trail.",
      },
      {
        type: "link-card",
        href: "/support/kb/co-sign/troubleshooting",
        title: "Troubleshooting de Co-Sign",
        description:
          "Resolva problemas comuns com o fluxo de co-sign",
      },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting de Co-Sign",
    description:
      "Diagnóstico e resolução de problemas comuns com o fluxo de co-sign: aprovações travadas, signatários indisponíveis e mais.",
    category: "co-sign",
    icon: "Bug",
    difficulty: "advanced",
    tags: ["co-sign", "troubleshooting", "problemas", "diagnóstico"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Resolvendo Problemas de Co-Sign",
      },
      {
        type: "paragraph",
        text: "O fluxo de co-sign é robusto mas pode apresentar situações que requerem atenção. Este guia cobre os problemas mais comuns e suas soluções, desde aprovações travadas até signatários indisponíveis.",
      },
      {
        type: "heading",
        level: 3,
        text: "Problemas Comuns e Soluções",
      },
      {
        type: "table",
        headers: ["Problema", "Causa Provável", "Solução"],
        rows: [
          ["Transação expirada", "Aprovadores não responderam a tempo", "Resubmeter transação e contatar aprovadores"],
          ["Aprovador não recebe notificação", "E-mail em spam ou webhook falhando", "Verificar configurações de notificação"],
          ["Erro ao aprovar", "2FA expirado ou sessão inválida", "Relogar e tentar novamente"],
          ["Threshold atingido mas não executa", "Problema temporário de rede", "Aguardar ou contatar suporte"],
          ["Signatário saiu da empresa", "Share não pode ser usado", "Usar share de backup e reconfigurar signatários"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Signatário Indisponível",
      },
      {
        type: "paragraph",
        text: "Se um signatário está temporariamente indisponível (férias, doença), o share de backup pode ser ativado por um admin. O processo requer verificação de identidade adicional e registro do motivo.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Remoção de signatário",
        text: "Ao remover um signatário, os shares são redistribuídos automaticamente. Isso requer confirmação de todos os signatários restantes e gera uma nova configuração de shares. Transações pendentes serão canceladas.",
      },
      {
        type: "heading",
        level: 3,
        text: "Diagnóstico via API",
      },
      {
        type: "code",
        language: "bash",
        code: '# Verificar status de aprovações pendentes\ncurl https://api.vaulthub.live/v1/wallets/wal_abc123/co-sign/pending \\\n  -H "Authorization: Bearer $API_KEY"\n\n# Verificar saúde do co-sign da wallet\ncurl https://api.vaulthub.live/v1/wallets/wal_abc123/co-sign/health \\\n  -H "Authorization: Bearer $API_KEY"\n\n# Resposta de health inclui:\n# - Status de cada signatário (active, unavailable)\n# - Shares válidos vs threshold\n# - Transações pendentes e expiradas\n# - Última atividade de cada signatário',
        filename: "cosign-diagnostics.sh",
      },
      {
        type: "heading",
        level: 3,
        text: "Checklist de Diagnóstico",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Verificar se todos os signatários têm sessão ativa e 2FA funcionando",
          "Verificar se as notificações estão chegando (e-mail e webhook)",
          "Verificar se o timeout de aprovação não é muito curto para sua equipe",
          "Verificar se o threshold é atingível (ex: 3 de 3 com 1 pessoa de férias)",
          "Verificar se há transações anteriores travadas bloqueando novas operações",
          "Verificar o health endpoint da wallet para status geral do co-sign",
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Sempre mantenha ao menos 1 share de backup configurado. Isso evita que férias ou saída de um membro da equipe bloqueie completamente as operações da wallet.",
      },
      {
        type: "paragraph",
        text: "Se nenhuma das soluções acima resolver o problema, entre em contato com o suporte administrativo informando o wallet ID, transaction ID e a descrição detalhada do problema.",
      },
      {
        type: "link-card",
        href: "/support/kb/integrations/configurar-webhooks",
        title: "Configurar Webhooks",
        description:
          "Configure webhooks para receber notificações de aprovação automaticamente",
      },
    ],
  },
];
