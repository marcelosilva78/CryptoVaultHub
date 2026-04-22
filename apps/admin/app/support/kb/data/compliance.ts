import type { Article } from "../components/types";

export const complianceArticles: Article[] = [
  {
    slug: "regras-kyc-aml",
    title: "Regras KYC e AML",
    description:
      "Visão completa das regras de Know Your Customer e Anti-Money Laundering aplicadas na plataforma.",
    category: "compliance",
    icon: "ShieldAlert",
    difficulty: "intermediate",
    tags: ["KYC", "AML", "compliance", "regulamentação"],
    updatedAt: "22 Abr 2026",
    readingTime: 7,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "KYC e AML no CryptoVaultHub",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub implementa um framework robusto de KYC (Know Your Customer) e AML (Anti-Money Laundering) em conformidade com regulamentações internacionais incluindo FATF Travel Rule, 5AMLD da União Europeia e normas do COAF brasileiro. Todas as verificações são obrigatórias e aplicadas automaticamente durante o onboarding de clientes.",
      },
      {
        type: "callout",
        variant: "danger",
        title: "Obrigação legal",
        text: "A desativação ou bypass de regras KYC/AML é estritamente proibida e pode resultar em sanções regulatórias. Todas as exceções devem ser documentadas e aprovadas pelo compliance officer.",
      },
      {
        type: "heading",
        level: 3,
        text: "Níveis de Verificação KYC",
      },
      {
        type: "table",
        headers: ["Nível", "Documentos", "Limites", "Tempo de Aprovação"],
        rows: [
          ["Básico", "Documento de identidade + selfie", "Até $10,000/mês", "Automático (< 5min)"],
          ["Intermediário", "Básico + comprovante de endereço", "Até $100,000/mês", "Até 24h"],
          ["Avançado", "Intermediário + origem dos fundos", "Até $1,000,000/mês", "Até 72h"],
          ["Institucional", "Avançado + documentação societária", "Sem limite", "Até 5 dias úteis"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Fluxo de Verificação",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Cliente envia documentos] --> B[Verificação Automática]\n  B --> C{Score de confiança}\n  C -->|> 90%| D[Aprovado automaticamente]\n  C -->|60-90%| E[Revisão manual]\n  C -->|< 60%| F[Documentos adicionais solicitados]\n  E --> G{Analista decide}\n  G -->|Aprovado| D\n  G -->|Rejeitado| H[Conta bloqueada]\n  F --> A\n  D --> I[KYC aprovado - cliente ativo]",
      },
      {
        type: "heading",
        level: 3,
        text: "Regras AML",
      },
      {
        type: "paragraph",
        text: "O módulo AML analisa continuamente todas as transações em busca de padrões suspeitos. As regras incluem detecção de structuring (fracionamento para evitar limites), chain hopping (movimentação entre chains para ofuscar origem), e comparação com listas de sanções internacionais (OFAC, UN, EU).",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Monitoramento contínuo de todas as transações em tempo real",
          "Screening contra listas de sanções atualizadas diariamente",
          "Detecção de padrões de structuring com ML",
          "Análise de cluster de endereços (taint analysis)",
          "Verificação de origem de fundos para depósitos acima de threshold",
          "Relatórios automáticos de atividade suspeita (SAR/STR)",
        ],
      },
      {
        type: "callout",
        variant: "info",
        text: "A integração com provedores de blockchain analytics (Chainalysis, Elliptic) permite verificar se endereços de origem ou destino estão associados a atividades ilícitas como ransomware, darknet markets ou carteiras sancionadas.",
      },
      {
        type: "quote",
        text: "Compliance não é um custo — é a fundação sobre a qual se constrói confiança institucional. Cada verificação é um investimento na longevidade da plataforma.",
        author: "Manual de Compliance CryptoVaultHub",
      },
      {
        type: "link-card",
        href: "/support/kb/compliance/configurar-politicas",
        title: "Configurar Políticas de Compliance",
        description:
          "Saiba como ajustar thresholds, regras AML e políticas de verificação",
      },
    ],
  },
  {
    slug: "configurar-politicas",
    title: "Configurar Políticas de Compliance",
    description:
      "Como definir e ajustar políticas de compliance, thresholds e regras de verificação.",
    category: "compliance",
    icon: "Settings",
    difficulty: "advanced",
    tags: ["políticas", "configuração", "thresholds", "compliance"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Políticas de Compliance Configuráveis",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub permite configurar políticas de compliance granulares que se aplicam globalmente ou por tier de cliente. Cada política define regras de verificação, thresholds de alerta e ações automáticas que o sistema executará quando condições específicas forem detectadas.",
      },
      {
        type: "heading",
        level: 3,
        text: "Categorias de Políticas",
      },
      {
        type: "table",
        headers: ["Categoria", "Exemplos de Regras", "Ação Padrão"],
        rows: [
          ["Transaction Screening", "Valor acima de threshold, endereço sancionado", "Bloquear + Alertar"],
          ["Velocity Controls", "Volume acumulado excede limites", "Pausar + Revisar"],
          ["Pattern Detection", "Structuring, round-trip transactions", "Alertar + Investigar"],
          ["Sanctions", "Match em lista OFAC/UN/EU", "Bloquear imediatamente"],
          ["Risk Scoring", "Score de risco do cliente acima de threshold", "Aumentar monitoramento"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Alterações auditadas",
        text: "Todas as alterações em políticas de compliance são registradas no Audit Log com o administrador responsável, valores anteriores e novos. Mudanças em políticas críticas requerem aprovação de dois administradores.",
      },
      {
        type: "heading",
        level: 3,
        text: "Configuração de Thresholds",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "policy_id": "tx_screening_v2",\n  "name": "Transaction Screening - Padrão",\n  "rules": [\n    {\n      "id": "large_transaction",\n      "condition": "transaction.value_usd > threshold",\n      "threshold": 50000,\n      "action": "flag_for_review",\n      "severity": "medium"\n    },\n    {\n      "id": "sanctioned_address",\n      "condition": "address IN sanctions_list",\n      "action": "block_and_alert",\n      "severity": "critical"\n    },\n    {\n      "id": "high_risk_jurisdiction",\n      "condition": "client.country IN high_risk_countries",\n      "threshold": 10000,\n      "action": "enhanced_due_diligence",\n      "severity": "high"\n    }\n  ],\n  "applies_to": ["*"],\n  "override_tiers": ["tier_enterprise"]\n}',
        filename: "compliance-policy.json",
      },
      {
        type: "heading",
        level: 3,
        text: "Ações Automáticas Disponíveis",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "flag_for_review: Marca a transação para revisão manual mas permite execução",
          "block_and_alert: Bloqueia a transação e notifica a equipe de compliance",
          "enhanced_due_diligence: Solicita documentação adicional ao cliente",
          "suspend_account: Suspende a conta do cliente até investigação",
          "report_to_authority: Gera relatório automático para órgão regulador",
          "notify_compliance_officer: Envia notificação direta ao compliance officer de plantão",
        ],
      },
      {
        type: "paragraph",
        text: "As políticas podem ser testadas em modo 'shadow' antes de serem ativadas. No modo shadow, as regras são avaliadas e os resultados registrados, mas nenhuma ação é executada. Isso permite avaliar o impacto antes da ativação.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Ative o modo shadow por pelo menos 7 dias antes de ativar novas regras em produção. Analise os relatórios de impacto para ajustar thresholds e evitar falsos positivos excessivos.",
      },
      {
        type: "link-card",
        href: "/support/kb/compliance/alertas",
        title: "Alertas de Compliance",
        description:
          "Entenda como os alertas são gerados e gerenciados pela equipe de compliance",
      },
    ],
  },
  {
    slug: "alertas",
    title: "Alertas de Compliance",
    description:
      "Gerenciamento de alertas de compliance, priorização e fluxo de investigação.",
    category: "compliance",
    icon: "Bell",
    difficulty: "intermediate",
    tags: ["alertas", "notificações", "compliance", "investigação"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Sistema de Alertas de Compliance",
      },
      {
        type: "paragraph",
        text: "O sistema de alertas de compliance notifica automaticamente a equipe sobre eventos que requerem atenção. Cada alerta é classificado por severidade, categorizado por tipo e enfileirado para investigação conforme as políticas configuradas.",
      },
      {
        type: "heading",
        level: 3,
        text: "Níveis de Severidade",
      },
      {
        type: "table",
        headers: ["Severidade", "SLA de Resposta", "Canal de Notificação", "Exemplo"],
        rows: [
          ["Critical", "< 15 minutos", "SMS + Slack + E-mail", "Match em lista de sanções"],
          ["High", "< 1 hora", "Slack + E-mail", "Transação suspeita acima de $500K"],
          ["Medium", "< 4 horas", "E-mail + Dashboard", "Padrão de structuring detectado"],
          ["Low", "< 24 horas", "Dashboard", "Documento KYC próximo de expirar"],
        ],
      },
      {
        type: "callout",
        variant: "danger",
        title: "Alertas Critical",
        text: "Alertas de severidade Critical acionam automaticamente o bloqueio temporário da conta do cliente e da transação envolvida. O desbloqueio só pode ser feito após investigação e aprovação de um compliance officer.",
      },
      {
        type: "heading",
        level: 3,
        text: "Fluxo de Investigação",
      },
      {
        type: "steps",
        items: [
          {
            title: "Triagem",
            description:
              "O analista de compliance recebe o alerta, verifica os dados preliminares e decide se é falso positivo ou requer investigação.",
          },
          {
            title: "Investigação",
            description:
              "Se necessário, aprofunda a análise verificando transações relacionadas, histórico do cliente, análise de blockchain e documentos KYC.",
          },
          {
            title: "Decisão",
            description:
              "O analista registra suas conclusões e decide: liberar (falso positivo), escalar para compliance officer, ou reportar ao regulador.",
          },
          {
            title: "Ação",
            description:
              "Conforme a decisão: transação é liberada, conta é suspensa, SAR é gerado, ou medidas adicionais são aplicadas.",
          },
          {
            title: "Encerramento",
            description:
              "O alerta é encerrado com toda a documentação da investigação armazenada de forma imutável no Audit Log.",
          },
        ],
      },
      {
        type: "paragraph",
        text: "O dashboard de alertas exibe uma visão consolidada com filtros por severidade, tipo, status (aberto/em investigação/resolvido) e período. Métricas como tempo médio de resolução e taxa de falsos positivos ajudam a calibrar as políticas.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Configure regras de auto-resolve para alertas de baixa severidade que atendem critérios específicos. Por exemplo: documentos KYC renovados automaticamente fecham alertas de expiração pendente.",
      },
      {
        type: "code",
        language: "typescript",
        code: '// Listar alertas pendentes via API\nconst alerts = await adminClient.compliance.alerts.list({\n  status: "open",\n  severity: ["critical", "high"],\n  sort: "created_at:desc",\n  limit: 20,\n});\n\nalerts.forEach((alert) => {\n  console.log(\n    `[${alert.severity}] ${alert.type}: ${alert.summary} - Cliente: ${alert.client_id}`\n  );\n});',
        filename: "list-alerts.ts",
      },
      {
        type: "link-card",
        href: "/support/kb/compliance/relatorios",
        title: "Relatórios de Conformidade",
        description:
          "Gere relatórios detalhados de compliance para auditores e reguladores",
      },
    ],
  },
  {
    slug: "relatorios",
    title: "Relatórios de Conformidade",
    description:
      "Geração de relatórios de compliance para auditoria interna e órgãos reguladores.",
    category: "compliance",
    icon: "FileText",
    difficulty: "intermediate",
    tags: ["relatórios", "conformidade", "auditoria", "reguladores"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Relatórios de Conformidade",
      },
      {
        type: "paragraph",
        text: "O módulo de relatórios gera documentos padronizados para atender exigências regulatórias e auditorias internas. Os relatórios são gerados automaticamente em períodos configuráveis ou sob demanda, com exportação em múltiplos formatos.",
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Relatórios",
      },
      {
        type: "table",
        headers: ["Relatório", "Frequência", "Destinatário", "Formato"],
        rows: [
          ["SAR (Suspicious Activity Report)", "Evento", "Regulador (COAF)", "PDF + XML"],
          ["CTR (Currency Transaction Report)", "Diário", "Compliance Interno", "PDF + CSV"],
          ["Risk Assessment Summary", "Mensal", "Diretoria", "PDF"],
          ["KYC Status Report", "Semanal", "Compliance Team", "PDF + XLSX"],
          ["AML Screening Report", "Diário", "Compliance Officer", "PDF + JSON"],
          ["Sanctions Hit Report", "Evento", "Regulador + Legal", "PDF"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Geração automática",
        text: "Relatórios com frequência definida são gerados automaticamente via job scheduler. O sistema verifica se há dados novos antes de gerar — se não houver atividade relevante no período, o relatório é gerado com a indicação 'Sem atividade'.",
      },
      {
        type: "heading",
        level: 3,
        text: "Conteúdo de um SAR",
      },
      {
        type: "paragraph",
        text: "O SAR (Suspicious Activity Report) é o relatório mais crítico, gerado quando uma atividade suspeita é confirmada após investigação. Ele contém todas as informações necessárias para o órgão regulador avaliar o caso.",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Identificação completa do cliente (dados KYC)",
          "Descrição detalhada da atividade suspeita",
          "Transações envolvidas com hashes on-chain",
          "Timeline da investigação com evidências",
          "Análise de blockchain (taint analysis, cluster de endereços)",
          "Conclusão do analista e ações tomadas",
          "Documentação de suporte (screenshots, JSON artifacts)",
        ],
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar relatórios",
            description:
              "Navegue até Admin > Compliance > Relatórios para ver relatórios gerados e agendar novos.",
          },
          {
            title: "Selecionar tipo e período",
            description:
              "Escolha o tipo de relatório e o período desejado. Para relatórios sob demanda, selecione também os filtros aplicáveis.",
          },
          {
            title: "Gerar e revisar",
            description:
              "O relatório é gerado em background. Quando pronto, revise o conteúdo antes de exportar ou enviar ao destinatário.",
          },
          {
            title: "Exportar ou enviar",
            description:
              "Exporte no formato desejado ou envie diretamente para o destinatário configurado via canal seguro.",
          },
        ],
      },
      {
        type: "callout",
        variant: "warning",
        text: "Relatórios de compliance contêm dados sensíveis. Acesso é restrito a usuários com permissão 'compliance.reports' e todas as visualizações são registradas no Audit Log.",
      },
      {
        type: "link-card",
        href: "/support/kb/exports/formatos-disponiveis",
        title: "Formatos Disponíveis",
        description:
          "Conheça todos os formatos de exportação disponíveis e suas características",
      },
    ],
  },
  {
    slug: "revisao-manual",
    title: "Revisão Manual de Transações",
    description:
      "Processo de revisão manual para transações sinalizadas por regras de compliance.",
    category: "compliance",
    icon: "Eye",
    difficulty: "advanced",
    tags: ["revisão manual", "transações", "análise", "compliance"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Revisão Manual de Transações",
      },
      {
        type: "paragraph",
        text: "Quando uma transação é sinalizada por regras de compliance, ela pode ser encaminhada para revisão manual. O analista de compliance avalia as circunstâncias da transação, o histórico do cliente e dados de blockchain para tomar uma decisão informada sobre aprovar, rejeitar ou escalar.",
      },
      {
        type: "heading",
        level: 3,
        text: "Quando a Revisão Manual é Acionada",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Transação acima do threshold de valor configurado",
          "Endereço de destino sem histórico prévio (first-time recipient)",
          "Cliente com score de risco elevado",
          "Padrão de structuring detectado pelo ML",
          "Jurisdição de destino classificada como alto risco",
          "Transação para/de mixing service detectado",
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "SLA de revisão",
        text: "Transações em revisão manual têm SLA conforme a severidade: Critical (15 min), High (1h), Medium (4h). O cliente vê status 'Pending Review' na sua interface. Se o SLA expirar sem decisão, a transação é escalada automaticamente para o compliance officer.",
      },
      {
        type: "heading",
        level: 3,
        text: "Interface de Revisão",
      },
      {
        type: "paragraph",
        text: "A tela de revisão manual apresenta todas as informações necessárias para a análise em um único painel: dados da transação, perfil do cliente, histórico de transações, análise de blockchain e alertas relacionados.",
      },
      {
        type: "steps",
        items: [
          {
            title: "Analisar dados da transação",
            description:
              "Verifique valor, endereços de origem e destino, chain, token e horário. Compare com o padrão de comportamento do cliente.",
          },
          {
            title: "Verificar análise de blockchain",
            description:
              "Revise o resultado do screening de endereços: risk score, categorias identificadas (exchange, DeFi, mixer, etc.) e cluster analysis.",
          },
          {
            title: "Consultar histórico do cliente",
            description:
              "Verifique transações anteriores, alertas passados, nível de KYC e tempo de relacionamento. Clientes com longo histórico limpo têm menor probabilidade de atividade suspeita.",
          },
          {
            title: "Tomar decisão",
            description:
              "Aprove, rejeite ou escale a transação. A decisão deve ser acompanhada de justificativa detalhada que ficará registrada permanentemente.",
          },
        ],
      },
      {
        type: "code",
        language: "typescript",
        code: '// Aprovar transação em revisão manual via API\nconst result = await adminClient.compliance.reviews.decide({\n  transaction_id: "tx_abc123",\n  decision: "approve",\n  justification:\n    "Cliente institucional com KYC avançado. Transação consistente com " +\n    "perfil operacional declarado. Endereço de destino é exchange regulada (Binance). " +\n    "Nenhum indicador de risco identificado na análise de blockchain.",\n  reviewer_id: "admin_john",\n  evidence_attachments: ["blockchain_analysis_report.pdf"],\n});',
        filename: "review-transaction.ts",
      },
      {
        type: "callout",
        variant: "warning",
        text: "Nunca aprove transações sem justificativa adequada. Auditorias regulatórias verificam a qualidade das justificativas de revisão manual. Justificativas genéricas como 'parece ok' não são aceitáveis.",
      },
      {
        type: "heading",
        level: 3,
        text: "Métricas de Revisão",
      },
      {
        type: "table",
        headers: ["Métrica", "Descrição", "Meta"],
        rows: [
          ["Tempo médio de revisão", "Tempo entre flag e decisão", "< 30 min"],
          ["Taxa de aprovação", "Percentual de transações aprovadas", "Monitorar tendência"],
          ["Taxa de falso positivo", "Flags que resultam em aprovação", "< 30%"],
          ["SLA compliance", "Percentual dentro do SLA", "> 95%"],
        ],
      },
      {
        type: "link-card",
        href: "/support/kb/traceability/json-artifacts",
        title: "JSON Artifacts",
        description:
          "Veja como os artifacts de transação são gerados e armazenados para auditoria",
      },
    ],
  },
];
