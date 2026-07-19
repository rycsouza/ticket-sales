Atue como um *Product Designer Sênior e Front-end Specialist*, com experiência em sistemas SaaS, plataformas administrativas, produtos B2B e aplicações whitelabel.

Analise o sistema existente e aplique diretamente uma nova identidade visual completa em *light mode*, criando uma interface moderna, consistente, acessível e pronta para produção.

Não crie uma página de style guide, documentação visual ou apresentação separada.

O próprio sistema entregue deverá representar e consolidar o novo style guide por meio de seus componentes, telas, layouts, estados e padrões de interação.

## Objetivo

Refatore visualmente toda a aplicação existente, preservando:

* Regras de negócio
* Funcionalidades atuais
* Fluxos de navegação
* Estrutura de dados
* Integrações
* Permissões
* Conteúdo funcional
* Comportamentos existentes

A alteração deve se concentrar na interface, experiência do usuário, responsividade, consistência visual e arquitetura de estilos.

Não remova funcionalidades e não simplifique fluxos sem necessidade.

## Direção visual

Aplique uma estética:

* Light mode
* Moderna e minimalista
* Profissional
* Adequada para sistemas administrativos
* Visualmente leve
* Com bastante respiro
* Alta legibilidade
* Hierarquia clara
* Baixo ruído visual
* Componentes reutilizáveis
* Aparência de produto SaaS maduro
* Preparada para diferentes marcas

Evite:

* Gradientes excessivos
* Glassmorphism
* Sombras pesadas
* Elementos decorativos sem função
* Cores saturadas em grandes áreas
* Bordas exageradamente arredondadas
* Excesso de linhas divisórias
* Excesso de cards dentro de cards
* Uso da cor da marca em todos os elementos
* Interfaces com aparência de template genérico

## Arquitetura whitelabel

O sistema será whitelabel.

Toda a personalização visual da marca deve ser controlada por variáveis, tokens ou propriedades globais, sem necessidade de alterar individualmente os componentes.

Utilize tokens semânticos, como:

* --brand-primary
* --brand-primary-hover
* --brand-primary-active
* --brand-primary-soft
* --brand-primary-border
* --brand-primary-foreground
* --brand-secondary
* --background-page
* --background-surface
* --background-subtle
* --background-hover
* --border-subtle
* --border-default
* --border-strong
* --text-primary
* --text-secondary
* --text-muted
* --state-success
* --state-warning
* --state-danger
* --state-info

Não utilize nomes como blue, purple ou green para tokens ligados à marca.

A cor configurável da marca deverá ser aplicada principalmente em:

* Botões primários
* Links
* Tabs ativas
* Item ativo da navegação
* Checkboxes
* Radio buttons
* Switches
* Focus rings
* Indicadores de seleção
* Barras de progresso
* Elementos interativos selecionados
* Primeira série dos gráficos
* Pequenos destaques visuais

Não preencher toda a sidebar, header ou grandes superfícies com a cor principal da marca.

## Paleta neutra base

Utilize os seguintes valores como base do light mode:

### Backgrounds

* Página: #F6F7F9
* Superfície principal: #FFFFFF
* Superfície secundária: #F9FAFB
* Hover neutro: #F3F4F6
* Seleção neutra: #EEF1F5
* Overlay: rgba(15, 23, 42, 0.45)

### Textos

* Texto principal: #111827
* Texto secundário: #374151
* Texto discreto: #6B7280
* Texto desabilitado: #9CA3AF
* Placeholder: #9CA3AF
* Texto sobre fundo escuro: #FFFFFF

### Bordas

* Borda sutil: #E5E7EB
* Borda padrão: #D1D5DB
* Borda forte: #9CA3AF
* Divisor: #EAECF0

## Cor de marca padrão

Utilize inicialmente o azul como tema padrão:

* Primary: #2563EB
* Hover: #1D4ED8
* Active: #1E40AF
* Soft background: #EFF6FF
* Soft border: #BFDBFE
* Foreground: #FFFFFF

A implementação deve permitir substituir essa cor posteriormente por configuração.

Sugestões de temas que o sistema deverá suportar:

### Roxo tecnológico

* Primary: #7C3AED
* Hover: #6D28D9
* Active: #5B21B6
* Soft: #F5F3FF
* Border: #DDD6FE

### Verde operacional

* Primary: #059669
* Hover: #047857
* Active: #065F46
* Soft: #ECFDF5
* Border: #A7F3D0

### Laranja comercial

* Primary: #EA580C
* Hover: #C2410C
* Active: #9A3412
* Soft: #FFF7ED
* Border: #FED7AA

### Ciano contemporâneo

