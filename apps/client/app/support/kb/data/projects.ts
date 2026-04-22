import type { Article } from "../components/types";

export const projectsArticles: Article[] = [
  {
    slug: "criar-projeto",
    title: "Criar um Projeto",
    description:
      "Como criar um novo projeto na plataforma para organizar wallets, transações e integrações por contexto de negócio.",
    category: "projects",
    icon: "FolderPlus",
    difficulty: "beginner",
    tags: ["projeto", "criar", "organização", "wallets"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "O que é um Projeto?",
      },
      {
        type: "paragraph",
        text: "Um projeto no CryptoVaultHub é uma unidade organizacional que agrupa wallets, transações, webhooks e API keys sob um contexto de negócio. Por exemplo, você pode ter um projeto 'Produção' para operações reais e 'Staging' para testes.",
      },
      {
        type: "paragraph",
        text: "Cada projeto possui sua própria configuração de chains, limites de transação e políticas de aprovação, proporcionando isolamento e controle granular sobre diferentes casos de uso.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Limites de projetos",
        text: "O número de projetos que você pode criar depende do seu tier: Standard (3 projetos), Professional (10 projetos), Enterprise (ilimitado). Cada projeto pode ter wallets em múltiplas chains.",
      },
      {
        type: "heading",
        level: 3,
        text: "Criando um Projeto",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar All Projects",
            description:
              "No menu lateral, clique em Projects > All Projects. A tela lista todos os seus projetos com status e métricas resumidas.",
          },
          {
            title: "Clicar em 'Novo Projeto'",
            description:
              "Clique no botão 'Novo Projeto' no canto superior direito para abrir o formulário de criação.",
          },
          {
            title: "Preencher informações básicas",
            description:
              "Defina o nome do projeto, uma descrição opcional e selecione o ambiente (production, staging, development).",
          },
          {
            title: "Selecionar chains habilitadas",
            description:
              "Escolha quais blockchains estarão disponíveis neste projeto. Chains podem ser adicionadas ou removidas posteriormente.",
          },
          {
            title: "Confirmar criação",
            description:
              "Revise as informações e confirme. O projeto será criado com uma API key padrão e estará pronto para uso.",
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
        code: 'curl -X POST https://api.vaulthub.live/v1/projects \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "name": "Produção - Exchange BRL",\n    "description": "Projeto principal para operações de exchange",\n    "environment": "production",\n    "enabled_chains": ["ethereum", "bitcoin", "polygon"]\n  }\'',
        filename: "create-project.sh",
      },
      {
        type: "table",
        headers: ["Ambiente", "Descrição", "Uso"],
        rows: [
          ["Production", "Operações reais com fundos", "Sistemas em produção"],
          ["Staging", "Testes com rede testnet", "QA e validação"],
          ["Development", "Sandbox local", "Desenvolvimento e prototipagem"],
        ],
      },
      {
        type: "callout",
        variant: "tip",
        text: "Use ambientes separados para isolar operações de teste e produção. Nunca teste com fundos reais — use sempre o ambiente staging com testnets.",
      },
      {
        type: "link-card",
        href: "/support/kb/projects/deploy-contract",
        title: "Deploy de Smart Contract",
        description:
          "Aprenda a fazer deploy de smart contracts através da plataforma",
      },
    ],
  },
  {
    slug: "deploy-contract",
    title: "Deploy de Smart Contract",
    description:
      "Como fazer deploy de smart contracts pela plataforma, incluindo compilação, estimativa de gas e verificação.",
    category: "projects",
    icon: "Rocket",
    difficulty: "advanced",
    tags: ["deploy", "smart contract", "solidity", "EVM", "gas"],
    updatedAt: "22 Abr 2026",
    readingTime: 8,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Deploy de Smart Contracts",
      },
      {
        type: "paragraph",
        text: "A plataforma CryptoVaultHub permite fazer deploy de smart contracts em qualquer chain EVM habilitada no seu projeto. O processo inclui upload do bytecode compilado, estimativa de gas, deploy on-chain e verificação opcional no block explorer.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Operação irreversível",
        text: "O deploy de um smart contract é permanente e consome gas. Certifique-se de testar o contrato em ambiente staging (testnet) antes de fazer deploy em production (mainnet). Bugs em contratos deployed não podem ser corrigidos sem um novo deploy.",
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
          "Contrato compilado com bytecode e ABI",
          "Wallet com saldo suficiente para gas do deploy",
          "Projeto com a chain de destino habilitada",
          "Permissão de deploy no projeto (tier Professional ou superior)",
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Processo de Deploy",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar Deploy History",
            description:
              "No menu lateral, acesse Projects > Deploy History e clique em 'Novo Deploy'.",
          },
          {
            title: "Selecionar projeto e chain",
            description:
              "Escolha o projeto e a chain onde o contrato será deployed. A wallet do projeto será usada para pagar o gas.",
          },
          {
            title: "Upload do contrato",
            description:
              "Faça upload do arquivo JSON com bytecode e ABI, ou cole diretamente no editor. O sistema validará a estrutura automaticamente.",
          },
          {
            title: "Configurar parâmetros do construtor",
            description:
              "Se o contrato possui constructor com parâmetros, preencha os valores. A interface gera os campos automaticamente baseado no ABI.",
          },
          {
            title: "Estimar e confirmar gas",
            description:
              "O sistema estimará o gas necessário. Revise o custo e confirme o deploy com 2FA.",
          },
          {
            title: "Aguardar confirmação",
            description:
              "O deploy será enviado para a rede. Após confirmação, o endereço do contrato será exibido e salvo no histórico.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Deploy via API",
      },
      {
        type: "code",
        language: "bash",
        code: 'curl -X POST https://api.vaulthub.live/v1/projects/proj_abc123/deploy \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "chain": "ethereum",\n    "wallet_id": "wal_abc123",\n    "bytecode": "0x608060405234801561001057600080fd5b50...",\n    "abi": [...],\n    "constructor_args": ["CryptoVault Token", "CVT", 18],\n    "gas_priority": "medium",\n    "verify": true\n  }\'',
        filename: "deploy-contract.sh",
      },
      {
        type: "callout",
        variant: "tip",
        title: "Verificação automática",
        text: "Ao incluir 'verify: true' no request, a plataforma automaticamente submete o código fonte para verificação no block explorer da chain (Etherscan, Polygonscan, etc.). Contratos verificados são mais confiáveis para interação pública.",
      },
      {
        type: "paragraph",
        text: "O histórico de deploys é mantido com todos os detalhes: bytecode, ABI, parâmetros, gas utilizado, hash da transação e endereço do contrato. Esses dados são essenciais para auditoria e manutenção.",
      },
      {
        type: "link-card",
        href: "/support/kb/projects/exportar-projeto",
        title: "Exportar Projeto",
        description:
          "Saiba como exportar dados e configurações do seu projeto",
      },
    ],
  },
  {
    slug: "exportar-projeto",
    title: "Exportar Projeto",
    description:
      "Como exportar dados, configurações e relatórios de um projeto para backup, migração ou compliance.",
    category: "projects",
    icon: "PackageOpen",
    difficulty: "intermediate",
    tags: ["exportar", "projeto", "backup", "relatório", "compliance"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Exportação de Projetos",
      },
      {
        type: "paragraph",
        text: "A funcionalidade de exportação permite gerar relatórios completos de um projeto, incluindo transações, endereços, configurações e metadados. Exportações são úteis para compliance, auditoria, backup e migração de dados.",
      },
      {
        type: "heading",
        level: 3,
        text: "Tipos de Exportação",
      },
      {
        type: "table",
        headers: ["Tipo", "Conteúdo", "Formatos"],
        rows: [
          ["Transações", "Histórico completo de transações com detalhes", "CSV, JSON, PDF"],
          ["Endereços", "Lista de endereços com saldos e labels", "CSV, JSON"],
          ["Configurações", "Configurações do projeto, políticas, limites", "JSON"],
          ["Relatório Completo", "Todos os dados do projeto consolidados", "PDF, ZIP"],
          ["Audit Trail", "Log de todas as ações realizadas no projeto", "CSV, JSON"],
        ],
      },
      {
        type: "callout",
        variant: "info",
        title: "Exportações programadas",
        text: "Além de exportações sob demanda, você pode agendar exportações automáticas (diárias, semanais, mensais) que serão enviadas por e-mail ou armazenadas em bucket S3 configurado.",
      },
      {
        type: "heading",
        level: 3,
        text: "Exportar pela Interface",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar a seção de exportação",
            description:
              "No menu lateral, clique em Projects > Export. Selecione o projeto que deseja exportar.",
          },
          {
            title: "Escolher tipo e período",
            description:
              "Selecione o tipo de dados e o período. Filtros adicionais estão disponíveis para refinar a exportação.",
          },
          {
            title: "Selecionar formato",
            description:
              "Escolha o formato de saída. CSV é ideal para planilhas, JSON para integração e PDF para relatórios formais.",
          },
          {
            title: "Gerar e baixar",
            description:
              "Clique em 'Gerar Exportação'. Exportações grandes podem levar alguns minutos. Você será notificado quando estiver pronta para download.",
          },
        ],
      },
      {
        type: "code",
        language: "bash",
        code: '# Exportar transações do projeto via API\ncurl -X POST https://api.vaulthub.live/v1/projects/proj_abc123/export \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "type": "transactions",\n    "format": "csv",\n    "from": "2026-04-01",\n    "to": "2026-04-22",\n    "filters": {\n      "status": "confirmed",\n      "chain": "ethereum"\n    }\n  }\'',
        filename: "export-project.sh",
      },
      {
        type: "callout",
        variant: "tip",
        text: "Para auditoria, use o tipo 'Relatório Completo' que inclui todos os dados com assinatura digital para validação de integridade.",
      },
      {
        type: "paragraph",
        text: "Todas as exportações são registradas no audit trail do projeto. Exportações contendo dados sensíveis requerem confirmação com 2FA.",
      },
      {
        type: "link-card",
        href: "/support/kb/projects/multi-chain",
        title: "Configuração Multi-Chain",
        description:
          "Configure operações em múltiplas blockchains no mesmo projeto",
      },
    ],
  },
  {
    slug: "multi-chain",
    title: "Configuração Multi-Chain",
    description:
      "Como configurar e gerenciar operações em múltiplas blockchains dentro de um único projeto.",
    category: "projects",
    icon: "Network",
    difficulty: "intermediate",
    tags: ["multi-chain", "blockchains", "configuração", "redes"],
    updatedAt: "22 Abr 2026",
    readingTime: 6,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Operações Multi-Chain",
      },
      {
        type: "paragraph",
        text: "O CryptoVaultHub foi projetado para operações multi-chain nativas. Um único projeto pode ter wallets em múltiplas blockchains, permitindo gerenciar ativos em Ethereum, Bitcoin, Polygon e outras redes de forma centralizada.",
      },
      {
        type: "callout",
        variant: "info",
        title: "Chains disponíveis",
        text: "As chains habilitadas para sua conta dependem do tier e da configuração do administrador. Novas chains são adicionadas regularmente à plataforma conforme a demanda.",
      },
      {
        type: "heading",
        level: 3,
        text: "Habilitando Novas Chains",
      },
      {
        type: "steps",
        items: [
          {
            title: "Acessar configurações do projeto",
            description:
              "Na página do projeto, acesse a aba 'Configurações' e depois 'Chains Habilitadas'.",
          },
          {
            title: "Adicionar chain",
            description:
              "Clique em 'Adicionar Chain' e selecione a blockchain desejada da lista de chains disponíveis.",
          },
          {
            title: "Configurar parâmetros",
            description:
              "Configure parâmetros específicos da chain: confirmações necessárias, gas strategy padrão e limites específicos.",
          },
          {
            title: "Criar wallet na chain",
            description:
              "Após habilitar a chain, crie uma wallet para começar a operar. O sistema gerará automaticamente o primeiro endereço.",
          },
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Visão Consolidada",
      },
      {
        type: "paragraph",
        text: "O dashboard do projeto oferece uma visão consolidada de todas as chains, com saldos convertidos para USD/BRL, volume de transações por chain e alertas unificados. Isso facilita o gerenciamento quando você opera em múltiplas redes.",
      },
      {
        type: "mermaid",
        chart:
          "graph TD\n  P[Projeto] --> E[Ethereum]\n  P --> B[Bitcoin]\n  P --> M[Polygon]\n  P --> T[Tron]\n  E --> E1[Wallet ETH]\n  E --> E2[Wallet USDT-ERC20]\n  B --> B1[Wallet BTC]\n  M --> M1[Wallet MATIC]\n  M --> M2[Wallet USDT-Polygon]",
      },
      {
        type: "heading",
        level: 3,
        text: "Considerações por Chain",
      },
      {
        type: "table",
        headers: ["Chain", "Modelo", "Gas Token", "Consideração"],
        rows: [
          ["Ethereum", "Account-based", "ETH", "Manter saldo ETH para gas de transações ERC-20"],
          ["Bitcoin", "UTXO", "BTC", "UTXOs fragmentados podem aumentar custo de transação"],
          ["Polygon", "Account-based", "MATIC", "Gas muito baixo, ideal para alto volume"],
          ["Tron", "Energy/Bandwidth", "TRX", "Sistema de recursos único, requer staking para gas grátis"],
          ["BSC", "Account-based", "BNB", "Similar ao Ethereum, gas mais baixo"],
        ],
      },
      {
        type: "callout",
        variant: "warning",
        title: "Gas em cada chain",
        text: "Cada chain requer seu token nativo para pagar gas. Certifique-se de manter saldo suficiente do token nativo em cada wallet, especialmente para operações de flush e envio de tokens ERC-20/TRC-20.",
      },
      {
        type: "link-card",
        href: "/support/kb/projects/gerenciar-projetos",
        title: "Gerenciar Projetos",
        description:
          "Aprenda a editar, arquivar e gerenciar múltiplos projetos",
      },
    ],
  },
  {
    slug: "gerenciar-projetos",
    title: "Gerenciar Projetos",
    description:
      "Como editar, arquivar e gerenciar múltiplos projetos, incluindo organização e boas práticas.",
    category: "projects",
    icon: "FolderKanban",
    difficulty: "intermediate",
    tags: ["projeto", "gerenciar", "editar", "arquivar", "organização"],
    updatedAt: "22 Abr 2026",
    readingTime: 5,
    blocks: [
      {
        type: "heading",
        level: 2,
        text: "Gerenciamento de Projetos",
      },
      {
        type: "paragraph",
        text: "A gestão eficiente de projetos é fundamental para manter suas operações organizadas. O CryptoVaultHub oferece ferramentas para editar, arquivar, duplicar e monitorar projetos com facilidade.",
      },
      {
        type: "heading",
        level: 3,
        text: "Ações Disponíveis",
      },
      {
        type: "table",
        headers: ["Ação", "Descrição", "Requer 2FA"],
        rows: [
          ["Editar", "Alterar nome, descrição e configurações", "Não"],
          ["Adicionar chain", "Habilitar nova blockchain no projeto", "Não"],
          ["Remover chain", "Desabilitar chain (wallets preservadas)", "Sim"],
          ["Duplicar", "Criar cópia com mesmas configurações", "Não"],
          ["Arquivar", "Desativar projeto preservando dados", "Sim"],
          ["Excluir", "Remover projeto (somente se saldo zero)", "Sim"],
        ],
      },
      {
        type: "heading",
        level: 3,
        text: "Boas Práticas de Organização",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Use nomes descritivos que identifiquem o propósito do projeto",
          "Separe projetos por ambiente (production, staging, development)",
          "Mantenha API keys distintas por projeto para isolamento de acesso",
          "Configure webhooks específicos por projeto para segregação de eventos",
          "Revise projetos inativos periodicamente e arquive os que não estão em uso",
          "Documente as políticas de aprovação de cada projeto para a equipe",
        ],
      },
      {
        type: "callout",
        variant: "tip",
        title: "Duplicar projeto",
        text: "Ao criar um novo ambiente de testes, use a função 'Duplicar' para copiar todas as configurações de um projeto existente. Apenas as wallets e dados não são copiados — o novo projeto começa limpo.",
      },
      {
        type: "heading",
        level: 3,
        text: "Arquivamento de Projetos",
      },
      {
        type: "paragraph",
        text: "O arquivamento desativa todas as operações do projeto mas preserva 100% dos dados históricos. Wallets com saldo são congeladas e não podem receber novas transações. O arquivamento é reversível — projetos podem ser reativados a qualquer momento.",
      },
      {
        type: "callout",
        variant: "warning",
        title: "Antes de arquivar",
        text: "Certifique-se de que não há transações pendentes ou saldos que precisem ser movidos. Faça flush dos endereços e transfira fundos antes de arquivar. API keys do projeto serão revogadas automaticamente.",
      },
      {
        type: "code",
        language: "bash",
        code: '# Arquivar projeto via API\ncurl -X POST https://api.vaulthub.live/v1/projects/proj_abc123/archive \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "reason": "Projeto de testes finalizado",\n    "flush_remaining": true\n  }\'',
        filename: "archive-project.sh",
      },
      {
        type: "link-card",
        href: "/support/kb/co-sign/configurar-cosign",
        title: "Configurar Co-Sign",
        description:
          "Configure assinatura colaborativa para transações de alto valor",
      },
    ],
  },
];
