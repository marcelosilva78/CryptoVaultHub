import type { Article } from "../components/types";

export const exportsArticles: Article[] = [
  {
    slug: "exportar-dados",
    title: "Exportar Dados",
    description:
      "Como exportar dados da plataforma em múltiplos formatos para análise e compliance.",
    category: "exports",
    icon: "Download",
    difficulty: "beginner",
    tags: ["exportar", "dados", "download", "relatórios"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Exportação de Dados",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub permite exportar dados de praticamente todos os módulos do sistema. Exportações são utilizadas para relatórios regulatórios, análise externa em ferramentas de BI, backup de dados operacionais e entrega a auditores. O sistema suporta múltiplos formatos e processa exportações grandes em background.",
      },
      {
        type: "heading",
        level: 3,
        text: "Dados Exportáveis",
      },
      {
        type: "table",
        headers: ["Módulo", "Dados", "Formatos"],
        rows: [
          ["Transações", "Histórico completo com detalhes on-chain", "CSV, JSON, XLSX"],
          ["Clientes", "Dados cadastrais (sem dados sensíveis de KYC)", "CSV, JSON, XLSX"],
          ["Compliance", "Alertas, decisões, SARs", "PDF, JSON, XML"],
          ["Analytics", "Métricas agregadas e séries temporais", "CSV, JSON, XLSX"],
          ["Audit Log", "Registro completo de ações administrativas", "JSON, CSV"],
          ["Wallets", "Endereços, saldos, tokens", "CSV, JSON"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Dados sensíveis",
        text: "Exportações podem conter dados sensíveis como endereços de wallet e volumes de transação. Toda exportação é registrada no Audit Log com o administrador responsável e os filtros utilizados. Exportações em massa requerem permissão 'exports.bulk'.",
      },
      {
        type: "heading",
        level: 3,
        text: "Como Exportar",
      },
      {
        type: "steps",
        items: [
          {
            title: "Navegar até os dados",
            description:
              "Acesse o módulo desejado (Transações, Clientes, etc.) e aplique os filtros para selecionar os dados que deseja exportar.",
          },
          {
            title: "Iniciar exportação",
            description:
              "Clique no botão 'Exportar' (ícone de download) no topo da tabela. Selecione o formato desejado.",
          },
          {
            title: "Configurar opções",
            description:
              "Selecione quais colunas incluir, se deseja dados detalhados ou resumidos, e o encoding (UTF-8 por padrão).",
          },
          {
            title: "Aguardar processamento",
            description:
              "Exportações pequenas (< 10K registros) são processadas instantaneamente. Exportações maiores são processadas em background.",
          },
          {
            title: "Download",
            description:
              "O arquivo estará disponível na seção 'Meus Exports' no menu do usuário. Um e-mail é enviado quando exportações em background são concluídas.",
          },
        ],
      },
      {
        type: "code",
        language: "bash",
        code: '# Exportar transações via API\ncurl -X POST https://api.vaulthub.live/v1/admin/exports \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "type": "transactions",\n    "format": "csv",\n    "filters": {\n      "chain": "ethereum",\n      "period": "last_30_days",\n      "status": "confirmed"\n    },\n    "columns": ["id", "tx_hash", "client_id", "value_usd", "chain", "token", "status", "confirmed_at"],\n    "notify_email": true\n  }\'',
        filename: "export-transactions.sh",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Agende exportações recorrentes para relatórios que você gera regularmente. Acesse Exports > Agendamentos para configurar: tipo de dados, filtros, formato, frequência e destinatários do e-mail.",
      },
      {
        type: "paragraph",
        text: "Exportações são comprimidas automaticamente em .zip quando o arquivo excede 50MB. O limite máximo por exportação é de 1 milhão de registros. Para volumes maiores, utilize a API de streaming ou divida em múltiplas exportações.",
      },
      {
        type: "link-card",
        href: "/support/kb/exports/formatos-disponiveis",
        title: "Formatos Disponíveis",
        description:
          "Conheça os formatos de exportação suportados e quando usar cada um",
      },
    ],
  },
  {
    slug: "audit-log",
    title: "Audit Log",
    description:
      "Registro imutável de todas as ações administrativas na plataforma.",
    category: "exports",
    icon: "Shield",
    difficulty: "intermediate",
    tags: ["audit", "log", "auditoria", "registro", "segurança"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Audit Log",
      },
      {
        type: "paragraph",
        text: "O Audit Log é o registro imutável e completo de todas as ações realizadas na plataforma, tanto por administradores quanto por sistemas automatizados. Cada entrada captura quem fez, o que fez, quando fez, de onde fez e qual foi o resultado. É a fundação da rastreabilidade e accountability do CryptoVaultHub.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Imutabilidade",
        text: "Entradas do Audit Log são write-once: uma vez registradas, não podem ser alteradas ou excluídas por nenhum usuário, incluindo super admins. A integridade é garantida por hash chain (cada entry referencia o hash da anterior).",
      },
      {
        type: "heading",
        level: 3,
        text: "O que é Registrado",
      },
      {
        type: "table",
        headers: ["Categoria", "Exemplos de Eventos", "Retenção"],
        rows: [
          ["Autenticação", "Login, logout, 2FA, tentativas falhadas", "2 anos"],
          ["Client Management", "Criação, edição, desativação, tier change", "5 anos"],
          ["Transações", "Aprovação, rejeição, submissão, confirmação", "7 anos"],
          ["Compliance", "Alert resolution, policy changes, SAR filing", "10 anos"],
          ["Configurações", "Mudanças em settings, chains, tiers", "5 anos"],
          ["Impersonation", "Início, ações durante, encerramento", "5 anos"],
          ["Exports", "Solicitação, download, visualização", "3 anos"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Estrutura de uma Entry",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "entry_id": "audit_1a2b3c4d",\n  "timestamp": "2026-04-22T14:30:00.123Z",\n  "actor": {\n    "type": "admin",\n    "id": "admin_john",\n    "name": "John Silva",\n    "ip": "203.0.113.42",\n    "user_agent": "Mozilla/5.0...",\n    "session_id": "sess_xyz789"\n  },\n  "action": "client.tier.change",\n  "resource": {\n    "type": "client",\n    "id": "client_x9y8z7",\n    "name": "Empresa Exemplo Ltda"\n  },\n  "details": {\n    "previous_tier": "tier_standard",\n    "new_tier": "tier_professional",\n    "reason": "Upgrade solicitado pelo cliente"\n  },\n  "result": "success",\n  "previous_hash": "sha256:e5f6g7h8...",\n  "hash": "sha256:a1b2c3d4..."\n}',
        filename: "audit-log-entry.json",
      },
      {
        type: "heading",
        level: 3,
        text: "Buscando no Audit Log",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "Por ator: quem realizou a ação (admin_id ou system)",
          "Por ação: tipo de evento (client.create, tx.approve, etc.)",
          "Por recurso: sobre qual objeto a ação foi realizada",
          "Por período: range de datas com precisão de milissegundos",
          "Por resultado: sucesso ou falha",
          "Por IP: filtre por endereço IP do ator",
          "Texto livre: busca em detalhes e campos de motivo",
        ],
      },
      {
        type: "callout",
        variant: "warning",
        text: "O Audit Log é frequentemente solicitado por reguladores e auditores externos. Mantenha as políticas de retenção configuradas e teste regularmente a capacidade de busca e exportação.",
      },
      {
        type: "paragraph",
        text: "Para acessar o Audit Log, navegue até Admin > Exports & Audit > Audit Log. A interface exibe uma timeline com filtros avançados e capacidade de exportar os resultados para análise externa.",
      },
      {
        type: "quote",
        text: "Se não está no Audit Log, não aconteceu. Esta é a verdade em custódia regulada — o registro é a prova.",
        author: "Princípios de Auditoria CryptoVaultHub",
      },
      {
        type: "link-card",
        href: "/support/kb/traceability/json-artifacts",
        title: "JSON Artifacts",
        description:
          "Veja como os artifacts de transação complementam o Audit Log com dados técnicos detalhados",
      },
    ],
  },
  {
    slug: "formatos-disponiveis",
    title: "Formatos Disponíveis",
    description:
      "Guia completo dos formatos de exportação suportados e quando usar cada um.",
    category: "exports",
    icon: "FileType",
    difficulty: "beginner",
    tags: ["formatos", "CSV", "JSON", "XLSX", "PDF", "XML"],
    updatedAt: "22 Abr 2026",
    readingTime: 4,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Formatos de Exportação",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub suporta múltiplos formatos de exportação para atender diferentes necessidades — desde análise em planilhas até integração com sistemas externos e entrega a reguladores. Cada formato tem suas vantagens e uso ideal.",
      },
      {
        type: "heading",
        level: 3,
        text: "Comparação de Formatos",
      },
      {
        type: "table",
        headers: ["Formato", "Uso Ideal", "Tamanho", "Estruturado", "Suporte a Nested"],
        rows: [
          ["CSV", "Planilhas, import em DB, análise em Python/R", "Pequeno", "Sim (flat)", "Não"],
          ["JSON", "APIs, integração de sistemas, dados complexos", "Médio", "Sim (hierárquico)", "Sim"],
          ["XLSX", "Excel/Google Sheets, relatórios formatados", "Médio", "Sim (flat)", "Não"],
          ["PDF", "Relatórios para reguladores, documentação", "Grande", "Não", "N/A"],
          ["XML", "Integração com sistemas legados, FATF reports", "Grande", "Sim (hierárquico)", "Sim"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Quando Usar Cada Formato",
      },
      {
        type: "list",
        ordered: false,
        items: [
          "CSV: para importação em bancos de dados, processamento em scripts Python/R, ou quando precisa de arquivo leve",
          "JSON: para integração via API, dados com estrutura complexa (nested objects), ou quando precisa de JSON artifacts completos",
          "XLSX: para análise manual em Excel com formatação, fórmulas e gráficos, ou para compartilhar com equipe de negócios",
          "PDF: para relatórios formais, entrega a reguladores, documentação de compliance com carimbo de data",
          "XML: para compliance reports em formato FATF, integração com sistemas legados que requerem XML",
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Encoding",
        text: "Todos os formatos texto (CSV, JSON, XML) usam UTF-8 por padrão. Para CSV, é possível selecionar o delimitador (vírgula, ponto-e-vírgula, tab) e optar por BOM para compatibilidade com Excel em português.",
      },
      {
        type: "heading",
        level: 3,
        text: "Opções Avançadas por Formato",
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "format": "csv",\n  "options": {\n    "delimiter": ";",\n    "encoding": "utf-8-bom",\n    "include_headers": true,\n    "date_format": "DD/MM/YYYY HH:mm:ss",\n    "decimal_separator": ",",\n    "null_value": "",\n    "quote_strings": true\n  }\n}',
        filename: "csv-options.json",
      },
      {
        type: "paragraph",
        text: "Para exportações em XLSX, o sistema gera planilhas com formatação automática: cabeçalhos em negrito, colunas de valor com formato monetário, datas formatadas e largura de coluna auto-ajustada. Múltiplas abas podem ser geradas para dados relacionados.",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Para relatórios recorrentes destinados a reguladores, use o formato PDF com template oficial. Os templates incluem cabeçalho da empresa, carimbo de data, assinatura digital e marca d'água de confidencialidade.",
      },
      {
        type: "link-card",
        href: "/support/kb/exports/exports-background",
        title: "Exports em Background",
        description:
          "Saiba como funcionam exportações grandes processadas em background",
      },
    ],
  },
  {
    slug: "exports-background",
    title: "Exports em Background",
    description:
      "Como funcionam exportações grandes processadas de forma assíncrona.",
    category: "exports",
    icon: "Clock",
    difficulty: "intermediate",
    tags: ["background", "assíncrono", "processamento", "fila"],
    updatedAt: "22 Abr 2026",
    readingTime: 4,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Exportações em Background",
      },
      {
        type: "paragraph",
        text: "Quando uma exportação envolve mais de 10.000 registros ou dados complexos como JSON artifacts completos, ela é processada em background para não bloquear a interface. O sistema utiliza a mesma infraestrutura de job queue (BullMQ) para gerenciar essas exportações de forma confiável.",
      },
      {
        type: "heading",
        level: 3,
        text: "Fluxo de Processamento",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Solicitar Export] --> B{Tamanho estimado}\n  B -->|< 10K registros| C[Processamento Síncrono]\n  C --> D[Download Imediato]\n  B -->|>= 10K registros| E[Enfileirar Job]\n  E --> F[Processar em Background]\n  F --> G[Gerar Arquivo]\n  G --> H[Upload para Storage]\n  H --> I[Notificar Usuário]\n  I --> J[Download Disponível]",
      },
      {
        type: "heading",
        level: 3,
        text: "Acompanhando Exportações",
      },
      {
        type: "paragraph",
        text: "Todas as exportações — síncronas e em background — ficam registradas na seção 'Meus Exports', acessível pelo menu do usuário no canto superior direito. Para cada exportação, é exibido o status, progresso, tamanho estimado e link de download.",
      },
      {
        type: "table",
        headers: ["Status", "Significado", "Ação"],
        rows: [
          ["Queued", "Aguardando processamento na fila", "Aguarde"],
          ["Processing", "Em processamento (% progresso visível)", "Aguarde"],
          ["Completed", "Pronto para download", "Baixar arquivo"],
          ["Failed", "Erro no processamento", "Ver detalhes do erro e tentar novamente"],
          ["Expired", "Arquivo expirou (após 7 dias)", "Solicitar nova exportação"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Retenção de arquivos",
        text: "Arquivos de exportação ficam disponíveis para download por 7 dias após a geração. Após esse período, são automaticamente removidos. Se precisar do arquivo novamente, será necessário solicitar uma nova exportação.",
      },
      {
        type: "steps",
        items: [
          {
            title: "Solicitar exportação",
            description:
              "Aplique os filtros desejados e clique em 'Exportar'. Se o volume for grande, o sistema informará que será processado em background.",
          },
          {
            title: "Acompanhar progresso",
            description:
              "Acesse 'Meus Exports' para ver o progresso em tempo real. Não é necessário manter a página aberta.",
          },
          {
            title: "Receber notificação",
            description:
              "Um e-mail será enviado quando a exportação estiver pronta, com link direto para download.",
          },
          {
            title: "Baixar arquivo",
            description:
              "Clique no link do e-mail ou acesse 'Meus Exports' para baixar. Arquivos > 50MB são comprimidos em .zip.",
          },
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Para exportações muito grandes (> 500K registros), considere dividir em múltiplas exportações menores usando filtros de período. Isso resulta em processamento mais rápido e arquivos mais manejáveis.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Verificar status de uma exportação via API\ncurl -s "https://api.vaulthub.live/v1/admin/exports/exp_abc123" \\\n  -H "Authorization: Bearer $ADMIN_TOKEN" | jq \'.\'\n\n# {\n#   "id": "exp_abc123",\n#   "status": "processing",\n#   "progress": 65,\n#   "total_records": 250000,\n#   "processed_records": 162500,\n#   "estimated_completion": "2026-04-22T15:30:00Z",\n#   "format": "csv",\n#   "file_size_estimate": "45MB"\n# }',
        filename: "check-export.sh",
      },
      {
        type: "link-card",
        href: "/support/kb/monitoring/job-queue",
        title: "Job Queue",
        description:
          "Entenda como a infraestrutura de filas gerencia exportações em background",
      },
    ],
  },
  {
    slug: "retencao-limpeza",
    title: "Retenção e Limpeza",
    description:
      "Políticas de retenção de dados e processos de limpeza automática.",
    category: "exports",
    icon: "Trash2",
    difficulty: "advanced",
    tags: ["retenção", "limpeza", "LGPD", "dados", "política"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Políticas de Retenção e Limpeza",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub implementa políticas de retenção de dados configuráveis que equilibram requisitos regulatórios de preservação com normas de privacidade como LGPD e GDPR. Dados são retidos pelo tempo necessário e removidos de forma segura quando o período expira.",
      },
      {
        type: "callout",
        variant: "danger",
        title: "Conflito regulatório",
        text: "Regulamentações de compliance (AML/KYC) exigem retenção de dados por anos, enquanto leis de privacidade (LGPD) exigem remoção quando não mais necessários. As políticas do sistema são configuradas para atender ambas — dados de compliance são retidos conforme regulação, dados pessoais desnecessários são removidos nos prazos da LGPD.",
      },
      {
        type: "heading",
        level: 3,
        text: "Períodos de Retenção",
      },
      {
        type: "table",
        headers: ["Tipo de Dado", "Retenção Mínima", "Regulação", "Auto-cleanup"],
        rows: [
          ["Transações on-chain", "7 anos", "AML/CTF", "Não (permanente)"],
          ["KYC Documentos", "5 anos após encerramento", "AML 5AMLD", "Sim"],
          ["Audit Log", "Varia (2-10 anos por tipo)", "Compliance geral", "Sim"],
          ["Logs de sistema", "30-365 dias por nível", "Operacional", "Sim"],
          ["Métricas (Prometheus)", "90 dias", "Operacional", "Sim"],
          ["Exports gerados", "7 dias", "Operacional", "Sim"],
          ["Sessions/tokens", "24h após expiração", "Segurança", "Sim"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Processo de Limpeza",
      },
      {
        type: "paragraph",
        text: "A limpeza de dados é executada por um job automatizado que roda diariamente às 03:00 UTC. O job identifica dados que excederam o período de retenção, gera um relatório de limpeza e procede com a remoção segura.",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  A[Cleanup Job Scheduled<br/>03:00 UTC] --> B[Identificar Dados Expirados]\n  B --> C[Gerar Relatório Preview]\n  C --> D{Aprovação automática?}\n  D -->|Dados operacionais| E[Executar Limpeza]\n  D -->|Dados regulados| F[Aguardar Aprovação Manual]\n  F --> G{Compliance Officer Aprova?}\n  G -->|Sim| E\n  G -->|Não| H[Estender Retenção]\n  E --> I[Gerar Relatório Final]\n  I --> J[Registrar no Audit Log]",
      },
      {
        type: "callout",
        variant: "warning",
        text: "A remoção de dados regulados (KYC, transações, compliance) requer aprovação explícita de um compliance officer. Dados operacionais (logs, métricas, exports) são limpos automaticamente sem aprovação.",
      },
      {
        type: "heading",
        level: 3,
        text: "Configuração",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar políticas de retenção",
            description:
              "Navegue até Admin > Settings > Data Retention para ver e editar as políticas configuradas.",
          },
          {
            title: "Ajustar períodos",
            description:
              "Altere os períodos de retenção conforme necessidade. O sistema valida que os períodos atendem os mínimos regulatórios.",
          },
          {
            title: "Configurar aprovações",
            description:
              "Defina quais tipos de dados requerem aprovação manual para limpeza e quem pode aprovar.",
          },
          {
            title: "Revisar relatórios",
            description:
              "Relatórios de limpeza são gerados após cada execução e disponíveis em Exports & Audit > Cleanup Reports.",
          },
        ],
      },
      {
        type: "code",
        language: "json",
        code: '{\n  "retention_policies": [\n    {\n      "data_type": "system_logs",\n      "levels": {\n        "ERROR": { "days": 365 },\n        "WARN": { "days": 180 },\n        "INFO": { "days": 90 },\n        "DEBUG": { "days": 30 }\n      },\n      "auto_cleanup": true,\n      "requires_approval": false\n    },\n    {\n      "data_type": "kyc_documents",\n      "retention": { "years_after_account_closure": 5 },\n      "auto_cleanup": true,\n      "requires_approval": true,\n      "approvers": ["compliance_officer"]\n    }\n  ]\n}',
        filename: "retention-policies.json",
      },
      {
        type: "link-card",
        href: "/support/kb/settings/seguranca-sistema",
        title: "Segurança do Sistema",
        description:
          "Entenda como a segurança do sistema protege dados durante todo o ciclo de retenção",
      },
    ],
  },
];