* Primary: #0891B2
* Hover: #0E7490
* Active: #155E75
* Soft: #ECFEFF
* Border: #A5F3FC

### Rosa sofisticado

* Primary: #DB2777
* Hover: #BE185D
* Active: #9D174D
* Soft: #FDF2F8
* Border: #FBCFE8

Quando uma cor configurada não possuir contraste suficiente com branco, utilize automaticamente um foreground escuro.

## Cores semânticas

As cores de estado não devem mudar de acordo com a identidade do cliente.

### Success

* Main: #16A34A
* Background: #F0FDF4
* Border: #BBF7D0
* Text: #166534

### Warning

* Main: #D97706
* Background: #FFFBEB
* Border: #FDE68A
* Text: #92400E

### Danger

* Main: #DC2626
* Background: #FEF2F2
* Border: #FECACA
* Text: #991B1B

### Info

* Main: #0284C7
* Background: #F0F9FF
* Border: #BAE6FD
* Text: #075985

Não utilize a cor principal da marca para representar erro, alerta ou sucesso.

## Tipografia

Utilize:

Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif

Aplique a seguinte escala:

* Título principal de página: 28px, line-height 36px, peso 700
* Título de seção: 20px, line-height 28px, peso 600
* Título de card: 16px, line-height 24px, peso 600
* Texto padrão: 14px, line-height 20px, peso 400
* Texto de destaque: 14px, line-height 20px, peso 500
* Texto pequeno: 12px, line-height 18px, peso 400
* Label: 12px ou 14px, peso 500
* Caption: 11px, line-height 16px, peso 500

Evite textos de interface menores que 12px.

Valores financeiros, indicadores e números de dashboard devem utilizar números tabulares quando possível.

## Espaçamento

Padronize o sistema utilizando múltiplos de 4px.

Escala principal:

* 4px
* 8px
* 12px
* 16px
* 20px
* 24px
* 32px
* 40px
* 48px
* 64px

Aplicações recomendadas:

* Entre ícone e texto: 8px
* Entre label e campo: 6px ou 8px
* Entre campos: 16px
* Padding de cards: 20px ou 24px
* Entre título e descrição: 4px
* Entre blocos de conteúdo: 24px
* Entre seções principais: 32px
* Margem lateral desktop: 32px
* Margem lateral mobile: 16px

Elimine espaçamentos inconsistentes existentes.

## Border radius

Utilize:

* Inputs: 8px
* Botões: 8px
* Cards: 12px
* Dropdowns: 10px
* Modais: 16px
* Tooltips: 6px
* Badges: 999px
* Avatares: circular ou 10px, conforme o formato

Não utilize arredondamentos excessivos em todos os elementos.

## Sombras

Utilize sombras discretas.

Cards comuns devem utilizar preferencialmente borda, sem sombra.

Valores recomendados:

* XS: 0 1px 2px rgba(16, 24, 40, 0.05)
* SM: 0 1px 3px rgba(16, 24, 40, 0.08), 0 1px 2px rgba(16, 24, 40, 0.04)
* MD: 0 4px 8px -2px rgba(16, 24, 40, 0.08), 0 2px 4px -2px rgba(16, 24, 40, 0.04)
* LG: 0 12px 24px -4px rgba(16, 24, 40, 0.12)

Use sombra principalmente em:

* Dropdowns
* Menus flutuantes
* Modais
* Popovers
* Drawers
* Elementos temporariamente elevados

## Biblioteca de ícones

Utilize *Lucide Icons* como biblioteca oficial.

Não misture bibliotecas diferentes.

Diretrizes:

* Estilo outline
* Stroke entre 1.75px e 2px
* Ícones pequenos: 16px
* Ícones em botões: 18px
* Ícones padrão: 20px
* Ícones de destaque: 24px
* Cor herdada do texto ou do componente
* Ícones sem texto apenas para ações amplamente reconhecidas
* Botões somente com ícone devem possuir tooltip e aria-label

Substitua ícones inconsistentes, emojis ou caracteres utilizados como ícones.

## Layout geral

Refatore o layout principal da aplicação.

### Sidebar

Utilize sidebar branca ou neutra.

Características:

* Largura expandida entre 232px e 248px
* Largura recolhida entre 68px e 76px
* Logotipo configurável no topo
* Navegação agrupada por contexto
* Item ativo com background suave da marca
* Ícone e label alinhados
* Hover discreto
* Possibilidade de recolhimento
* Área inferior para configurações, ajuda e perfil
* Separadores apenas quando necessários

Não utilize a cor principal preenchendo toda a sidebar.

### Header

Utilize altura aproximada de 64px.

Inclua conforme o contexto existente:

