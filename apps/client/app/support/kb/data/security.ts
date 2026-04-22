import type { Article } from "../components/types";

export const securityArticles: Article[] = [
  {
    slug: "ativar-2fa",
    title: "Ativar Autenticação 2FA",
    description:
      "Guia completo para ativar a autenticação de dois fatores (2FA) na sua conta usando TOTP.",
    category: "security",
    icon: "Smartphone",
    difficulty: "beginner",
    tags: ["2FA", "autenticação", "TOTP", "segurança"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Autenticação de Dois Fatores (2FA)",
      },
      {
        type: "paragraph",
        text: "A autenticação de dois fatores (2FA) adiciona uma camada extra de segurança à sua conta. Além da senha, você precisará informar um código temporário gerado pelo aplicativo autenticador no seu dispositivo. Isso protege sua conta mesmo que a senha seja comprometida.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "2FA é obrigatório",
        text: "A ativação de 2FA é obrigatória para todas as contas no CryptoVaultHub. Você não poderá acessar funcionalidades como envio de transações, gerenciamento de wallets e configurações sem 2FA ativo.",
      },
      {
        type: "heading",
        level: 3,
        text: "Aplicativos Compatíveis",
      },
      {
        type: "table",
        headers: ["Aplicativo", "Plataforma", "Recomendação"],
        rows: [
          ["Google Authenticator", "Android / iOS", "Simples e confiável"],
          ["Authy", "Android / iOS / Desktop", "Backup na nuvem (recomendado)"],
          ["1Password", "Multiplataforma", "Integrado ao gerenciador de senhas"],
          ["Microsoft Authenticator", "Android / iOS", "Alternativa corporativa"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Ativando 2FA",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar configurações de segurança",
            description:
              "No menu lateral, clique em Settings > Security. A seção '2FA' mostrará o status atual.",
          },
          {
            title: "Iniciar configuração",
            description:
              "Clique em 'Ativar 2FA'. Um QR code será exibido na tela.",
          },
          {
            title: "Escanear QR code",
            description:
              "Abra o aplicativo autenticador no seu celular e escaneie o QR code. Uma nova entrada 'CryptoVaultHub' aparecerá no app.",
          },
          {
            title: "Confirmar código",
            description:
              "Digite o código de 6 dígitos exibido no aplicativo autenticador. O código muda a cada 30 segundos.",
          },
          {
            title: "Salvar códigos de backup",
            description:
              "Anote os 8 códigos de backup exibidos. Esses códigos são sua única forma de recuperação caso perca acesso ao aplicativo autenticador.",
          },
        ],
      },
      {
        type: "callout",
        variant: "danger",
        title: "Guarde os códigos de backup",
        text: "Os códigos de backup são exibidos apenas uma vez. Anote-os em papel e guarde em local seguro e offline. Se perder acesso ao autenticador E aos códigos de backup, o processo de recuperação é complexo e demorado.",
      },
      {
        type: "heading",
        level: 3,
        text: "Quando 2FA é Solicitado",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Login na plataforma (a cada sessão)",
          "Enviar transações acima do limite de auto-aprovação",
          "Aprovar transações co-sign",
          "Criar ou revogar API keys",
          "Alterar configurações de segurança",
          "Exportar dados sensíveis (chaves, relatórios)",
          "Solicitar withdrawals",
        ],
      },
      {
        type: "paragraph",
        text: "O 2FA utiliza o algoritmo TOTP (Time-based One-Time Password) conforme RFC 6238. Os códigos são válidos por 30 segundos com uma tolerância de 1 período (total de 90 segundos de validade efetiva).",
      },
      {
        type: "link-card",
        href: "/support/kb/security/gerenciar-sessoes",
        title: "Gerenciar Sessões Ativas",
        description:
          "Monitore e gerencie as sessões ativas da sua conta",
      },
    ],
  },
  {
    slug: "gerenciar-sessoes",
    title: "Gerenciar Sessões Ativas",
    description:
      "Como visualizar, monitorar e encerrar sessões ativas da sua conta para manter a segurança.",
    category: "security",
    icon: "Monitor",
    difficulty: "beginner",
    tags: ["sessões", "segurança", "login", "dispositivos"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Gerenciamento de Sessões",
      },
      {
        type: "paragraph",
        text: "A tela de sessões ativas permite visualizar todos os dispositivos e navegadores onde sua conta está logada. Isso é fundamental para identificar acessos suspeitos e encerrar sessões que você não reconhece.",
      },
      {
        type: "heading",
        level: 3,
        text: "Informações de Cada Sessão",
      },
      {
        type: "table",
        headers: ["Campo", "Descrição"],
        rows: [
          ["Dispositivo", "Tipo e modelo do dispositivo (Desktop, Mobile, Tablet)"],
          ["Navegador", "Nome e versão do navegador usado"],
          ["IP Address", "Endereço IP de origem da sessão"],
          ["Localização", "País e cidade estimados pelo IP (GeoIP)"],
          ["Último Acesso", "Data e hora da última atividade nesta sessão"],
          ["Status", "Ativa ou Expirada"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Sessão atual",
        text: "A sessão que você está usando no momento é identificada com um badge 'Atual'. Esta sessão não pode ser encerrada pela interface (faça logout normalmente).",
      },
      {
        type: "heading",
        level: 3,
        text: "Encerrar Sessões",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar sessões ativas",
            description:
              "No menu lateral, acesse Settings > Security > Sessões Ativas.",
          },
          {
            title: "Revisar sessões",
            description:
              "Analise a lista de sessões ativas. Verifique se reconhece todos os dispositivos, IPs e localizações.",
          },
          {
            title: "Encerrar sessão suspeita",
            description:
              "Clique em 'Encerrar' ao lado da sessão que deseja invalidar. A sessão será revogada imediatamente.",
          },
          {
            title: "Encerrar todas as sessões",
            description:
              "Para segurança máxima, use 'Encerrar Todas' para revogar todas as sessões exceto a atual.",
          },
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Sessão desconhecida?",
        text: "Se encontrar uma sessão que não reconhece, encerre-a imediatamente. Em seguida, altere sua senha e verifique se sua conta de e-mail não foi comprometida. Ative alertas de login se ainda não estiverem configurados.",
      },
      {
        type: "heading",
        level: 3,
        text: "Políticas de Sessão",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Sessões expiram automaticamente após 24 horas de inatividade",
          "Sessões ativas são limitadas a 5 por conta",
          "Login em novo dispositivo revoga a sessão mais antiga se o limite for atingido",
          "Cada ação sensível (transação, API key) revalida a sessão com 2FA",
        ],
      },
      {
        type: "paragraph",
        text: "O histórico completo de logins é mantido por 90 dias e pode ser consultado na seção de atividade da conta. Use esse histórico para auditar acessos e identificar padrões suspeitos.",
      },
      {
        type: "link-card",
        href: "/support/kb/security/notificacoes-seguranca",
        title: "Notificações de Segurança",
        description:
          "Configure alertas para receber notificações de atividades suspeitas",
      },
    ],
  },
  {
    slug: "notificacoes-seguranca",
    title: "Notificações de Segurança",
    description:
      "Configure alertas de segurança para receber notificações de login, transações suspeitas e alterações na conta.",
    category: "security",
    icon: "Bell",
    difficulty: "beginner",
    tags: ["notificações", "alertas", "segurança", "login"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Alertas de Segurança",
      },
      {
        type: "paragraph",
        text: "As notificações de segurança mantêm você informado sobre atividades importantes na sua conta. Configurar alertas adequados permite detectar rapidamente acessos não autorizados ou operações suspeitas.",
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Alertas",
      },
      {
        type: "table",
        headers: ["Alerta", "Trigger", "Canal Padrão"],
        rows: [
          ["Novo login", "Login de IP ou dispositivo novo", "E-mail + Push"],
          ["Login falhado", "3+ tentativas de login falhadas", "E-mail"],
          ["Transação de alto valor", "Transação acima do threshold configurado", "E-mail + Webhook"],
          ["API key criada", "Nova API key gerada", "E-mail"],
          ["Senha alterada", "Alteração de senha bem-sucedida", "E-mail"],
          ["2FA desabilitado", "Desativação de 2FA (quando permitido)", "E-mail + SMS"],
          ["Sessão suspeita", "Login de localização geográfica incomum", "E-mail + Push"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Alertas obrigatórios",
        text: "Alguns alertas como 'Novo login', 'Senha alterada' e 'API key criada' são obrigatórios e não podem ser desabilitados. Isso garante que você sempre saiba sobre alterações críticas na conta.",
      },
      {
        type: "heading",
        level: 3,
        text: "Configurar Alertas",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar configurações de notificações",
            description:
              "No menu lateral, acesse Settings > Notifications > Segurança.",
          },
          {
            title: "Revisar canais de notificação",
            description:
              "Verifique se seu e-mail está correto e, opcionalmente, configure notificações push e webhook.",
          },
          {
            title: "Personalizar thresholds",
            description:
              "Defina o valor mínimo para alertas de transação (ex: alertar para transações acima de $1.000).",
          },
          {
            title: "Testar notificações",
            description:
              "Use o botão 'Enviar Teste' para verificar que as notificações estão chegando corretamente em todos os canais.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Exemplo de Alerta por Webhook",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "event": "security.new_login",\n  "data": {\n    "user_id": "usr_abc123",\n    "ip": "203.0.113.42",\n    "location": {\n      "country": "BR",\n      "city": "São Paulo"\n    },\n    "device": "Chrome 120 / macOS",\n    "timestamp": "2026-04-22T15:30:00Z",\n    "risk_level": "low"\n  }\n}',
        filename: "security-alert-webhook.json",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Integre os alertas de segurança com o canal de comunicação da sua equipe (Slack, Teams, Discord) via webhook para visibilidade compartilhada de eventos críticos.",
      },
      {
        type: "paragraph",
        text: "O histórico de alertas é mantido por 90 dias. Consulte a aba 'Histórico de Alertas' para revisar todos os eventos de segurança disparados para sua conta.",
      },
      {
        type: "link-card",
        href: "/support/kb/security/boas-praticas-seguranca",
        title: "Boas Práticas de Segurança",
        description:
          "Recomendações essenciais para manter sua conta e operações seguras",
      },
    ],
  },
  {
    slug: "boas-praticas-seguranca",
    title: "Boas Práticas de Segurança",
    description:
      "Recomendações completas de segurança para proteger sua conta, wallets e integrações na plataforma.",
    category: "security",
    icon: "ShieldCheck",
    difficulty: "beginner",
    tags: ["segurança", "boas práticas", "proteção", "recomendações"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Guia de Boas Práticas de Segurança",
      },
      {
        type: "paragraph",
        text: "A segurança na plataforma CryptoVaultHub é uma responsabilidade compartilhada. A plataforma fornece infraestrutura de segurança robusta (HSM, criptografia, rate limiting), mas a segurança da sua conta depende também das suas práticas. Este guia consolida as recomendações essenciais.",
      },
      {
        type: "heading",
        level: 3,
        text: "Conta e Acesso",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Use uma senha única de 12+ caracteres gerada por um gerenciador de senhas",
          "Mantenha 2FA ativo e use um aplicativo autenticador (nunca SMS)",
          "Armazene códigos de backup 2FA em local seguro e offline",
          "Nunca compartilhe suas credenciais com outras pessoas",
          "Revise sessões ativas semanalmente e encerre as desconhecidas",
          "Configure alertas de segurança para login e operações sensíveis",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "API e Integrações",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Rotacione API keys a cada 90 dias",
          "Use IP allowlist para restringir acesso por API key",
          "Nunca exponha API keys em código-fonte, logs ou repositórios públicos",
          "Use variáveis de ambiente ou secret managers para armazenar keys",
          "Valide assinaturas HMAC em todos os webhooks recebidos",
          "Implemente idempotency keys em todas as operações de escrita",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Wallets e Transações",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Use co-sign para wallets com saldo significativo",
          "Distribua fundos entre wallets managed (operacional) e co-sign (reserva)",
          "Configure políticas de auto-aprovação com valores conservadores",
          "Use whitelist de endereços para destinos frequentes",
          "Verifique endereço e rede antes de cada envio",
          "Mantenha logs de todas as operações para auditoria",
        ],
      },
      {
        type: "callout",
        variant: "danger",
        title: "Sinais de phishing",
        text: "A equipe CryptoVaultHub NUNCA pedirá sua senha, 2FA, API keys ou seed phrases por e-mail, chat ou telefone. Se receber qualquer solicitação desse tipo, é uma tentativa de phishing. Reporte imediatamente.",
      },
      {
        type: "heading",
        level: 3,
        text: "Checklist Mensal de Segurança",
      },
      {
        type: "table",
        headers: ["Item", "Frequência", "Prioridade"],
        rows: [
          ["Revisar sessões ativas", "Semanal", "Alta"],
          ["Verificar alertas de login", "Semanal", "Alta"],
          ["Rotacionar API keys", "Trimestral", "Alta"],
          ["Revisar permissões de API keys", "Mensal", "Média"],
          ["Verificar signatários co-sign", "Mensal", "Média"],
          ["Atualizar whitelist de endereços", "Mensal", "Média"],
          ["Revisar políticas de aprovação", "Trimestral", "Média"],
          ["Testar procedimento de recovery", "Semestral", "Baixa"],
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Agende um lembrete mensal para executar este checklist. A prevenção é sempre mais eficiente e menos custosa do que remediar um incidente de segurança.",
      },
      {
        type: "link-card",
        href: "/support/kb/security/recuperacao-acesso",
        title: "Recuperação de Acesso",
        description:
          "Saiba o que fazer se perder acesso à sua conta",
      },
    ],
  },
  {
    slug: "recuperacao-acesso",
    title: "Recuperação de Acesso",
    description:
      "Procedimentos para recuperar acesso à sua conta em caso de perda de senha, dispositivo 2FA ou comprometimento.",
    category: "security",
    icon: "KeyRound",
    difficulty: "intermediate",
    tags: ["recuperação", "acesso", "senha", "2FA", "emergência"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Recuperação de Acesso à Conta",
      },
      {
        type: "paragraph",
        text: "Se você perdeu acesso à sua conta, este guia apresenta os procedimentos de recuperação para diferentes cenários. A velocidade de recuperação depende do tipo de problema e do nível de verificação necessário.",
      },
      {
        type: "heading",
        level: 3,
        text: "Cenários de Recuperação",
      },
      {
        type: "table",
        headers: ["Cenário", "Complexidade", "Tempo Estimado"],
        rows: [
          ["Senha esquecida (2FA ativo)", "Baixa", "5-10 minutos"],
          ["Dispositivo 2FA perdido (com backup codes)", "Baixa", "10-15 minutos"],
          ["Dispositivo 2FA perdido (sem backup codes)", "Alta", "24-72 horas"],
          ["Conta comprometida", "Alta", "2-48 horas"],
          ["E-mail comprometido", "Muito alta", "48-72 horas"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Senha Esquecida",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar tela de login",
            description:
              "Na tela de login, clique em 'Esqueci minha senha'.",
          },
          {
            title: "Informar e-mail",
            description:
              "Digite o e-mail associado à sua conta. Um link de redefinição será enviado.",
          },
          {
            title: "Abrir link de redefinição",
            description:
              "Acesse o link recebido por e-mail (válido por 1 hora). Defina uma nova senha respeitando os requisitos de complexidade.",
          },
          {
            title: "Confirmar com 2FA",
            description:
              "Após definir a nova senha, confirme com seu código 2FA para finalizar a redefinição.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Dispositivo 2FA Perdido",
      },
      {
        type: "paragraph",
        text: "Se você perdeu acesso ao aplicativo autenticador mas possui os códigos de backup, use um deles para fazer login e reconfigurar o 2FA com um novo dispositivo.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Sem códigos de backup",
        text: "Se perdeu o dispositivo 2FA E não possui códigos de backup, será necessário passar por verificação de identidade com o suporte administrativo. O processo pode levar até 72 horas úteis e requer documentação comprobatória.",
      },
      {
        type: "heading",
        level: 3,
        text: "Conta Comprometida",
      },
      {
        type: "paragraph",
        text: "Se suspeita que sua conta foi comprometida (transações não autorizadas, alterações que não reconhece), siga estes passos imediatamente:",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Altere sua senha imediatamente (se ainda tiver acesso)",
          "Revogue todas as API keys",
          "Encerre todas as sessões ativas",
          "Reconfigure 2FA com um novo secret",
          "Revise o histórico de transações e operações",
          "Entre em contato com o administrador relatando o incidente",
          "Documente tudo: horários, IPs, operações suspeitas",
        ],
      },
      {
        type: "callout",
        variant: "danger",
        title: "Ação imediata",
        text: "Em caso de comprometimento confirmado, o administrador pode congelar sua conta preventivamente para impedir novas operações enquanto a investigação é conduzida. Fundos serão preservados durante o congelamento.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Revogar todas as API keys de emergência\ncurl -X POST https://api.vaulthub.live/v1/api-keys/revoke-all \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "reason": "security_incident",\n    "keep_current": false\n  }\'\n\n# Encerrar todas as sessões\ncurl -X POST https://api.vaulthub.live/v1/sessions/terminate-all \\\n  -H "Authorization: Bearer $API_KEY"',
        filename: "emergency-recovery.sh",
      },
      {
        type: "paragraph",
        text: "Após a recuperação, revise todas as boas práticas de segurança e implemente medidas adicionais como IP allowlist e alertas de login para prevenir futuros incidentes.",
      },
      {
        type: "link-card",
        href: "/support/kb/getting-started/primeiro-acesso",
        title: "Primeiro Acesso ao Portal",
        description:
          "Revise o processo de configuração inicial para garantir que sua conta está devidamente protegida",
      },
    ],
  },
];
