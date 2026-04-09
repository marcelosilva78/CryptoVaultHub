# IDENTIDADE VISUAL — CryptoVaultHub

## Stack Tecnica
- Tailwind CSS para toda estilizacao (NUNCA criar arquivos .css separados alem do globals.css para tokens)
- shadcn/ui como base de componentes, customizados via className
- Todos os valores visuais definidos como TOKENS SEMANTICOS no tailwind.config
- NUNCA usar valores hardcoded no codigo — sempre tokens semanticos
- NUNCA usar cores/radius/sombras padrao do Tailwind — apenas tokens deste documento
- A IA que implementa e RESPONSAVEL por criar SVGs originais e composicoes visuais unicas baseadas nas descricoes abaixo — NAO use decoracao generica (blobs, dot grids, particulas) como substituto
- A paleta usa UMA cor accent forte (Vault Gold) + neutros. NAO crie arco-iris de categorias. A identidade e uma cor so.
- Light mode E Dark mode sao obrigatorios. Dark mode e o padrao.

## Setup Necessario

### Libs adicionais
| Lib | Pra que | Instalacao |
|---|---|---|
| `framer-motion` | Animacoes de entrada, micro-interacoes, transicoes de wizard, hover responses | `npm i framer-motion` |
| `@fontsource/outfit` | Fonte display principal — geometrica, moderna, com excelente leitura numerica | `npm i @fontsource/outfit` |
| `@fontsource/jetbrains-mono` | Fonte mono para enderecos, hashes, JSONs, chaves privadas | `npm i @fontsource/jetbrains-mono` |

### Assets externos
| Asset | Pra que | Como gerar |
|---|---|---|
| Logo SVG (hexagono+chave) | Marca no sidebar, login, favicon | Descrito abaixo — implementar como SVG inline |
| Pattern topologico SVG | Textura ambiente de fundo | Gerar como SVG inline com paths procedurais |

---

## A Alma do App

**"O cofre digital onde cada transacao e um ato de transparencia e cada chave pertence a quem de direito."**

CryptoVaultHub nao e um dashboard de crypto generico. E o painel de controle de um cofre de alta seguranca — onde cada pixel comunica precisao, cada componente respira confianca, e cada dado e apresentado com a reverencia que valores financeiros exigem. A interface deve fazer o usuario sentir que esta operando um sistema construido por engenheiros que entendem que confianca se conquista na transparencia radical dos detalhes.

---

## Referencias e Principios