* Título ou breadcrumb
* Busca global
* Ações da página
* Notificações
* Perfil do usuário
* Seletor de operação ou empresa
* Botão para abrir menu no mobile

Evite duplicar informações já presentes na página.

### Conteúdo

* Limite a largura de leitura quando necessário
* Utilize grid responsivo
* Mantenha alinhamento entre títulos, filtros, cards e tabelas
* Evite grandes áreas vazias sem intenção
* Evite conteúdo encostado nas bordas
* Utilize cabeçalho de página consistente

## Cabeçalho das páginas

Padronize todas as páginas com:

* Breadcrumb opcional
* Título principal
* Descrição curta opcional
* Ações primárias à direita
* Filtros ou tabs abaixo, quando necessário

Em telas menores, as ações devem ser reposicionadas ou empilhadas.

Não utilize múltiplos botões primários concorrendo na mesma área.

## Botões

Implemente variantes consistentes:

* Primary
* Secondary
* Outline
* Ghost
* Destructive
* Link
* Icon-only

Alturas:

* Small: 32px
* Medium: 40px
* Large: 48px

Regras:

* Um botão primário por área de decisão
* Loading sem alterar drasticamente a largura
* Disabled com contraste adequado
* Focus ring visível
* Ícone à esquerda em ações principais
* Ícones de seta ou continuidade à direita quando necessário
* Ações destrutivas devem utilizar vermelho, não a cor da marca

## Formulários

Padronize todos os formulários existentes.

Cada campo deve possuir:

* Label visível
* Placeholder objetivo
* Texto auxiliar quando necessário
* Estado default
* Hover
* Focus
* Disabled
* Read-only
* Error
* Success, quando aplicável
* Mensagem de validação clara

Utilize altura padrão de 40px.

O focus deve combinar:

* Borda na cor principal
* Ring externo suave
* Contraste perceptível por teclado

Não dependa somente da cor para indicar erros.

Organize formulários em seções lógicas.

Em formulários longos:

* Utilize subtítulos
* Agrupe campos relacionados
* Considere navegação por etapas apenas quando o fluxo justificar
* Mantenha ações principais visíveis
* Evite modais para cadastros excessivamente extensos

## Cards

Padronize os cards com:

* Background branco
* Borda de 1px
* Radius de 12px
* Padding de 20px ou 24px
* Título
* Descrição opcional
* Área de conteúdo
* Ações contextualizadas

Evite aninhar vários cards sem necessidade.

Cards interativos devem possuir:

* Hover perceptível
* Cursor correto
* Alteração leve de borda
* Estado selecionado
* Navegação acessível por teclado

## KPIs e dashboard

Refatore os indicadores para destacar:

* Label
* Valor principal
* Comparação
* Período
* Variação positiva ou negativa
* Ícone contextual opcional
* Micrográfico opcional

Não utilize cores semânticas apenas por decoração.

Verde deve indicar resultado positivo.

Vermelho deve indicar resultado negativo ou crítico.

A cor da marca pode ser usada para indicadores neutros e destaques principais.

## Tabelas

Refatore todas as tabelas administrativas.

Utilize:

* Header com background sutil
* Altura de linha entre 48px e 56px
* Hover discreto
* Linha selecionada com background suave
* Números alinhados à direita
* Textos alinhados à esquerda
* Ações agrupadas
* Ordenação visível
* Filtros claros
* Paginação consistente
* Estado vazio
* Skeleton de carregamento
* Tratamento de conteúdo longo
* Cabeçalho fixo quando necessário

Evite bordas verticais excessivas.

No mobile:

* Utilize scroll horizontal controlado quando a comparação entre colunas for essencial
* Converta registros em cards quando isso melhorar a leitura
* Preserve acesso às ações

## Filtros

Organize filtros em uma barra visualmente clara.

Inclua:

* Busca
* Selects
* Período
* Status
* Filtros avançados
* Botão para limpar filtros
* Indicador de filtros ativos

No mobile, filtros avançados podem ser apresentados em drawer.

Não deixe filtros ocuparem mais espaço que os resultados.

## Badges e status

Padronize os status utilizando badges suaves.

Exemplos:

* Ativo: success
* Pendente: warning
* Inativo: neutral
* Erro ou cancelado: danger
* Em processamento: info

Utilize background suave, borda opcional e texto escuro.

Não utilize badges totalmente preenchidas com cores muito saturadas, exceto em situações específicas.

## Feedbacks

Implemente estados consistentes para:

* Toasts
* Alerts
* Banners
* Mensagens de erro
* Confirmações
* Loading
* Skeleton
* Empty states
* Sem resultados
* Falha de conexão
* Permissão negada

Mensagens devem explicar:

* O que aconteceu
* O impacto
* O que o usuário pode fazer

