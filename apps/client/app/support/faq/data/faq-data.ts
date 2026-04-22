import type { FaqEntry } from "../../kb/components/types";

export const faqData: FaqEntry[] = [
  // Getting Started
  {
    question: "Como faço meu primeiro acesso ao portal?",
    answer: "Após o cadastro ser aprovado pelo administrador, você receberá um e-mail de convite com um link de ativação válido por 48 horas. Clique no link, defina sua senha, configure o 2FA obrigatório e aceite os termos de uso. Após isso, terá acesso completo ao dashboard.",
    category: "Primeiros Passos",
    tags: ["primeiro acesso", "login", "onboarding"],
  },
  {
    question: "Posso alterar meu e-mail de acesso?",
    answer: "A alteração de e-mail deve ser solicitada ao administrador da plataforma por questões de segurança. O processo inclui verificação de identidade e confirmação no novo e-mail. Durante a transição, o acesso é mantido no e-mail atual.",
    category: "Primeiros Passos",
    tags: ["e-mail", "conta", "configuração"],
  },
  {
    question: "O que é o Setup Wizard e quando devo usá-lo?",
    answer: "O Setup Wizard é um assistente guiado que ajuda na configuração inicial do seu projeto: seleção de chains, criação de wallets, configuração de webhook e geração de API key. Ele é apresentado no primeiro acesso e pode ser reexecutado pelo menu Projects > Setup Wizard.",
    category: "Primeiros Passos",
    tags: ["setup", "wizard", "configuração"],
  },
  // Wallets
  {
    question: "Quantas wallets posso criar?",
    answer: "O número de wallets depende do seu tier de serviço: Standard (5 por chain), Professional (50 por chain), Enterprise (ilimitado). Cada wallet pode gerar múltiplos endereços de depósito.",
    category: "Wallets",
    tags: ["wallet", "criar", "limites"],
  },
  {
    question: "Qual a diferença entre wallet managed e co-sign?",
    answer: "Wallet managed tem a chave gerenciada pela plataforma com assinatura direta — ideal para operações rápidas. Wallet co-sign usa Shamir Secret Sharing para dividir a chave entre múltiplos signatários, requerendo aprovações para transações — ideal para alto valor e compliance.",
    category: "Wallets",
    tags: ["wallet", "managed", "co-sign", "tipos"],
  },
  {
    question: "Posso converter uma wallet managed para co-sign?",
    answer: "Sim, a conversão de managed para co-sign é possível a qualquer momento. Porém, a operação é irreversível — não é possível voltar para managed após ativar co-sign. Planeje com cuidado antes de converter wallets com saldo significativo.",
    category: "Wallets",
    tags: ["wallet", "converter", "co-sign"],
  },
  // Transactions
  {
    question: "Quanto tempo leva para uma transação ser confirmada?",
    answer: "O tempo de confirmação depende da blockchain: Bitcoin (~30 min, 3 confirmações), Ethereum (~3 min, 12 confirmações), Polygon (~1 min, 30 confirmações), Tron (~1 min, 20 confirmações), BSC (~45s, 15 confirmações). A prioridade de gas também influencia.",
    category: "Transações",
    tags: ["transação", "confirmação", "tempo"],
  },
  {
    question: "Minha transação está pendente há muito tempo, o que fazer?",
    answer: "Transações pendentes geralmente são causadas por gas price baixo ou congestionamento da rede. Use a funcionalidade 'Speed Up' na página da transação para reenviar com gas price maior. O sistema substituirá a transação original usando o mesmo nonce.",
    category: "Transações",
    tags: ["transação", "pendente", "speed up"],
  },
  {
    question: "É possível cancelar uma transação após o envio?",
    answer: "Transações já submetidas à blockchain não podem ser canceladas diretamente. Se a transação ainda estiver pendente (não minerada), é possível substituí-la via Speed Up com valor enviado para você mesmo. Transações em status 'draft' ou 'pending_approval' podem ser canceladas normalmente.",
    category: "Transações",
    tags: ["transação", "cancelar", "reverter"],
  },
  // Deposits & Withdrawals
  {
    question: "Qual o valor mínimo de depósito?",
    answer: "Os valores mínimos variam por chain: ETH (0.001 ETH), BTC (0.0001 BTC), MATIC (1 MATIC), TRX (10 TRX), BNB (0.01 BNB). Para tokens ERC-20/TRC-20, o mínimo é geralmente 10 USDT equivalente. Depósitos abaixo do mínimo são acumulados até atingir o valor.",
    category: "Depósitos e Saques",
    tags: ["depósito", "mínimo", "valor"],
  },
  {
    question: "Enviei fundos na rede errada, é possível recuperar?",
    answer: "Infelizmente, fundos enviados na rede errada não podem ser recuperados pela plataforma. Sempre verifique cuidadosamente a rede de destino antes de enviar. A plataforma valida o formato do endereço, mas não pode verificar a rede de origem do envio.",
    category: "Depósitos e Saques",
    tags: ["depósito", "rede errada", "recuperar"],
  },
  {
    question: "Quanto tempo demora um withdrawal?",
    answer: "O tempo depende de vários fatores: se é auto-aprovado (1-5 min com fast gas), se requer aprovação co-sign (depende dos aprovadores) e se excede limites diários (requer aprovação administrativa). Após aprovação, o tempo de confirmação on-chain depende da chain e prioridade de gas.",
    category: "Depósitos e Saques",
    tags: ["withdrawal", "saque", "tempo"],
  },
  // API & Webhooks
  {
    question: "Como configuro webhooks para minha aplicação?",
    answer: "Acesse Integration > Webhooks, clique em 'Novo Webhook', informe a URL HTTPS de callback, selecione os eventos desejados e copie o secret gerado. Use o secret para validar assinaturas HMAC-SHA256 nos payloads recebidos. Teste com o botão 'Enviar Ping'.",
    category: "API e Integrações",
    tags: ["webhook", "configurar", "integração"],
  },
  {
    question: "Minha API key não está funcionando, o que verificar?",
    answer: "Verifique: 1) A key está correta e completa (prefixo vhk_live_ ou vhk_test_); 2) A key não foi revogada; 3) Está usando o header Authorization: Bearer corretamente; 4) O ambiente da key corresponde ao endpoint (live para produção, test para staging); 5) Seu IP está na allowlist (se configurada).",
    category: "API e Integrações",
    tags: ["API key", "erro", "troubleshooting"],
  },
  {
    question: "Qual é o rate limit da API?",
    answer: "Os limites variam por tier: Standard (60 req/min), Professional (300 req/min), Enterprise (1.000 req/min). Alguns endpoints têm limites específicos como criação de transações (10/min) e exportações (5/hora). Verifique os headers X-RateLimit-* nas respostas da API.",
    category: "API e Integrações",
    tags: ["rate limit", "API", "limites"],
  },
  // Co-Sign
  {
    question: "Como funciona o fluxo de aprovação co-sign?",
    answer: "Quando uma transação é criada em uma wallet co-sign, ela entra na fila de aprovação. Os signatários configurados recebem notificação e devem aprovar (com 2FA) dentro do prazo limite (padrão: 24h). Quando o threshold é atingido (ex: 2 de 3 aprovações), a transação é assinada e enviada à blockchain.",
    category: "Co-Sign",
    tags: ["co-sign", "aprovação", "fluxo"],
  },
  {
    question: "O que acontece se um signatário estiver indisponível?",
    answer: "Se um signatário estiver temporariamente indisponível (férias, doença), o share de backup pode ser ativado por um admin com verificação de identidade. Recomendamos sempre manter ao menos 1 share de backup configurado para contingência.",
    category: "Co-Sign",
    tags: ["co-sign", "signatário", "backup"],
  },
  // Security
  {
    question: "O que fazer se perdi acesso ao meu aplicativo 2FA?",
    answer: "Se possui os códigos de backup (fornecidos na ativação do 2FA), use um deles para fazer login e reconfigurar o 2FA com um novo dispositivo. Se não possui os códigos de backup, será necessário contatar o suporte administrativo para verificação de identidade (processo pode levar até 72 horas).",
    category: "Segurança",
    tags: ["2FA", "recuperação", "autenticador"],
  },
  {
    question: "Com que frequência devo rotacionar minhas API keys?",
    answer: "Recomendamos rotação a cada 90 dias como boa prática de segurança. A plataforma suporta rotação graceful: crie uma nova key, atualize sua aplicação para usar a nova key, e depois revogue a antiga. Nunca opere sem uma key funcional.",
    category: "Segurança",
    tags: ["API key", "rotação", "segurança"],
  },
  {
    question: "Recebi um e-mail pedindo minha senha/API key, é legítimo?",
    answer: "NÃO. A equipe CryptoVaultHub NUNCA pede senhas, API keys, seeds ou códigos 2FA por e-mail, chat ou telefone. Se receber qualquer mensagem solicitando essas informações, é uma tentativa de phishing. Não clique em links e reporte ao administrador imediatamente.",
    category: "Segurança",
    tags: ["phishing", "segurança", "e-mail"],
  },
];
