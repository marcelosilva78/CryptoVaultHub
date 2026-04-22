import type { Article } from "../components/types";

export const walletsArticles: Article[] = [
  {
    slug: "criar-wallet",
    title: "Criar uma Wallet",
    description:
      "Passo a passo para criar uma nova wallet na plataforma, incluindo seleção de chain e configurações iniciais.",
    category: "wallets",
    icon: "PlusCircle",
    difficulty: "beginner",
    tags: ["wallet", "criar", "nova", "chain"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Criando sua Primeira Wallet",
      },
      {
        type: "paragraph",
        text: "Wallets são o elemento fundamental da plataforma CryptoVaultHub. Cada wallet é do tipo HD (Hierarchical Deterministic) e permite gerar múltiplos endereços de depósito a partir de uma única seed. A criação é simples e pode ser feita pela interface ou pela API.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Wallet por chain",
        text: "Cada wallet está vinculada a uma chain específica (Ethereum, Bitcoin, Polygon, etc.). Para operar em múltiplas chains, você precisará criar uma wallet para cada rede desejada.",
      },
      {
        type: "heading",
        level: 3,
        text: "Criação pela Interface",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar a tela de Wallets",
            description:
              "No menu lateral, clique em 'Wallets'. A tela lista todas as suas wallets ativas com saldos e última atividade.",
          },
          {
            title: "Clicar em 'Nova Wallet'",
            description:
              "No canto superior direito, clique no botão 'Nova Wallet' para abrir o formulário de criação.",
          },
          {
            title: "Selecionar a blockchain",
            description:
              "Escolha a chain onde a wallet será criada. As opções disponíveis dependem do seu projeto e tier de serviço.",
          },
          {
            title: "Definir um label",
            description:
              "Dê um nome descritivo à wallet para fácil identificação. Exemplo: 'ETH Principal', 'BTC Pagamentos', 'MATIC Testes'.",
          },
          {
            title: "Confirmar criação",
            description:
              "Revise as informações e clique em 'Criar'. A wallet será provisionada em segundos e o primeiro endereço de depósito será gerado automaticamente.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Criação via API",
      },
      {
        type: "code",
        language: "bash",
        code: 'curl -X POST https://api.vaulthub.live/v1/wallets \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "chain": "ethereum",\n    "label": "ETH Principal",\n    "project_id": "proj_abc123"\n  }\'',
        filename: "create-wallet.sh",
      },
      {
        type: "paragraph",
        text: "A resposta incluirá o ID da wallet, o primeiro endereço de depósito e metadados como a derivation path utilizada. O endereço já estará pronto para receber fundos.",
      },
      {
        type: "table",
        headers: ["Campo", "Tipo", "Obrigatório", "Descrição"],
        rows: [
          ["chain", "string", "Sim", "Identificador da blockchain (ethereum, bitcoin, polygon, etc.)"],
          ["label", "string", "Sim", "Nome descritivo da wallet"],
          ["project_id", "string", "Sim", "ID do projeto vinculado"],
          ["auto_generate_address", "boolean", "Não", "Gerar endereço de depósito automaticamente (padrão: true)"],
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Organize suas wallets usando labels descritivos e consistentes. Isso facilita a identificação em relatórios e dashboards, especialmente quando você tiver múltiplas wallets na mesma chain.",
      },
      {
        type: "link-card",
        href: "/support/kb/wallets/tipos-wallet",
        title: "Tipos de Wallet",
        description:
          "Entenda as diferenças entre os tipos de wallet disponíveis na plataforma",
      },
    ],
  },
  {
    slug: "tipos-wallet",
    title: "Tipos de Wallet",
    description:
      "Conheça os diferentes tipos de wallet disponíveis e suas características: managed, external e custodial.",
    category: "wallets",
    icon: "Layers",
    difficulty: "intermediate",
    tags: ["wallet", "tipos", "managed", "custodial", "external"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Tipos de Wallet na Plataforma",
      },
      {
        type: "paragraph",
        text: "A plataforma CryptoVaultHub suporta diferentes tipos de wallet para atender a diversos cenários de uso. A escolha do tipo correto depende das suas necessidades de segurança, controle e integração.",
      },
      {
        type: "heading",
        level: 3,
        text: "Comparação de Tipos",
      },
      {
        type: "table",
        headers: ["Característica", "Managed", "Custodial (Co-Sign)", "External Watch-Only"],
        rows: [
          ["Chave privada", "Gerenciada pela plataforma", "Compartilhada (Shamir)", "Não armazenada"],
          ["Envio de transações", "Sim, direto", "Requer aprovação", "Não (somente monitoramento)"],
          ["Gerar endereços", "Sim", "Sim", "Não"],
          ["Ideal para", "Operações rápidas", "Alto valor / compliance", "Monitoramento de carteiras externas"],
          ["Custo", "Incluso no tier", "Incluso no tier", "Incluso no tier"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Managed Wallet",
      },
      {
        type: "paragraph",
        text: "A wallet managed é o tipo padrão. A plataforma gera e gerencia as chaves privadas com criptografia em repouso (AES-256-GCM) e HSM para operações de assinatura. Ideal para operações do dia-a-dia onde velocidade é prioridade.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Segurança das chaves",
        text: "Chaves privadas de wallets managed são encriptadas com uma key derivada do Key Vault e nunca são expostas em texto plano. Todas as operações de assinatura acontecem dentro do HSM.",
      },
      {
        type: "heading",
        level: 3,
        text: "Custodial com Co-Sign",
      },
      {
        type: "paragraph",
        text: "A wallet custodial com co-sign utiliza o esquema Shamir Secret Sharing para dividir a chave privada em shares. Transações requerem a combinação de múltiplos shares (aprovações) antes da assinatura on-chain. Ideal para transações de alto valor e compliance.",
      },
      {
        type: "heading",
        level: 3,
        text: "External Watch-Only",
      },
      {
        type: "paragraph",
        text: "A wallet external permite monitorar saldos e transações de endereços que você controla fora da plataforma. Não é possível enviar transações por este tipo, apenas receber notificações de movimentação.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Você pode converter uma wallet managed para co-sign a qualquer momento, mas a operação inversa não é permitida por motivos de segurança. Planeje o tipo de wallet antes de receber fundos significativos.",
      },
      {
        type: "link-card",
        href: "/support/kb/wallets/gerenciar-enderecos",
        title: "Gerenciar Endereços",
        description:
          "Aprenda a gerar e gerenciar múltiplos endereços de depósito para suas wallets",
      },
    ],
  },
  {
    slug: "gerenciar-enderecos",
    title: "Gerenciar Endereços",
    description:
      "Como gerar novos endereços de depósito, rotular endereços e organizar o recebimento de fundos.",
    category: "wallets",
    icon: "Hash",
    difficulty: "intermediate",
    tags: ["endereços", "depósito", "gerar", "rotular", "BIP-44"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Endereços de Depósito",
      },
      {
        type: "paragraph",
        text: "Cada wallet HD pode gerar virtualmente infinitos endereços de depósito, todos derivados da mesma seed. Usar endereços únicos para cada transação ou cliente melhora a rastreabilidade e privacidade.",
      },
      {
        type: "callout",
        variant: "tip",
        title: "Um endereço por transação",
        text: "Recomendamos gerar um endereço de depósito único para cada pagamento ou cliente. Isso facilita a conciliação automática e evita ambiguidades sobre a origem dos fundos.",
      },
      {
        type: "heading",
        level: 3,
        text: "Gerar Novo Endereço",
      },
      {
        type: "steps",
        items: [
          {
            title: "Selecionar a wallet",
            description:
              "Na lista de wallets, clique na wallet onde deseja gerar um novo endereço.",
          },
          {
            title: "Aba 'Endereços'",
            description:
              "Na página de detalhes da wallet, acesse a aba 'Endereços' para ver todos os endereços existentes e seus saldos.",
          },
          {
            title: "Clicar em 'Novo Endereço'",
            description:
              "Clique no botão para gerar um novo endereço. O sistema derivará o próximo endereço usando o path BIP-44.",
          },
          {
            title: "Rotular o endereço (opcional)",
            description:
              "Adicione um label descritivo como 'Pagamento #4521' ou 'Cliente ABC Ltda'. Labels ajudam na conciliação.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Geração via API",
      },
      {
        type: "code",
        language: "bash",
        code: 'curl -X POST https://api.vaulthub.live/v1/wallets/wal_abc123/addresses \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "label": "Pagamento #4521",\n    "metadata": { "customer_id": "cust_xyz" }\n  }\'',
        filename: "generate-address.sh",
      },
      {
        type: "paragraph",
        text: "A resposta incluirá o endereço gerado, o derivation path completo e o índice do endereço. O endereço estará imediatamente pronto para receber fundos.",
      },
      {
        type: "heading",
        level: 3,
        text: "Limites de Endereços",
      },
      {
        type: "table",
        headers: ["Tier", "Endereços por Wallet", "Gap Limit"],
        rows: [
          ["Standard", "1.000", "20"],
          ["Professional", "10.000", "50"],
          ["Enterprise", "Ilimitado", "100"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Gap Limit",
        text: "O gap limit define quantos endereços consecutivos sem transações podem ser gerados. Se atingir o limite, use endereços existentes ou aguarde transações nos endereços pendentes antes de gerar novos.",
      },
      {
        type: "paragraph",
        text: "Endereços gerados nunca expiram e sempre poderão receber fundos. Porém, para organização, recomendamos arquivar endereços antigos que não são mais utilizados ativamente.",
      },
      {
        type: "link-card",
        href: "/support/kb/wallets/backup-recovery",
        title: "Backup e Recovery",
        description:
          "Saiba como proteger suas wallets com backup e procedimentos de recuperação",
      },
    ],
  },
  {
    slug: "backup-recovery",
    title: "Backup e Recovery",
    description:
      "Procedimentos de backup de wallets e como recuperar o acesso em caso de problemas.",
    category: "wallets",
    icon: "HardDrive",
    difficulty: "advanced",
    tags: ["backup", "recovery", "seed", "restauração", "segurança"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Backup e Recuperação de Wallets",
      },
      {
        type: "paragraph",
        text: "A plataforma CryptoVaultHub implementa múltiplas camadas de backup para garantir que seus ativos nunca sejam perdidos. Além dos backups automáticos gerenciados pela infraestrutura, você pode exportar informações para backup adicional.",
      },
      {
        type: "callout",
        variant: "danger",
        title: "Nunca compartilhe seeds ou chaves privadas",
        text: "A seed phrase e chaves privadas concedem controle total sobre os fundos. Nunca compartilhe essas informações por e-mail, chat, telefone ou qualquer outro meio. A equipe CryptoVaultHub NUNCA pedirá suas chaves.",
      },
      {
        type: "heading",
        level: 3,
        text: "Camadas de Proteção",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Criptografia AES-256-GCM para todas as chaves em repouso",
          "HSM (Hardware Security Module) para operações de assinatura",
          "Backup geográfico redundante em múltiplos data centers",
          "Snapshot diário do Key Vault com retenção de 90 dias",
          "Shamir Secret Sharing para wallets co-sign",
          "Audit trail imutável de todas as operações de chave",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Exportação de Backup",
      },
      {
        type: "paragraph",
        text: "Para wallets managed, você pode solicitar a exportação da extended public key (xpub) para monitoramento externo. A exportação de chaves privadas está disponível apenas para tiers Enterprise e requer aprovação multi-sig do administrador.",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar detalhes da wallet",
            description:
              "Na tela de wallets, clique na wallet que deseja fazer backup.",
          },
          {
            title: "Aba 'Segurança'",
            description:
              "Acesse a aba 'Segurança' e clique em 'Exportar xpub' ou 'Solicitar Backup de Chaves'.",
          },
          {
            title: "Autenticar com 2FA",
            description:
              "Confirme a operação com seu código 2FA. Para exportação de chaves privadas, aprovação adicional do administrador é necessária.",
          },
          {
            title: "Download seguro",
            description:
              "O arquivo de backup é criptografado com uma senha que você define no momento do download. Armazene em local seguro e offline.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Procedimento de Recovery",
      },
      {
        type: "paragraph",
        text: "Em caso de necessidade de recuperação, entre em contato com o suporte administrativo. O processo de recovery envolve verificação de identidade do titular, validação de 2FA e, para wallets co-sign, a recombinação dos shares Shamir autorizados.",
      },
      {
        type: "callout",
        variant: "info",
        text: "O SLA de recovery é de até 4 horas para tiers Enterprise e 24 horas para demais tiers. Durante o processo, os fundos permanecem seguros e inacessíveis até a conclusão.",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "recovery_request": {\n    "wallet_id": "wal_abc123",\n    "reason": "device_lost",\n    "verification": {\n      "identity_verified": true,\n      "backup_2fa_code": "XXXX-XXXX",\n      "admin_approval": "pending"\n    },\n    "status": "processing",\n    "estimated_completion": "2026-04-22T18:00:00Z"\n  }\n}',
        filename: "recovery-request.json",
      },
      {
        type: "link-card",
        href: "/support/kb/wallets/boas-praticas",
        title: "Boas Práticas de Segurança de Wallets",
        description:
          "Recomendações essenciais para manter suas wallets seguras",
      },
    ],
  },
  {
    slug: "boas-praticas",
    title: "Boas Práticas de Segurança de Wallets",
    description:
      "Recomendações de segurança para gerenciar suas wallets e proteger seus ativos digitais.",
    category: "wallets",
    icon: "ShieldCheck",
    difficulty: "beginner",
    tags: ["segurança", "boas práticas", "wallet", "proteção"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Segurança de Wallets — Melhores Práticas",
      },
      {
        type: "paragraph",
        text: "A segurança dos seus ativos digitais depende tanto da infraestrutura da plataforma quanto das suas práticas individuais. Seguir estas recomendações reduz significativamente o risco de perda ou roubo de fundos.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Responsabilidade compartilhada",
        text: "Enquanto a plataforma cuida da segurança da infraestrutura (HSM, criptografia, backups), práticas como manter senhas seguras, proteger 2FA e não compartilhar credenciais são responsabilidade do usuário.",
      },
      {
        type: "heading",
        level: 3,
        text: "Checklist de Segurança",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Ative 2FA com um aplicativo autenticador (nunca use SMS como segundo fator)",
          "Use senhas únicas de no mínimo 12 caracteres para a plataforma",
          "Nunca reutilize a senha do CryptoVaultHub em outros serviços",
          "Armazene códigos de backup 2FA em local seguro e offline",
          "Revise suas sessões ativas regularmente e encerre sessões desconhecidas",
          "Configure notificações de segurança para receber alertas de login",
          "Use wallets co-sign para valores elevados que requerem múltiplas aprovações",
          "Rotacione suas API keys periodicamente (recomendado: a cada 90 dias)",
          "Nunca exponha API keys em código-fonte público ou logs",
          "Utilize IP allowlisting para restringir o acesso à API",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Distribuição de Fundos",
      },
      {
        type: "paragraph",
        text: "Evite concentrar grandes volumes em uma única wallet. Distribua seus ativos conforme o perfil de uso:",
      },
      {
        type: "table",
        headers: ["Finalidade", "Tipo de Wallet", "% Recomendado"],
        rows: [
          ["Operações diárias", "Managed (Hot)", "10-20%"],
          ["Reservas operacionais", "Co-Sign", "30-40%"],
          ["Armazenamento longo prazo", "Co-Sign + Cold", "40-60%"],
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Configure alertas de saldo para receber notificação quando uma wallet managed ultrapassar o limite recomendado. Isso permite transferir o excesso para uma wallet co-sign automaticamente.",
      },
      {
        type: "heading",
        level: 3,
        text: "Sinais de Alerta",
      },
      {
        type: "paragraph",
        text: "Fique atento a atividades suspeitas que podem indicar comprometimento da conta:",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Notificações de login de IPs ou localizações desconhecidas",
          "Transações que você não iniciou aparecendo no histórico",
          "Alterações de configuração que você não realizou",
          "E-mails de redefinição de senha não solicitados",
          "Sessões ativas em dispositivos desconhecidos",
        ],
      },
      {
        type: "paragraph",
        text: "Se identificar qualquer atividade suspeita, altere sua senha imediatamente, revogue todas as API keys e entre em contato com o suporte administrativo.",
      },
      {
        type: "link-card",
        href: "/support/kb/security/ativar-2fa",
        title: "Ativar Autenticação 2FA",
        description:
          "Configure a autenticação de dois fatores para proteção adicional da sua conta",
      },
    ],
  },
];