### Binance
- **Estrutura:** Dark-first design com superficies em camadas (3-4 niveis de escuro). Navegacao horizontal no topo para trading, mas sidebar para areas de gestao. Data-dense por design — informacao e poder, nao problema.
- **Linguagem:** Amarelo/gold (#F0B90B) como COR UNICA vibrante contra neutros escuros. Zero decoracao no UI funcional. Tipografia com clareza numerica excepcional. Borders finos de baixo contraste. Profundidade via cores de superficie, NAO sombras.
- **Riqueza:** Nenhuma ilustracao no trading UI — toda riqueza vem dos DADOS VIVOS (precos piscando, order book movendo, volumes se enchendo). A interface vive porque os dados vivem.
- **Principio extraido:** A riqueza visual de uma plataforma financeira NAO vem de ilustracoes bonitas — vem de DADOS que se movem, que pulsam, que contam uma historia em tempo real. Cada numero que muda e uma micro-animacao. Cada status que transita e uma narrativa visual.
- **Aplicacao no CVH:** Os componentes ricos do CVH nao terao blobs ou particulas — terao DADOS VIVOS: balances que atualizam com transicao numerica suave, confirmacoes que contam ao vivo, status de deployment que progridem organicamente, transacoes que piscam ao chegar.

### Linear
- **Principio extraido:** Clareza extrema na hierarquia tipografica. Uso magistral de espacamento e densidade controlada.
- **Aplicacao no CVH:** Hierarquia de 3 niveis maximos por card: titulo bold, valor em destaque, metadata muted. Sem ruido intermediario.

### Stripe Dashboard
- **Principio extraido:** Dados financeiros apresentados com elegancia editorial — como se cada tabela fosse uma pagina de revista financeira de alto padrao.
- **Aplicacao no CVH:** Tabelas de transacoes devem ter a cadencia visual de um statement bancario premium — alinhamento perfeito, tipografia tabular, ritmo vertical consistente.

---

## Decisoes de Identidade

### ESTRUTURA

#### Navegacao
**O que:** Sidebar fixa esquerda com hierarquia de 3 zonas: identidade (logo + nome), navegacao principal (secoes agrupadas com headers muted), e footer (usuario + logout). A sidebar funciona como a porta do cofre — e o primeiro elemento que comunica autoridade.
**Por que:** A sidebar fixa cria permanencia e orientacao em um app com muitas secoes. Diferente de uma top-nav que some em scroll, a sidebar e um ancora visual constante. O usuario sempre sabe ONDE esta.
**Como:** Largura fixa usando token `sidebar-w`. Background em `surface-sidebar`. Border-right 1px em `border-default`. Logo area com altura fixa. Secoes separadas por headers em `text-muted` uppercase tracking-wide. Item ativo indicado por barra vertical esquerda 3px em `accent-primary` + background em `accent-subtle`.
**Nunca:** Sidebar colapsavel para icones-only (perde a legibilidade). Sidebar transparente ou glassmorphism (perde autoridade). Icons sem label (perde clareza).

#### Layout de Conteudo
**O que:** Grid assimetrico adaptativo. O conteudo principal ocupa todo o espaco horizontal disponivel, com grids de 2, 3 ou 4 colunas para cards de resumo no topo, seguidos de secoes de dados (tabelas, accordions, charts) abaixo.
**Por que:** A assimetria controlada (sidebar fixa + conteudo fluido) cria tensao visual produtiva. O conteudo "respira" enquanto a sidebar ancora.
**Como:** Main content com `ml-sidebar-w mt-header-h p-content`. Stat cards em grid responsivo. Tabelas em container full-width. Charts ao lado de tabelas quando ha dados complementares.
**Nunca:** Conteudo centralizado com margens largas (desperidca espaco). Cards todos do mesmo tamanho (perde hierarquia). Scroll horizontal em tabelas (reformate os dados).

#### Hierarquia Visual
**O que:** Cada pagina segue o padrao "Contexto → Resumo → Detalhe": primeiro o titulo e breadcrumb (onde estou), depois os stat cards (visao geral rapida), depois os dados completos (tabelas, accordions, charts).
**Por que:** O usuario de uma plataforma financeira precisa de "glanceability" — entender o estado geral em 2 segundos antes de mergulhar nos detalhes.
**Como:** Titulo h1 com `text-primary` peso 700. Stat cards imediatamente abaixo. Separacao visual entre resumo e detalhe via espacamento vertical generoso (nao por divisores ou bordas).
**Nunca:** Dados detalhados antes do resumo. Cards de acao antes do contexto. Modal como primeira interacao.

---

### LINGUAGEM

#### Tipografia
**O que:** Dual-font system. Outfit (display, geometric) para toda interface — titulos, labels, navegacao, botoes. JetBrains Mono (monospace) exclusivamente para dados de blockchain — enderecos, hashes, chaves, JSONs, amounts em crypto.
**Por que:** A dualidade fonte-display / fonte-mono comunica dois mundos: a gestao humana (Outfit, legivel, acolhedora) e a maquina blockchain (JetBrains Mono, precisa, tecnica). Quando o usuario ve monospace, sabe instintivamente: "isso e dado da chain". Quando ve Outfit, sabe: "isso e a interface falando comigo". Essa distincao semiotica e PODEROSA em um app de crypto.
**Como:** Outfit como `font-display` em pesos 300-800. JetBrains Mono como `font-mono` em pesos 400-700. Titulos de pagina em Outfit 700 tamanho `text-heading`. Valores de stat cards em Outfit 700 tamanho `text-stat`. Enderecos ETH, tx hashes, JSONs, chaves em JetBrains Mono 500 tamanho `text-code`. Amounts de tokens com parte inteira em Outfit 600 e decimais em Outfit 400 opacidade reduzida.
**Nunca:** Monospace para textos de interface (labels, menus, titulos). Display font para enderecos blockchain. Misturar pesos aleatorios — cada peso tem proposito definido.

#### Cor como Sistema — A Regra do Gold
**O que:** Vault Gold (`#E2A828`) e a COR UNICA da marca. Aparece em: logo, botoes primarios, links ativos, item de nav ativo, badges de destaque, acentos de graficos, bordas de foco, indicadores de progresso, e glow de elementos interativos. Todo o restante e escala de neutros com undertone azul-frio (dark mode) ou neutros quentes sutis (light mode).
**Por que:** O gold comunica valor, seguranca, premium. Contra um fundo escuro (dark mode), o gold brilha com autoridade — como iluminacao de cofre de banco. Contra fundo claro (light mode), o gold ancora como selo de autenticidade. A unicidade da cor e o que cria reconhecimento instantaneo: se ve gold nesse tom, e CVH.
**Como:** `accent-primary` para o gold puro. `accent-hover` para hover 10% mais escuro. `accent-subtle` para backgrounds translucidos (gold com 8-12% opacidade). Status colors (green, red, amber) APENAS para feedback funcional — confirmacao, erro, alerta — NUNCA como categorias visuais. Charts usam uma paleta monocromatica derivada: gold, gold-muted, gold-faded, com green/red apenas para up/down financeiro.
**Nunca:** Usar blue como accent (isso e Coinbase). Criar categorias coloridas (chains com cores diferentes). Usar gradientes como cor de marca. Ter mais de uma cor vibrante na tela ao mesmo tempo (exceto green/red em dados financeiros).

#### Geometria
**O que:** Radius moderado — nem sharp-angular (muito "terminal"), nem pill-round (muito "consumer app"). O radius do CVH e `8px` para cards e botoes, `6px` para inputs e badges menores, `12px` para containers elevados (modais, dropdowns). A geometria hexagonal do logo (referencia a blocos de blockchain) aparece sutilmente como motif em headers de secao e como forma de avatares de chain.
**Por que:** O radius 8px esta no sweet spot entre profissionalismo e modernidade. Comunica "software premium" sem parecer nem um terminal financeiro dos anos 2000 nem um app de wellness.
**Como:** Tokens `radius-card` (8px), `radius-button` (8px), `radius-input` (6px), `radius-badge` (6px), `radius-modal` (12px), `radius-full` (9999px para pills). Avatares de chains (ETH, BSC, etc.) em formato hexagonal (clip-path) ao inves de circular — reforco sutil do DNA blockchain.
**Nunca:** rounded-full em cards (muito bubbly). Cantos retos em tudo (muito brutalist). Misturar radius aleatoriamente no mesmo contexto.

#### Profundidade
**O que:** Profundidade via CAMADAS DE SUPERFICIE, nao sombras. Dark mode usa 4 niveis: page (mais escuro), card, elevated, hover (mais claro). Light mode usa 3 niveis: page (mais claro), card (branco), elevated (branco com borda). Sombras sao SUTIS e usadas apenas em elementos flutuantes (modais, dropdowns, tooltips) — nunca em cards ou botoes estaticos.
**Por que:** Binance nos ensina: sombras competem com dados por atencao visual. Em um app que exibe dezenas de numeros, enderecos e status, cada pixel de sombra e ruido. A profundidade por camadas de cor e "silenciosa" — cria hierarquia espacial sem adicionar peso visual.
**Como:** Dark mode: `surface-page` (#08090B) → `surface-card` (#111318) → `surface-elevated` (#1A1D25) → `surface-hover` (#22252F). Light mode: `surface-page` (#F5F6F8) → `surface-card` (#FFFFFF) → `surface-elevated` (#FFFFFF com borda). Sombras apenas em `shadow-float` para modais e dropdowns. Transicoes de hover via mudanca de background, nao sombra.
**Nunca:** Shadow-md ou shadow-lg em cards estaticos. Glassmorphism como padrao (usar pontualmente se necessario, em overlay de modal). Sombras coloridas (gold glow em cards — isso e decoracao, nao profundidade).

#### Iconografia
**O que:** Lucide React como base, mas com tratamento especifico: icones em `text-muted` no estado default, transitando para `accent-primary` quando ativos/hover. Tamanho padrao 16px (w-4 h-4) para nav, 14px para inline com texto. Icones de chain (ETH, BNB, MATIC, etc.) como SVGs custom em hexagono.
**Por que:** Icones Lucide sao geometricamente limpos e combinam com a Outfit. O tratamento muted→gold no hover cria um micro-momento de marca a cada interacao.
**Como:** Nav icons em `text-muted` → `text-accent` no active. Icones de acao em botoes SEMPRE acompanhados de label (nunca icon-only, exceto acoes universais como close/refresh). Status icons (check, x, clock) herdam a cor do status (green, red, amber).
**Nunca:** Emojis no lugar de icones. Icones coloridos por padrao (so ganham cor no active/hover ou quando indicam status). Icones de tamanhos inconsistentes no mesmo contexto.

---

### RIQUEZA VISUAL

#### Textura Ambiente
**O que:** Um pattern topologico sutil inspirado em redes de blockchain — nos (circulos pequenos) conectados por linhas finas formando uma malha irregular, como um grafo distribuido. Esse pattern vive no fundo da pagina, atras de todo o conteudo.
**Tematica:** A topologia de rede referencia diretamente a natureza distribuida da blockchain — nos conectados, sem centro, formando um tecido de confianca. E o DNA visual do produto materializado como textura.
**Tratamento:** SVG inline com `position: fixed`, cobrindo o viewport. Opacidade 3% em dark mode, 2% em light mode. Cor: `accent-primary` (gold) para os nos e linhas — em opacidade tao baixa que parece monocromatico neutro, mas em zoom fica evidente o gold. O pattern NAO se move — e estatico, como uma marca d'agua estrutural. Tamanho dos nos: 2-3px. Espacamento entre nos: 40-60px irregular. Linhas de conexao: 0.5px de espessura.

#### Conceitos Visuais por Componente

##### Card de Saldo Total (Dashboard — o card PRINCIPAL)
**Representa:** O valor total custodiado — o "quanto de ouro esta no cofre". E o numero que o CEO olha primeiro. Nao e um numero — e a saude do negocio.
**Metafora visual:** Um vault meter — como o medidor de pressao de um cofre industrial. Um arco semicircular (gauge) preenchido proporcionalmente ao saldo, com marcadores de escala ao longo do arco. No centro do arco, o valor em destaque. Abaixo do arco, uma barra horizontal mostra a composicao por chain (segmentos proporcionais coloridos apenas por tons de gold — do claro ao escuro — NAO cores diferentes por chain).
**Cena detalhada:** O arco semicircular tem 180 graus, com largura de stroke de 6px. O fundo do arco e `surface-elevated` com opacidade 30%. O preenchimento e um gradient de `accent-primary` para `accent-hover`, indo de 0 (esquerda) ate o percentual do saldo em relacao a um maximo historico. Marcadores de escala sao tracos pequenos (8px) a cada 20% do arco, em `text-muted`. O valor ($12,847,293.48) esta centrado no arco em Outfit 800, tamanho `text-display` (32px). Abaixo, "Total Custody Balance" em `text-muted` Outfit 400 uppercase tracking-wide. A barra de composicao e um retangulo arredondado (radius-badge) com altura 6px, dividido em segmentos proporcionais: cada segmento usa um tom de gold (do mais claro ao mais escuro), com tooltip on hover mostrando chain+valor.
**Viabilidade:** CODIGO PURO — SVG path para o arco, CSS para a barra de composicao.

##### Card de Wallet (Lista de wallets expandivel)
**Representa:** Uma wallet individual — um compartimento do cofre. Cada wallet e um mini-cofre com seu proprio endereco, chave, e historico. O card deve comunicar: "este compartimento contem X e esta sob controle".
**Metafora visual:** Um container de seguranca modular. O header do card e como a plaqueta de identificacao de um cofre: numero da gaveta (address), tipo (hot/cold), e indicador de status (LED de seguranca). Quando expandido, o interior revela camadas de informacao como se voce abrisse o compartimento e visse cada artefato dentro dele.
**Cena detalhada:** O header (quando colapsado) tem: a esquerda, um hexagono (clip-path) de 32px com o icone/inicial da chain dentro; ao lado, o endereco em monospace truncado com botao de copy; depois, um "LED" — um circulo de 8px que pulsa sutilmente em green (active), amber (pending), ou permanece red (inactive). A direita, o saldo em Outfit 600 com o simbolo do token, e uma seta de expandir/colapsar que rotaciona 180 graus com transition suave. Quando expandido, os dados internos entram com stagger animation (cada secao aparece com 50ms de delay): endereco completo, owner, contract details, creation JSON (em container monospace com syntax highlight e botao copy/download), forwarders vinculados (mini-lista com hexagonos de chain).
**Viabilidade:** CODIGO PURO — CSS clip-path para hexagono, framer-motion para stagger e rotacao, SVG para LED pulsante.

##### Modal de Transacao (JSON Detail — o componente de TRANSPARENCIA)
**Representa:** A prova irrefutavel. Cada transacao e um registro imutavel na blockchain, e este modal e a janela para essa verdade. Deve transmitir: "voce esta lendo o registro permanente — nada esta escondido".
**Metafora visual:** Um terminal de inspecao forense. O modal e visualmente dividido em "camadas de evidencia" — como abas de um dossiê. Cada secao colapsavel e uma "pagina do dossiê" com header tipografico forte e conteudo que revela detalhes progressivamente.
**Cena detalhada:** O modal abre com backdrop blur sutil (4px) e fade-in do conteudo de baixo para cima (12px translateY). O conteudo tem um header fixo com: tx hash em monospace (truncado com copy), status badge, e timestamp completo. Abaixo, secoes colapsaveis com headers que tem uma linha horizontal se estendendo ate a borda direita (como um formulario oficial). Cada secao: um titulo em Outfit 600 uppercase tracking-wide, o conteudo em grid de 2 colunas (label em `text-muted`, valor em `text-primary` monospace). A secao de JSON completo tem: fundo `surface-page` (o mais escuro), font monospace, syntax highlighting com gold para chaves, green para strings, blue para numeros, amber para booleans, `text-muted` para pontuacao. Um botao "Copy JSON" flutua no canto superior direito com icone + label. Ao copiar, o botao transita de "Copy" para "Copied!" com checkmark em green por 2 segundos.
**Viabilidade:** CODIGO PURO — CSS grid para layout, transition para copy feedback, colores customizados para syntax highlight.

##### Setup Wizard Steps (Indicador de progresso)
**Representa:** A jornada de configuracao — o caminho do "acabei de chegar" ate "meu cofre esta operacional". Nao e um checklist — e uma travessia com marcos claros.
**Metafora visual:** Uma chain de blocos — literalmente uma blockchain visual. Cada step e um "bloco" conectado ao proximo por um "link" (segmento de linha). Os blocos completados sao solidos (gold), o bloco atual pulsa sutilmente, e os futuros sao wireframe (apenas borda).
**Cena detalhada:** Uma linha horizontal com 7 blocos (hexagonos de 28px) igualmente espacados. Cada hexagono completado: preenchimento `accent-primary`, icone de checkmark branco dentro, 2px. Hexagono atual: borda 2px em `accent-primary`, preenchimento `accent-subtle`, numero do step dentro, com animacao de pulse lento (scale 1.0 → 1.05 → 1.0 em 2s ease-in-out). Hexagonos futuros: borda 1px em `border-default`, preenchimento transparente, numero em `text-muted`. Os segmentos de conexao entre hexagonos: linha de 2px de espessura; completados em `accent-primary`, em andamento como gradient de `accent-primary` para `border-default`, futuros em `border-default`. Abaixo de cada hexagono, o label do step em `text-muted` text-xs. Abaixo do hexagono ativo, label em `accent-primary` font-semibold.
**Viabilidade:** CODIGO PURO — SVG paths para hexagonos e linhas, CSS animation para pulse.

##### Card de Deploy de Contrato (Status de deployment)
**Representa:** O momento mais critico do setup — smart contracts sendo implantados na blockchain. E como assistir a construcao das paredes do cofre em tempo real. O usuario precisa sentir: "algo esta acontecendo na chain, e eu estou vendo".
**Metafora visual:** Um pipeline de fabricacao — cada contrato e uma "peca" sendo forjada. A metafora e industrial: materia-prima entra (gas + bytecode), passa por etapas de processamento (broadcasting, mining, confirming), e sai como artefato deployado (contract address).
**Cena detalhada:** Uma lista vertical de deployment steps (Factory, Implementation, First Forwarder). Cada step tem 4 estados visuais:
1. *Pending*: icone hexagonal wireframe (borda `border-default`), label em `text-muted`, sem detalhes.
2. *Deploying*: hexagono com borda `accent-primary` e animacao de "forja" — um arco que gira ao redor do hexagono (stroke-dasharray animado, como um spinner mas em formato hexagonal). Label em `text-primary`. Abaixo, texto "Broadcasting to network..." em `text-muted` com 3 dots animados.
3. *Confirming*: hexagono preenchido `accent-subtle`, borda `accent-primary`. Abaixo, barra de progresso fina (2px) mostrando confirmacoes (ex: 4/12), a barra preenchendo da esquerda em `accent-primary`. Tx hash aparece em monospace clicavel.
4. *Confirmed*: hexagono preenchido `accent-primary` com checkmark branco. Abaixo, contract address em monospace com copy button, e link para explorer. Badge "Deployed" em `accent-subtle` com texto `accent-primary`.

Entre os steps, uma linha vertical de 2px conecta os hexagonos — ja completada em `accent-primary`, em andamento como dash animado, futura em `border-default`.
**Viabilidade:** CODIGO PURO — SVG para hexagono spinner (stroke-dashoffset animado), CSS transitions para estados, framer-motion para entrada dos detalhes.

##### Live Balance (Componente de saldo ao vivo)
**Representa:** O pulso do cofre — o numero que prova que "os fundos estao aqui, agora, neste instante". Nao e um numero estatico — e um heartbeat financeiro.
**Metafora visual:** Um display de instrumentacao de precisao, como um multimetro digital ou um display de um cofre eletronico — onde o numero e grande, claro, inconfundivel, e mostra sinais de vida (o ponto piscando, o "ultimo update" recem-atualizado).
**Cena detalhada:** O valor em Outfit 800, tamanho grande (28-32px dependendo do contexto). A parte inteira em `text-primary` full opacity. Os decimais (apos o ponto) em Outfit 400 opacity 50%. O simbolo do token (ETH, BNB, etc.) em `text-muted` ao lado do valor. Quando o valor muda: os digitos que mudam fazem uma micro-animacao de slide vertical — o digito antigo sobe e desaparece enquanto o novo sobe de baixo. Duracao: 300ms ease-out. Ao lado do valor, um pequeno indicador circular (6px) que funciona como "heartbeat": ele pisca em gold (opacity 100% → 30% → 100%) a cada 5 segundos, indicando "estou monitorando ao vivo". Abaixo do valor, "Last updated: 3s ago" em text-xs `text-muted` — o tempo se atualiza a cada segundo. Ao lado, um icone de refresh clicavel que, ao clicar, faz o heartbeat fazer uma pulsacao forte unica (scale 1 → 1.5 → 1 em 200ms) confirmando o refresh.
**Viabilidade:** CODIGO PURO — framer-motion AnimatePresence para slide de digitos, CSS animation para heartbeat.

---

## Tokens de Design

### Cores — Fundos (Dark Mode — PADRAO)
| Token | Valor | Uso |
|---|---|---|
| `surface-page` | `#08090B` | Fundo principal da pagina — o mais profundo |
| `surface-sidebar` | `#0D0F14` | Fundo da sidebar — levemente mais claro que page |
| `surface-card` | `#111318` | Cards, paineis, containers de conteudo |
| `surface-elevated` | `#1A1D25` | Elementos elevados: dropdowns, tooltips, sections internas |
| `surface-hover` | `#22252F` | Estado hover de rows, nav items, elementos interativos |
| `surface-input` | `#0F1116` | Fundo de inputs e selects |

### Cores — Fundos (Light Mode)
| Token | Valor | Uso |
|---|---|---|
| `surface-page` | `#F4F5F7` | Fundo principal — cinza perola levemente quente |
| `surface-sidebar` | `#FFFFFF` | Sidebar — branco puro com borda sutil |
| `surface-card` | `#FFFFFF` | Cards — branco puro |
| `surface-elevated` | `#FFFFFF` | Elevados — branco com borda mais visivel |
| `surface-hover` | `#F0F1F3` | Hover — cinza sutil |
| `surface-input` | `#F7F8FA` | Inputs — cinza levemente mais claro que page |

### Cores — Texto (Dark Mode)
| Token | Valor | Uso |
|---|---|---|
| `text-primary` | `#E8E9ED` | Titulos, valores, textos principais |
| `text-secondary` | `#858A9B` | Textos de apoio, labels, metadata |
| `text-muted` | `#4E5364` | Placeholders, hints, headers de secao |

### Cores — Texto (Light Mode)
| Token | Valor | Uso |
|---|---|---|
| `text-primary` | `#111318` | Titulos, valores, textos principais |
| `text-secondary` | `#5C6070` | Textos de apoio, labels, metadata |
| `text-muted` | `#9CA0AE` | Placeholders, hints, headers de secao |

### Cores — Accent (UMA COR: Vault Gold)
| Token | Valor | Uso |
|---|---|---|
| `accent-primary` | `#E2A828` | A COR da marca — botoes, links, nav ativo, badges, acentos de chart, indicadores de progresso, bordas de foco |
| `accent-hover` | `#C9941F` | Hover state — 10% mais profundo |
| `accent-subtle` | `rgba(226, 168, 40, 0.10)` | Backgrounds translucidos — badges, nav active bg, card highlights |
| `accent-glow` | `rgba(226, 168, 40, 0.06)` | Glow muito sutil — apenas textura ambiente de elementos gold |
| `accent-text` | `#0D0F14` | Texto SOBRE botoes gold (dark, quase preto) — contraste maximo |

### Cores — Status (APENAS para feedback funcional)
| Token | Valor | Uso |
|---|---|---|
| `status-success` | `#2EBD85` | Confirmado, deployed, active — APENAS resultado positivo |
| `status-success-subtle` | `rgba(46, 189, 133, 0.10)` | Background de badges de sucesso |
| `status-error` | `#F6465D` | Erro, falha, rejected — APENAS comunicando problema |
| `status-error-subtle` | `rgba(246, 70, 93, 0.10)` | Background de badges de erro |
| `status-warning` | `#F5A623` | Pendente, processing, atencao — APENAS alerta |
| `status-warning-subtle` | `rgba(245, 166, 35, 0.10)` | Background de badges de warning |

### Cores — Chart (monocromatica gold + funcional)
| Token | Valor | Uso |
|---|---|---|
| `chart-primary` | `#E2A828` | Linha/area principal — gold da marca |
| `chart-secondary` | `#B8892A` | Segunda metrica — gold mais escuro |
| `chart-tertiary` | `#8A6820` | Terceira metrica — gold ainda mais escuro |
| `chart-faded` | `rgba(226, 168, 40, 0.20)` | Preenchimento de area charts |
| `chart-up` | `#2EBD85` | Valor subindo (buy/deposit/profit) |
| `chart-down` | `#F6465D` | Valor caindo (sell/withdrawal/loss) |

### Bordas
| Token | Valor Dark | Valor Light | Uso |
|---|---|---|---|
| `border-default` | `#1E2028` | `#E2E4E8` | Contornos padrão de cards e containers |
| `border-subtle` | `#151820` | `#ECEDF0` | Contornos internos — separadores de row, dividers |
| `border-focus` | `#E2A828` | `#E2A828` | Borda de foco em inputs (accent-primary) |

### Geometria
| Token | Valor | Uso |
|---|---|---|
| `radius-card` | `8px` | Cards, paineis principais |
| `radius-button` | `8px` | Botoes de acao |
| `radius-input` | `6px` | Inputs, selects, textareas |
| `radius-badge` | `6px` | Badges, chips, tags |
| `radius-modal` | `12px` | Modais, drawers, dialogs |
| `radius-pill` | `9999px` | Pills (status dots, toggles) |

### Sombras
| Token | Valor Dark | Valor Light | Uso |
|---|---|---|---|
| `shadow-card` | `none` | `0 1px 3px rgba(0,0,0,0.04)` | Cards (no dark: sem sombra, profundidade por cor) |
| `shadow-hover` | `none` | `0 2px 8px rgba(0,0,0,0.06)` | Hover em cards (apenas light mode) |
| `shadow-float` | `0 8px 30px rgba(0,0,0,0.4)` | `0 8px 30px rgba(0,0,0,0.12)` | Modais, dropdowns, tooltips |
| `shadow-glow` | `0 0 20px rgba(226,168,40,0.08)` | `0 0 20px rgba(226,168,40,0.06)` | Glow sutil em elementos gold (pontual) |

### Espacamento
| Token | Valor | Uso |
|---|---|---|
| `sidebar-w` | `240px` | Largura da sidebar |
| `header-h` | `56px` | Altura do header |
| `content-p` | `24px` | Padding do conteudo principal |
| `card-p` | `20px` | Padding interno de cards |
| `section-gap` | `24px` | Gap entre secoes de conteudo |
| `stat-grid-gap` | `16px` | Gap entre stat cards no grid |

### Transicoes
| Token | Valor | Uso |
|---|---|---|
| `transition-fast` | `150ms ease` | Hover, focus, micro-interacoes |
| `transition-normal` | `250ms ease-out` | Expansao, colapso, mudanca de estado |
| `transition-slow` | `400ms ease-in-out` | Entrada de pagina, modal, wizard steps |

---

## Componentes Shadcn — Overrides

| Componente | Override (usando tokens) |
|---|---|
| `<Card>` | `bg-surface-card border-border-default rounded-radius-card shadow-shadow-card` |
| `<Button variant="default">` | `bg-accent-primary text-accent-text font-semibold rounded-radius-button hover:bg-accent-hover transition-transition-fast` |
| `<Button variant="outline">` | `bg-transparent border-border-default text-text-secondary rounded-radius-button hover:border-accent-primary hover:text-text-primary transition-transition-fast` |
| `<Button variant="ghost">` | `bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-transition-fast` |
| `<Badge>` | `bg-accent-subtle text-accent-primary font-semibold rounded-radius-badge text-xs` |
| `<Badge variant="success">` | `bg-status-success-subtle text-status-success font-semibold rounded-radius-badge text-xs` |
| `<Badge variant="error">` | `bg-status-error-subtle text-status-error font-semibold rounded-radius-badge text-xs` |
| `<Badge variant="warning">` | `bg-status-warning-subtle text-status-warning font-semibold rounded-radius-badge text-xs` |
| `<Input>` | `bg-surface-input border-border-default rounded-radius-input text-text-primary placeholder:text-text-muted focus:border-border-focus focus:ring-1 focus:ring-accent-glow transition-transition-fast` |
| `<Select>` | `bg-surface-input border-border-default rounded-radius-input text-text-primary` |
| `<Table>` | `bg-surface-card border-border-default rounded-radius-card overflow-hidden` |
| `<TableHeader>` | `bg-surface-elevated` |
| `<TableHead>` | `text-text-muted text-xs uppercase tracking-widest font-semibold` |
| `<TableRow>` | `border-b-border-subtle hover:bg-surface-hover transition-transition-fast` |
| `<TableCell>` | `text-text-primary text-sm` |
| `<Dialog>` | `bg-surface-card border-border-default rounded-radius-modal shadow-shadow-float` |
| `<DialogOverlay>` | `bg-black/60 backdrop-blur-[4px]` |
| `<Avatar>` | `rounded-radius-card` (hexagonal clip-path para avatares de chain) |
| `<Tabs>` | `border-b-border-default` |
| `<TabsTrigger>` | `text-text-muted data-[state=active]:text-accent-primary data-[state=active]:border-b-2 data-[state=active]:border-accent-primary font-medium transition-transition-fast` |
| `<Tooltip>` | `bg-surface-elevated border-border-default rounded-radius-input shadow-shadow-float text-text-primary text-xs` |
| `<Separator>` | `bg-border-subtle` |
| `<ScrollArea>` | `scrollbar-thumb:bg-border-default scrollbar-track:bg-surface-page` |

---

## Logo — CryptoVaultHub

**Conceito:** Um hexagono (referencia blockchain) com uma abertura central em forma de fechadura (referencia vault/cofre). As linhas do hexagono tem cantos levemente arredondados. Dentro da fechadura, uma forma de chave simplificada — um circulo (cabeca da chave) conectado a um retangulo com dentes (corpo da chave). Tudo em uma unica cor (accent-primary).

**Wordmark:** "CryptoVaultHub" ao lado do icone. "Crypto" em Outfit 400, "Vault" em Outfit 700 (enfase na palavra central), "Hub" em Outfit 400. Tudo em `text-primary`. Na sidebar, pode ser abreviado para o icone + "CVH" em Outfit 700.

---

## Modos de Cor — Implementacao

### Dark Mode (padrao)
- Class `dark` no `<html>` como default
- Todas as variaveis CSS usam valores dark
- Textura ambiente gold em opacity 3%
- Sombras: apenas `shadow-float` em modais

### Light Mode
- Class removida do `<html>` ou class `light`
- Variaveis CSS switcham para valores light
- Textura ambiente gold em opacity 2%
- Sombras: `shadow-card` e `shadow-hover` ativos
- Cards ganham borda `border-default` mais visivel (compensar a perda de contraste de superficie)

### Toggle
- Icone de sol/lua no header
- Transicao suave de 300ms em todas as variaveis
- Preferencia salva em localStorage
- Respeita `prefers-color-scheme` como valor inicial

---

## Regra de Ouro

Ao criar qualquer tela ou componente:
1. Siga TODAS as decisoes de identidade (estrutura + linguagem + riqueza visual)
2. Use shadcn/ui como base, customizado via className
3. APENAS tokens semanticos — nunca valores crus
4. UMA cor accent (Vault Gold) para tudo — a interface inteira usa base neutra + gold. Nenhuma outra cor vibrante
5. Componentes importantes DEVEM ter CONCEITO VISUAL — dados vivos, metaforas de cofre/blockchain, nao decoracao generica
6. NAO substitua conceito por decoracao — blobs e dot grids sao proibidos. A riqueza vem de dados que se movem e metaforas visuais que contam historias
7. A IA implementadora e RESPONSAVEL por criar SVGs e composicoes visuais ORIGINAIS baseadas nas descricoes de cena
8. **"O cofre digital onde cada transacao e um ato de transparencia."**

## Teste Final
Coloque a interface ao lado de um dashboard shadcn padrao. A diferenca deve ser obvia em TRES niveis:
- **ESTRUTURA:** Sidebar como porta de cofre, hierarquia Contexto→Resumo→Detalhe, data-dense
- **LINGUAGEM:** Dual-font (Outfit + JetBrains Mono) com separacao semantica display/blockchain, UMA cor gold forte, hexagonos como DNA geometrico, profundidade por superficie nao por sombra
- **RIQUEZA:** Vault meter gauge para saldos, hexagonal blockchain step indicator, LED pulsante em wallets, pipeline de forja para deployments, heartbeat em balances ao vivo, terminal forense para JSONs de transacao — cada componente conta a HISTORIA do que representa, nao tem decoracao generica

Se os cards tiverem blobs e dot grids mas NAO tiverem conceitos visuais unicos, esta INCOMPLETO.
Se a interface usar 4+ cores vibrantes ao inves de UMA cor gold + neutros, esta ERRADO.
Se os dados nao tiverem micro-animacoes de atualizacao ao vivo, esta MORTO.