Evite mensagens genéricas como “Ocorreu um erro” quando houver contexto disponível.

## Modais e confirmações

Utilize modal apenas para:

* Confirmações
* Ações curtas
* Edições simples
* Conteúdo contextual

Características:

* Título claro
* Descrição
* Botão de fechar
* Ação principal
* Ação secundária
* Focus trap
* Fechamento por teclado quando seguro
* Overlay discreto
* Largura adequada ao conteúdo

Ações destrutivas devem exigir confirmação clara.

Não coloque fluxos extensos em modais pequenos.

## Dropdowns, selects e menus

Aplique:

* Espaçamento consistente
* Hover claro
* Item selecionado
* Check quando aplicável
* Divisores apenas quando necessários
* Busca em listas extensas
* Limite de altura com scroll
* Navegação por teclado
* Posicionamento responsivo

## Gráficos

Utilize a cor principal da marca como primeira série.

Paleta auxiliar sugerida:

* #0891B2
* #7C3AED
* #D97706
* #16A34A
* #DB2777
* #64748B

Os gráficos devem possuir:

* Tooltip
* Legenda
* Labels legíveis
* Formatação de valores
* Grid discreto
* Estado vazio
* Responsividade
* Contraste entre séries
* Alternativas além de cor quando necessário

Não utilize gráficos 3D.

## Responsividade

Garanta boa experiência em:

* Desktop
* Notebook
* Tablet
* Mobile

No mobile:

* Sidebar deve virar drawer
* Header deve ser simplificado
* Ações secundárias podem ir para menu
* Cards devem ocupar uma coluna
* Formulários devem ser empilhados
* Modais devem respeitar a largura da tela
* Tabelas devem ter estratégia específica
* Botões críticos devem permanecer acessíveis
* Não permitir overflow horizontal acidental

## Acessibilidade

A aplicação deve seguir WCAG 2.2 AA.

Garanta:

* Contraste adequado
* Navegação por teclado
* Focus visível
* Labels vinculados aos campos
* aria-label em botões apenas com ícone
* Áreas clicáveis com pelo menos 40px
* Mensagens de erro acessíveis
* Estados não dependentes apenas de cor
* Ordem de tabulação lógica
* Hierarquia correta de títulos
* Suporte a redução de movimento
* Tooltips para ações ambíguas

## Motion

Utilize animações rápidas e funcionais.

* Microinterações: 120ms
* Transições comuns: 160ms
* Modais e drawers: 200ms
* Curva: cubic-bezier(0.2, 0, 0, 1)

Evite animações elásticas, exageradas ou lentas.

## Implementação

Antes de alterar os componentes, identifique:

* Estilos repetidos
* Cores hardcoded
* Espaçamentos inconsistentes
* Componentes duplicados
* Ícones de bibliotecas diferentes
* Padrões de botão divergentes
* Formulários inconsistentes
* Problemas de responsividade
* Problemas de contraste
* Componentes que podem ser reutilizados

Em seguida:

1. Crie ou reorganize os tokens globais.
2. Centralize cores, tipografia, radius, sombras e espaçamentos.
3. Refatore os componentes compartilhados.
4. Substitua estilos locais repetidos.
5. Aplique os componentes atualizados em todas as telas.
6. Preserve o funcionamento atual.
7. Verifique responsividade.
8. Verifique acessibilidade.
9. Garanta consistência entre as páginas.
10. Remova estilos antigos que não estejam mais sendo utilizados.

Não crie componentes duplicados apenas para resolver diferenças visuais pequenas.

Prefira variantes, propriedades e composição.

## Configuração futura da marca

Prepare a aplicação para receber futuramente configurações como:

* Logotipo principal
* Logotipo compacto
* Favicon
* Cor principal
* Cor secundária
* Nome da empresa
* Tema visual
* Imagens institucionais

Essas configurações devem alimentar os tokens globais da aplicação.

Não é necessário criar agora uma tela de configuração de whitelabel, a menos que ela já faça parte do sistema.

O foco é deixar toda a arquitetura visual pronta para essa personalização.

## Resultado esperado

Entregue o sistema existente totalmente refatorado visualmente.

O resultado deve:

* Parecer um produto SaaS real
* Ter light mode consistente
* Ser responsivo
* Ser acessível
* Possuir componentes padronizados
* Utilizar Lucide Icons
* Estar preparado para whitelabel
* Possuir cores de marca configuráveis
* Preservar todas as funcionalidades existentes
* Não conter uma página separada de style guide
* Demonstrar o style guide por meio da própria aplicação
* Estar pronto para uso e evolução em produção

Antes de finalizar, revise todas as telas e corrija inconsistências visuais remanescentes.