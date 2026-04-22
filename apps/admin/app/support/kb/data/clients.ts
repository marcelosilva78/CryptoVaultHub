import type { Article } from "../components/types";

export const clientsArticles: Article[] = [
  {
    slug: "visao-geral",
    title: "Visão Geral do Gerenciamento de Clientes",
    description:
      "Entenda como funciona o módulo de gerenciamento de clientes, recursos disponíveis e fluxo de operações.",
    category: "clients",
    icon: "Users",
    difficulty: "beginner",
    tags: ["clientes", "gerenciamento", "visão geral"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "O que é o Gerenciamento de Clientes?",
      },
      {
        type: "paragraph",
        text: "O módulo de Client Management é o centro de controle para todas as operações relacionadas a clientes na plataforma CryptoVaultHub. Cada cliente representa uma entidade — seja pessoa física ou jurídica — que possui carteiras de custódia, limites de operação e políticas de compliance vinculadas.",
      },
      {
        type: "paragraph",
        text: "A partir deste módulo, o administrador pode criar novos clientes, atribuir tiers de serviço, monitorar atividades e realizar ações como impersonation para suporte técnico. Todas as ações ficam registradas no Audit Log com rastreabilidade completa.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Multi-tenancy",
        text: "Cada cliente possui seu próprio conjunto isolado de wallets, chaves e configurações. Não há compartilhamento de dados entre clientes, garantindo segregação total conforme exigências regulatórias.",
      },
      {
        type: "heading",
        level: 3,
        text: "Funcionalidades Principais",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Criar e editar informações de clientes (nome, e-mail, documentos)",
          "Atribuir e alterar tiers de serviço com limites específicos",
          "Ativar e desativar clientes sem perder dados históricos",
          "Impersonation segura para depuração e suporte",
          "Visualizar todas as wallets e transações de um cliente",
          "Exportar relatórios de atividade por cliente",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Arquitetura do Módulo",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Admin Panel] --> B[Client Service]\n  B --> C[Client DB]\n  B --> D[Tier Service]\n  B --> E[Wallet Service]\n  B --> F[Compliance Service]\n  D --> G[Limites & Rate Limits]\n  E --> H[HD Wallets]\n  F --> I[KYC/AML Status]",
      },
      {
        type: "paragraph",
        text: "O Client Service é o ponto central que orquestra a comunicação entre os demais serviços. Quando um cliente é criado, automaticamente são provisionadas suas wallets iniciais, vinculado o tier padrão e iniciado o processo de KYC conforme as políticas configuradas.",
      },
      {
        type: "heading",
        level: 3,
        text: "Status de um Cliente",
      },
      {
        type: "table",
        headers: ["Status", "Descrição", "Pode Operar?"],
        rows: [
          ["Active", "Cliente ativo com KYC aprovado", "Sim"],
          ["Pending KYC", "Aguardando verificação de identidade", "Limitado"],
          ["Suspended", "Suspenso por violação ou investigação", "Não"],
          ["Inactive", "Desativado pelo administrador", "Não"],
          ["Archived", "Dados retidos mas conta encerrada", "Não"],
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Utilize os filtros na listagem de clientes para encontrar rapidamente clientes por status, tier ou data de criação. Combine múltiplos filtros para resultados mais precisos.",
      },
      {
        type: "paragraph",
        text: "Para começar a gerenciar seus clientes, acesse o menu lateral Admin Panel > Client Management. A tela principal exibe uma tabela paginada com busca em tempo real e exportação disponível em CSV e JSON.",
      },
      {
        type: "link-card",
        href: "/support/kb/tiers/visao-geral",
        title: "Visão Geral de Planos e Tiers",
        description:
          "Entenda como os tiers afetam os limites e funcionalidades dos clientes",
      },
    ],
  },
  {
    slug: "criar-cliente",
    title: "Criar Novo Cliente",
    description:
      "Passo a passo completo para cadastrar um novo cliente na plataforma de custódia.",
    category: "clients",
    icon: "UserPlus",
    difficulty: "beginner",
    tags: ["clientes", "cadastro", "criar", "onboarding"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Cadastro de Novo Cliente",
      },
      {
        type: "paragraph",
        text: "O cadastro de um novo cliente é o primeiro passo do processo de onboarding na plataforma CryptoVaultHub. Durante o cadastro, são coletadas informações essenciais como dados de identificação, tipo de entidade e tier de serviço inicial.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Dados obrigatórios",
        text: "Todos os campos marcados com asterisco (*) são obrigatórios. O cadastro não poderá ser concluído sem o preenchimento completo, incluindo documentação válida para o processo de KYC.",
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
            title: "Acessar o módulo de clientes",
            description:
              'Navegue até Admin Panel > Client Management e clique no botão "Novo Cliente" no canto superior direito.',
          },
          {
            title: "Preencher dados básicos",
            description:
              "Informe o nome completo ou razão social, e-mail principal, telefone e tipo de entidade (PF ou PJ). Para PJ, também é necessário informar o CNPJ e representante legal.",
          },
          {
            title: "Selecionar tier inicial",
            description:
              "Escolha o tier de serviço que será vinculado ao cliente. O tier define limites de transação, número de wallets e rate limits de API. Pode ser alterado posteriormente.",
          },
          {
            title: "Configurar wallets iniciais",
            description:
              "Selecione quais chains serão habilitadas para o cliente. Uma wallet HD será criada automaticamente para cada chain selecionada.",
          },
          {
            title: "Revisar e confirmar",
            description:
              "Revise todos os dados na tela de resumo. Após confirmar, o cliente será criado com status 'Pending KYC' e o fluxo de verificação será iniciado automaticamente.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Criação via API",
      },
      {
        type: "paragraph",
        text: "Clientes também podem ser criados programaticamente via API REST. Útil para integrações com sistemas externos ou migrações em lote.",
      },
      {
        type: "code",
        language: "bash",
        code: 'curl -X POST https://api.vaulthub.live/v1/admin/clients \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "name": "Empresa Exemplo Ltda",\n    "email": "contato@exemplo.com.br",\n    "entity_type": "PJ",\n    "document": "12.345.678/0001-90",\n    "tier_id": "tier_standard",\n    "enabled_chains": ["ethereum", "bitcoin", "polygon"]\n  }\'',
        filename: "create-client.sh",
      },
      {
        type: "paragraph",
        text: "A resposta incluirá o ID do cliente, as wallets criadas e o link para acompanhar o progresso do KYC. O webhook de onboarding será disparado automaticamente se configurado.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Para criar múltiplos clientes de uma vez, utilize o endpoint de batch creation POST /v1/admin/clients/batch com um array de até 50 clientes por requisição.",
      },
      {
        type: "table",
        headers: ["Campo", "Tipo", "Obrigatório", "Descrição"],
        rows: [
          ["name", "string", "Sim", "Nome completo ou razão social"],
          ["email", "string", "Sim", "E-mail principal do cliente"],
          ["entity_type", "enum", "Sim", "PF (pessoa física) ou PJ (pessoa jurídica)"],
          ["document", "string", "Sim", "CPF ou CNPJ formatado"],
          ["tier_id", "string", "Sim", "ID do tier de serviço"],
          ["enabled_chains", "string[]", "Não", "Chains para criação de wallets iniciais"],
          ["metadata", "object", "Não", "Campos customizados em formato chave-valor"],
        ],
      },
      {
        type: "link-card",
        href: "/support/kb/compliance/regras-kyc-aml",
        title: "Regras KYC e AML",
        description:
          "Saiba como funciona o processo de verificação de identidade após o cadastro",
      },
    ],
  },
  {
    slug: "editar-tiers",
    title: "Editar Tiers de Cliente",
    description:
      "Como alterar o tier de serviço de um cliente e quais impactos essa mudança gera.",
    category: "clients",
    icon: "ArrowUpDown",
    difficulty: "intermediate",
    tags: ["clientes", "tiers", "upgrade", "downgrade"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Alterando o Tier de um Cliente",
      },
      {
        type: "paragraph",
        text: "O tier de serviço de um cliente define seus limites operacionais, incluindo valores máximos de transação, quantidade de wallets permitidas, rate limits de API e funcionalidades de compliance habilitadas. Alterar o tier é uma operação comum e pode ser feita a qualquer momento.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Impacto imediato",
        text: "A alteração de tier entra em vigor imediatamente. Se um cliente estiver sendo rebaixado (downgrade), transações em andamento que excedam os novos limites NÃO serão canceladas, mas novas transações respeitarão os limites do novo tier.",
      },
      {
        type: "heading",
        level: 3,
        text: "Como Alterar o Tier",
      },
      {
        type: "steps",
        items: [
          {
            title: "Localizar o cliente",
            description:
              "Acesse Client Management e busque o cliente pelo nome, e-mail ou ID.",
          },
          {
            title: "Abrir detalhes do cliente",
            description:
              "Clique no cliente para abrir a página de detalhes. Na seção 'Tier & Limites', clique em 'Alterar Tier'.",
          },
          {
            title: "Selecionar novo tier",
            description:
              "Uma modal exibirá todos os tiers disponíveis com comparação lado a lado dos limites. Selecione o tier desejado.",
          },
          {
            title: "Confirmar alteração",
            description:
              "Revise o resumo de mudanças e confirme. O sistema registrará a alteração no Audit Log com o motivo opcional informado.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Comparação de Impactos",
      },
      {
        type: "table",
        headers: ["Aspecto", "Upgrade", "Downgrade"],
        rows: [
          ["Limites de transação", "Aumentam imediatamente", "Reduzem imediatamente"],
          ["Rate limits", "Aumentam imediatamente", "Reduzem no próximo ciclo"],
          ["Wallets existentes", "Mantidas", "Mantidas (mas não pode criar novas se exceder)"],
          ["Funcionalidades", "Novas features habilitadas", "Features removidas após período de grace"],
          ["Billing", "Pró-rata cobrado", "Crédito gerado"],
        ],
      },
      {
        type: "paragraph",
        text: "Todas as alterações de tier são registradas no histórico do cliente com timestamp, administrador responsável e motivo informado. Esses registros são imutáveis e fazem parte do Audit Log.",
      },
      {
        type: "code",
        language: "typescript",
        code: '// Exemplo: Alterar tier via API\nconst response = await fetch(\n  `https://api.vaulthub.live/v1/admin/clients/${clientId}/tier`,\n  {\n    method: "PATCH",\n    headers: {\n      Authorization: `Bearer ${adminToken}`,\n      "Content-Type": "application/json",\n    },\n    body: JSON.stringify({\n      tier_id: "tier_enterprise",\n      reason: "Upgrade solicitado pelo cliente após aumento de volume",\n    }),\n  }\n);',
        filename: "change-tier.ts",
      },
      {
        type: "callout",
        variant: "info",
        text: "O histórico de alterações de tier é exibido na aba 'Timeline' do cliente, permitindo visualizar toda a evolução do relacionamento.",
      },
      {
        type: "link-card",
        href: "/support/kb/tiers/upgrade-downgrade",
        title: "Upgrade e Downgrade de Cliente",
        description:
          "Detalhes completos sobre o processo de upgrade e downgrade de tiers",
      },
    ],
  },
  {
    slug: "impersonation",
    title: "Impersonation (Debug como Cliente)",
    description:
      "Como usar a funcionalidade de impersonation para depurar problemas vendo a plataforma como o cliente vê.",
    category: "clients",
    icon: "Eye",
    difficulty: "advanced",
    tags: ["clientes", "impersonation", "debug", "suporte"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "O que é Impersonation?",
      },
      {
        type: "paragraph",
        text: "A funcionalidade de Impersonation permite que um administrador visualize a plataforma exatamente como um cliente específico a vê. Isso é essencial para diagnosticar problemas relatados, verificar configurações e validar que as permissões estão corretas sem precisar solicitar credenciais ao cliente.",
      },
      {
        type: "callout",
        variant: "danger",
        title: "Uso restrito e auditado",
        text: "Toda sessão de impersonation é registrada no Audit Log com timestamp de início/fim, IP do administrador e todas as ações realizadas. O uso indevido pode resultar em revogação de acesso. Apenas administradores com a permissão 'admin.impersonate' podem utilizar essa funcionalidade.",
      },
      {
        type: "heading",
        level: 3,
        text: "Iniciando uma Sessão de Impersonation",
      },
      {
        type: "steps",
        items: [
          {
            title: "Localizar o cliente",
            description:
              "Acesse Client Management e encontre o cliente que deseja impersonar.",
          },
          {
            title: "Iniciar impersonation",
            description:
              "Na página de detalhes do cliente, clique no botão 'Impersonate' (ícone de olho). Uma confirmação será solicitada.",
          },
          {
            title: "Informar motivo",
            description:
              "Preencha o motivo da impersonation (campo obrigatório). Ex: 'Ticket #4521 - cliente reporta erro ao visualizar saldo ETH'.",
          },
          {
            title: "Navegar como cliente",
            description:
              "Um banner laranja no topo da tela indicará que você está em modo impersonation. Navegue normalmente para diagnosticar o problema.",
          },
          {
            title: "Encerrar sessão",
            description:
              "Clique em 'Encerrar Impersonation' no banner ou aguarde o timeout automático de 30 minutos.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Restrições de Segurança",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Não é possível realizar transações financeiras durante impersonation",
          "Não é possível alterar senhas ou configurações de segurança do cliente",
          "Não é possível exportar chaves privadas ou seeds",
          "A sessão expira automaticamente após 30 minutos",
          "Máximo de 3 sessões simultâneas de impersonation por administrador",
          "O cliente recebe notificação de que uma sessão de suporte foi iniciada",
        ],
      },
      {
        type: "paragraph",
        text: "Durante a impersonation, o sistema gera um token JWT temporário com permissões read-only vinculado ao cliente alvo. Esse token possui claims especiais que identificam a sessão como impersonation, garantindo que nenhuma operação de escrita crítica seja permitida.",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "sub": "admin_a1b2c3",\n  "impersonate": "client_x9y8z7",\n  "permissions": ["read:wallets", "read:transactions", "read:settings"],\n  "reason": "Ticket #4521 - erro saldo ETH",\n  "exp": 1745352000,\n  "iat": 1745350200,\n  "session_id": "imp_sess_abc123"\n}',
        filename: "impersonation-jwt-claims.json",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use a aba 'Console' durante impersonation para executar queries de diagnóstico rápidas, como verificar saldos, listar transações recentes ou checar status de webhooks.",
      },
      {
        type: "quote",
        text: "Impersonation é a ferramenta mais poderosa de suporte ao cliente. Use com responsabilidade — cada sessão é uma questão de confiança entre a plataforma e o cliente.",
        author: "Guia de Segurança CryptoVaultHub",
      },
      {
        type: "link-card",
        href: "/support/kb/exports/audit-log",
        title: "Audit Log",
        description:
          "Veja como todas as ações de impersonation são registradas no log de auditoria",
      },
    ],
  },
  {
    slug: "desativar-reativar",
    title: "Desativar e Reativar Cliente",
    description:
      "Procedimento para desativar um cliente preservando seus dados e como reativá-lo quando necessário.",
    category: "clients",
    icon: "ToggleLeft",
    difficulty: "intermediate",
    tags: ["clientes", "desativar", "reativar", "suspender"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Desativação e Reativação de Clientes",
      },
      {
        type: "paragraph",
        text: "A desativação de um cliente é uma operação reversível que suspende todas as operações do cliente sem apagar seus dados. Isso é utilizado em cenários como inadimplência, solicitação do próprio cliente, investigação de compliance ou encerramento temporário de atividades.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Impacto nas operações",
        text: "Ao desativar um cliente, todas as transações pendentes serão pausadas (não canceladas). Webhooks continuarão sendo recebidos mas ficarão em fila para processamento posterior. APIs do cliente retornarão HTTP 403.",
      },
      {
        type: "heading",
        level: 3,
        text: "Processo de Desativação",
      },
      {
        type: "steps",
        items: [
          {
            title: "Verificar transações pendentes",
            description:
              "Antes de desativar, verifique se há transações em andamento. Transações on-chain já submetidas não podem ser revertidas.",
          },
          {
            title: "Selecionar motivo da desativação",
            description:
              "Escolha entre os motivos pré-definidos: Inadimplência, Solicitação do Cliente, Compliance, Fraude Suspeita ou Outro (com campo de texto livre).",
          },
          {
            title: "Definir política de retenção",
            description:
              "Configure se os fundos custodiados devem ser congelados ou se o cliente terá um período de grace para realizar saques.",
          },
          {
            title: "Confirmar desativação",
            description:
              "A confirmação requer autenticação de dois fatores do administrador. O cliente receberá notificação por e-mail.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "O que acontece na desativação",
      },
      {
        type: "table",
        headers: ["Recurso", "Comportamento"],
        rows: [
          ["API Access", "Retorna 403 Forbidden para todas as chamadas"],
          ["Wallets", "Fundos preservados, novas transações bloqueadas"],
          ["Webhooks", "Recebidos e enfileirados, não processados"],
          ["Dashboard", "Acesso bloqueado com mensagem informativa"],
          ["Dados históricos", "100% preservados e acessíveis via Admin"],
          ["Billing", "Cobrança pausada a partir do próximo ciclo"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Reativação",
      },
      {
        type: "paragraph",
        text: "A reativação restaura completamente o acesso do cliente. Transações pausadas são retomadas automaticamente e webhooks enfileirados são processados na ordem correta. O processo é similar à desativação, requerendo 2FA do administrador e registro do motivo.",
      },
      {
        type: "callout",
        variant: "info",
        text: "Após a reativação, o sistema executa uma reconciliação automática de saldos para garantir que todos os valores estejam corretos, especialmente se houve movimentações on-chain durante o período de inatividade.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Desativar cliente via API\ncurl -X POST https://api.vaulthub.live/v1/admin/clients/client_x9y8z7/deactivate \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" \\\n  -H "X-2FA-Code: 123456" \\\n  -d \'{"reason": "compliance_investigation", "grace_period_hours": 48}\'\n\n# Reativar cliente via API\ncurl -X POST https://api.vaulthub.live/v1/admin/clients/client_x9y8z7/reactivate \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" \\\n  -H "X-2FA-Code: 654321" \\\n  -d \'{"reason": "investigation_cleared", "reconcile": true}\'',
        filename: "deactivate-reactivate.sh",
      },
      {
        type: "link-card",
        href: "/support/kb/compliance/alertas",
        title: "Alertas de Compliance",
        description:
          "Saiba como os alertas de compliance podem acionar desativação automática de clientes",
      },
    ],
  },
];
