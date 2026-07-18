# PRD - SaaS de Ingressos para Festas e Shows Regionais

**Versão:** 1.0  
**Status:** Baseline do MVP operacional  
**Data:** 12 de julho de 2026  
**Responsável pelo produto:** A definir  
**Nome comercial do produto:** A definir  
**Mercado inicial:** Brasil  
**Modelo:** SaaS B2B2C para produtoras de festas e shows regionais

> **Aviso:** este documento define requisitos de produto e operação. Os itens jurídicos, tributários, contábeis, financeiros e de proteção de dados devem ser revisados por profissionais especializados antes da entrada em produção.

---

## Controle do documento

| Campo | Valor |
|---|---|
| Identificador | PRD-TICKETING-001 |
| Versão | 1.0 |
| Classificação | Produto / Confidencial |
| Estado | Aprovado como baseline funcional |
| Escopo | MVP operacional completo para o primeiro piloto |
| Próxima revisão | Após validação do protótipo e definição do Pilot Brief |

### Histórico de versões

| Versão | Data | Alteração |
|---|---|---|
| 0.1 | Descoberta inicial | Tese de produto e mercado |
| 0.5 | Refinamento | Definição do nicho, ICP e piloto |
| 1.0 | 12/07/2026 | Formalização do MVP operacional completo |

---

## Sumário

1. [Resumo executivo](#1-resumo-executivo)
2. [Contexto e oportunidade](#2-contexto-e-oportunidade)
3. [Visão, posicionamento e princípios](#3-visão-posicionamento-e-princípios)
4. [Objetivos, métricas e não objetivos](#4-objetivos-métricas-e-não-objetivos)
5. [Público-alvo, personas e partes interessadas](#5-público-alvo-personas-e-partes-interessadas)
6. [Escopo do MVP](#6-escopo-do-mvp)
7. [Jornadas principais](#7-jornadas-principais)
8. [Papéis e permissões](#8-papéis-e-permissões)
9. [Requisitos funcionais](#9-requisitos-funcionais)
10. [Regras de negócio](#10-regras-de-negócio)
11. [Estados e transições](#11-estados-e-transições)
12. [Requisitos não funcionais](#12-requisitos-não-funcionais)
13. [Modelo de dados conceitual](#13-modelo-de-dados-conceitual)
14. [Integrações externas](#14-integrações-externas)
15. [Analytics e eventos de produto](#15-analytics-e-eventos-de-produto)
16. [Critérios de aceite por épico](#16-critérios-de-aceite-por-épico)
17. [Plano do piloto](#17-plano-do-piloto)
18. [Plano de contingência](#18-plano-de-contingência)
19. [Riscos e mitigação](#19-riscos-e-mitigação)
20. [Dependências e decisões pendentes](#20-dependências-e-decisões-pendentes)
21. [Roadmap de implementação](#21-roadmap-de-implementação)
22. [Definition of Ready e Definition of Done](#22-definition-of-ready-e-definition-of-done)
23. [Glossário](#23-glossário)
24. [Referências normativas e técnicas](#24-referências-normativas-e-técnicas)

---

# 1. Resumo executivo

O produto será uma plataforma SaaS de venda e gestão de ingressos para **produtoras recorrentes de festas e shows regionais**, com operação B2B2C. A plataforma deverá centralizar criação de eventos, inventário, checkout, pagamentos, emissão de ingressos, promoters, comissões, CRM inicial, suporte, conciliação financeira e controle de acesso.

A tese de valor não se limita à redução de taxas. O diferencial principal será um ciclo comercial e operacional integrado:

```text
Promoter divulga
→ venda é atribuída corretamente
→ comissão é calculada e auditada
→ comprador entra na base da produtora
→ produtora acompanha receita e recorrência
→ público é reativado no próximo evento
→ ingresso é validado com segurança na portaria
```

O MVP definido neste documento é um **MVP operacional completo**, e não apenas um protótipo técnico. Ele deverá ser capaz de operar um evento piloto real com segurança, rastreabilidade e plano de contingência.

## 1.1 Hipótese central

Produtoras regionais aceitarão migrar para uma nova plataforma quando ela reduzir trabalho manual, aumentar a visibilidade comercial, simplificar a gestão de promoters, preservar o relacionamento com o público e oferecer uma operação de entrada confiável.

## 1.2 Proposta de valor

> Venda seus eventos, acompanhe cada promoter e transforme compradores em público recorrente, com pagamentos, ingressos e portaria integrados em uma única operação.

## 1.3 Resultado esperado do MVP

Ao final do piloto, a plataforma deverá demonstrar que consegue:

- realizar vendas completas via Pix e cartão;
- impedir overselling;
- emitir ingressos de forma consistente;
- atribuir vendas e calcular comissões de promoters;
- fornecer dados comerciais e financeiros reconciliáveis;
- permitir atendimento operacional sem alterações manuais no banco de dados;
- operar check-in online e offline;
- registrar ações sensíveis em trilha de auditoria;
- manter a produtora disposta a utilizar e pagar pelo produto em eventos futuros.

---

# 2. Contexto e oportunidade

## 2.1 Problema do mercado-alvo

Produtoras regionais normalmente distribuem sua operação entre plataformas de ingresso, planilhas, grupos de WhatsApp, links de promoters, cupons, ferramentas de anúncios e controles financeiros paralelos. Essa fragmentação gera:

- dificuldade para atribuir vendas;
- disputas e retrabalho no cálculo de comissões;
- baixa visibilidade sobre conversão e canais;
- dependência de suporte externo para ações simples;
- pouca capacidade de reutilizar a base de compradores;
- conciliação financeira manual;
- risco operacional na portaria;
- baixa rastreabilidade sobre alterações e exceções.

## 2.2 ICP inicial

O cliente ideal inicial é uma produtora independente que:

- realiza ao menos quatro eventos por ano;
- opera festas, shows ou experiências regionais;
- recebe entre 300 e 5.000 participantes por evento;
- vende principalmente por Instagram, WhatsApp, mídia paga, promoters e parceiros;
- trabalha com setores simples, sem assentos numerados complexos;
- possui equipe entre 2 e 15 pessoas;
- utiliza planilhas ou mensagens para parte da operação;
- valoriza suporte próximo, dados próprios, previsibilidade e eficiência comercial.

## 2.3 Problema principal

> A produtora não possui uma visão integrada e confiável de quem vende, quem compra, quanto cada canal gera, quais valores serão recebidos e como transformar compradores anteriores em público recorrente.

## 2.4 Diferenciação inicial

A diferenciação do produto será composta por um conjunto integrado:

1. gestão de promoters como usuários reais do sistema;
2. atribuição transparente e auditável de vendas;
3. cálculo de comissões derivado de vendas válidas;
4. CRM inicial pertencente à produtora, sujeito à LGPD;
5. dashboard comercial e financeiro coerente;
6. backoffice capaz de resolver exceções;
7. check-in confiável, inclusive com operação offline controlada.

---

# 3. Visão, posicionamento e princípios

## 3.1 Visão do produto

Ser o sistema operacional comercial e de acesso para produtoras regionais recorrentes, permitindo que vendam, operem e retenham público sem depender de controles fragmentados.

## 3.2 Posicionamento

**Categoria:** ticketing + gestão comercial + operação de acesso.  
**Cliente pagante:** produtora ou organizador.  
**Usuário final:** comprador, participante, promoter e equipe operacional.  
**Modelo inicial:** taxa transacional, com possibilidade futura de mensalidade e módulos premium.

## 3.3 Princípios de produto

1. **Integridade financeira antes de conveniência.** Nenhuma otimização de interface pode comprometer conciliação, inventário ou rastreabilidade.
2. **A produtora controla seu negócio.** Dados, relatórios e operações devem ser acessíveis conforme permissões e base legal.
3. **O comprador não deve instalar um aplicativo para usar o ingresso.** A experiência principal deve funcionar na web.
4. **Toda ação sensível deve ser auditável.** Reembolso, bloqueio, alteração de capacidade, cortesia e check-in manual exigem registro.
5. **Falhas externas são esperadas.** Webhooks duplicados, PSP indisponível, e-mail atrasado e internet instável devem ser tratados como cenários normais.
6. **Check-in offline tem limitações explícitas.** A plataforma deve reduzir risco e detectar conflitos, sem prometer prevenção global impossível entre dispositivos totalmente desconectados.
7. **Escopo é protegido pelo piloto.** Funcionalidades novas só entram quando bloqueiam segurança, conformidade ou operação do evento piloto.

---

# 4. Objetivos, métricas e não objetivos

## 4.1 Objetivos de negócio

- conquistar e reter a produtora piloto;
- processar o primeiro GMV real com margem e risco controlados;
- comprovar valor na gestão de promoters e comissões;
- reduzir trabalho manual de suporte e conciliação;
- criar uma base técnica reutilizável para outros produtores do mesmo nicho;
- obter evidência de disposição para pagar e repetir o uso.

## 4.2 Objetivos de produto

- oferecer fluxo completo de venda até check-in;
- permitir configuração autônoma do evento;
- garantir consistência entre inventário, pedido, pagamento e ingresso;
- fornecer ferramentas administrativas seguras;
- registrar métricas de funil e operação;
- suportar contingência no dia do evento.

## 4.3 Métrica norteadora

**GMV de produtoras recorrentes**, acompanhado por:

- receita líquida da plataforma;
- margem após custos de pagamento, fraude, reembolso e suporte;
- taxa de repetição de produtoras;
- quantidade de eventos ativos por produtora.

## 4.4 Critérios de sucesso do piloto

| Dimensão | Critério mínimo |
|---|---|
| Inventário | Zero vendas confirmadas acima da capacidade configurada |
| Emissão | 100% das vendas confirmadas resultam em ingresso ou alerta operacional tratável |
| Financeiro | Nenhuma divergência crítica não explicada entre pedido, pagamento, ingresso e repasse |
| Check-in | Pelo menos 99% dos ingressos válidos processados corretamente |
| Segurança | Nenhum acesso indevido confirmado entre organizações |
| Auditoria | 100% das ações administrativas sensíveis registradas |
| Promoters | Comissões reproduzíveis a partir das vendas válidas |
| Produto | Produtora aceita utilizar novamente ou formaliza plano de continuidade |

## 4.5 Não objetivos do MVP

Ficam fora da baseline, salvo decisão formal de mudança:

- marketplace nacional de descoberta;
- assentos numerados e mapas complexos;
- cashless e gestão completa de bares;
- reconhecimento facial;
- aplicativo nativo para compradores;
- mercado secundário ou revenda;
- múltiplas moedas e operação internacional;
- hardware proprietário;
- precificação dinâmica por IA;
- automação avançada de WhatsApp;
- emissão fiscal universal para todos os municípios;
- antecipação de recebíveis com risco próprio;
- gestão completa de fornecedores, patrocinadores ou expositores.

---

# 5. Público-alvo, personas e partes interessadas

## 5.1 Personas operacionais

### P1 - Proprietário da produtora

**Objetivos:** aumentar vendas, reduzir risco, acompanhar resultado e repetir eventos.  
**Dores:** dados fragmentados, falta de previsibilidade e dependência de pessoas-chave.  
**Necessidades:** visão executiva, controle de usuários, financeiro e auditoria.

### P2 - Gestor do evento

**Objetivos:** configurar evento, lotes, promoters, campanhas e operação.  
**Dores:** retrabalho, mudanças de última hora e dificuldade de consolidar dados.  
**Necessidades:** autonomia, clareza de estados, alertas e relatórios.

### P3 - Financeiro

**Objetivos:** conferir taxas, comissões, reembolsos, chargebacks e repasses.  
**Dores:** divergências entre planilhas, PSP e plataforma.  
**Necessidades:** extrato imutável, exportações e trilha de cálculo.

### P4 - Promoter

**Objetivos:** divulgar, acompanhar vendas, metas e comissão.  
**Dores:** falta de transparência e demora para conferência.  
**Necessidades:** link próprio, painel simples, regras claras e histórico.

### P5 - Coordenador de portaria

**Objetivos:** preparar dispositivos, operadores e contingência.  
**Dores:** internet instável, filas e exceções.  
**Necessidades:** status em tempo real, modo offline e capacidade de intervenção controlada.

### P6 - Operador de check-in

**Objetivos:** validar rapidamente e identificar problemas.  
**Dores:** QR ilegível, duplicidade, participante sem ingresso.  
**Necessidades:** leitura rápida, mensagens claras, busca manual limitada e registro de ação.

### P7 - Comprador

**Objetivos:** comprar, pagar, receber, transferir e apresentar o ingresso.  
**Dores:** taxas surpresa, falha de pagamento, ingresso não recebido e suporte lento.  
**Necessidades:** checkout simples, preço transparente, acesso web e recuperação fácil.

### P8 - Suporte da plataforma

**Objetivos:** resolver incidentes sem tocar diretamente no banco.  
**Dores:** baixa visibilidade e ações perigosas.  
**Necessidades:** pesquisa global, contexto completo, ações protegidas e auditoria.

## 5.2 Partes interessadas

- fundador e responsável pelo produto;
- equipe de desenvolvimento;
- produtora piloto;
- PSP/adquirente;
- serviço de e-mail e comunicação;
- jurídico e contabilidade;
- encarregado ou responsável por privacidade;
- equipe de suporte;
- equipe de portaria;
- compradores e participantes.

---

# 6. Escopo do MVP

O MVP é composto pelos seguintes épicos:

| Código | Épico | Resultado |
|---|---|---|
| EP-01 | Organizações, usuários e permissões | Operação multi-tenant segura |
| EP-02 | Gestão de eventos e inventário | Evento configurável sem overselling |
| EP-03 | Página pública e checkout | Compra completa com transparência |
| EP-04 | Pedidos e pagamentos | Registro financeiro idempotente |
| EP-05 | Emissão e gestão de ingressos | QR único, transferência e bloqueio |
| EP-06 | Promoters e comissões | Atribuição e cálculo auditáveis |
| EP-07 | Dashboard e participantes | Visibilidade comercial e operacional |
| EP-08 | CRM inicial | Segmentação e exportação da base |
| EP-09 | Check-in e portaria | Validação online/offline e contingência |
| EP-10 | Backoffice e suporte | Resolução segura de exceções |
| EP-11 | Financeiro e conciliação | Extratos, taxas, comissões e repasses |
| EP-12 | Notificações, auditoria e observabilidade | Comunicação e rastreabilidade |

---

# 7. Jornadas principais

## 7.1 Criação e publicação do evento

```text
Criar organização
→ completar dados cadastrais
→ criar evento em rascunho
→ configurar local, datas e capacidade
→ criar tipos de ingresso e lotes
→ configurar taxas, cupons e promoters
→ revisar página pública
→ publicar evento
→ iniciar vendas
```

## 7.2 Compra de ingresso

```text
Acessar página pública
→ selecionar ingresso
→ informar comprador e participantes
→ aplicar cupom/promoter
→ reservar inventário
→ revisar preço e taxas
→ pagar via Pix ou cartão
→ receber confirmação
→ acessar ingresso web e e-mail
```

## 7.3 Gestão de promoter

```text
Convidar promoter
→ vincular ao evento
→ definir comissão e meta
→ gerar link/cupom
→ promoter divulga
→ vendas são atribuídas
→ comissão é calculada
→ produtora confere e aprova
→ financeiro exporta ou registra pagamento
```

## 7.4 Atendimento a comprador

```text
Localizar por nome/e-mail/documento/pedido
→ visualizar pedido, pagamento e ingresso
→ diagnosticar problema
→ executar ação autorizada
→ registrar justificativa
→ notificar comprador
→ manter histórico auditável
```

## 7.5 Check-in

```text
Coordenador prepara evento e operadores
→ dispositivo sincroniza lista autorizada
→ operador lê QR
→ sistema valida estado e permissão
→ entrada é registrada
→ conflitos são sinalizados
→ dados offline são sincronizados
→ relatório final é conciliado
```

## 7.6 Fechamento financeiro

```text
Encerrar vendas
→ reconciliar pedidos e pagamentos
→ consolidar reembolsos e chargebacks
→ calcular taxas e comissões
→ calcular valor líquido
→ registrar repasse previsto/realizado
→ exportar extrato
→ encerrar evento
```

---

# 8. Papéis e permissões

## 8.1 Papéis mínimos

| Papel | Escopo principal |
|---|---|
| Proprietário | Controle total da organização |
| Administrador | Operação ampla, exceto ações de propriedade e dados bancários críticos, conforme política |
| Gestor do evento | Eventos, lotes, promoters e participantes |
| Financeiro | Pagamentos, taxas, comissões, extratos e repasses |
| Suporte da produtora | Pedidos, ingressos e atendimento limitado |
| Coordenador de portaria | Operadores, dispositivos, check-in e relatórios |
| Operador de check-in | Validação e busca limitada no evento atribuído |
| Promoter | Dados próprios, links, vendas, metas e comissão |
| Administrador da plataforma | Backoffice global com controles reforçados |

## 8.2 Matriz resumida

| Ação | Proprietário | Gestor | Financeiro | Suporte | Portaria | Promoter |
|---|---:|---:|---:|---:|---:|---:|
| Criar evento | Sim | Sim | Não | Não | Não | Não |
| Alterar capacidade | Sim | Sim | Não | Não | Não | Não |
| Ver dados financeiros | Sim | Parcial | Sim | Limitado | Não | Próprios |
| Reembolsar | Sim | Conforme permissão | Sim | Solicitar | Não | Não |
| Criar cortesia | Sim | Sim | Não | Conforme permissão | Não | Não |
| Gerir promoters | Sim | Sim | Ver | Não | Não | Próprio perfil |
| Operar check-in | Sim | Ver | Não | Não | Sim | Não |
| Alterar dados bancários | Sim + controle reforçado | Não | Conforme política | Não | Não | Não |
| Exportar base de compradores | Sim | Conforme permissão | Não | Não | Não | Não |

## 8.3 Regras de autorização

- Toda autorização deve ser verificada no backend.
- Toda consulta deve respeitar `organization_id` e escopo do usuário.
- Permissões críticas devem ser explícitas, não inferidas apenas pelo front-end.
- Ações administrativas globais exigem autenticação reforçada e auditoria.
- O operador de check-in somente pode acessar eventos e campos necessários à portaria.

---

# 9. Requisitos funcionais

A prioridade **Must** indica requisito obrigatório para o piloto. **Should** indica requisito importante que poderá ser simplificado sem comprometer a operação central. Todos os requisitos abaixo pertencem à baseline, salvo marcação explícita.

## 9.1 Organizações, usuários e autenticação

| ID | Prioridade | Requisito |
|---|---|---|
| FR-ORG-001 | Must | O sistema deve permitir criar uma organização produtora com nome, documento, contatos e endereço. |
| FR-ORG-002 | Must | O sistema deve isolar logicamente todos os dados por organização. |
| FR-ORG-003 | Must | O proprietário deve poder convidar usuários por e-mail. |
| FR-ORG-004 | Must | O convite deve possuir validade, uso único e possibilidade de revogação. |
| FR-ORG-005 | Must | O sistema deve suportar papéis e permissões por organização. |
| FR-ORG-006 | Must | O usuário deve poder participar de mais de uma organização, com permissões independentes. |
| FR-ORG-007 | Must | O sistema deve permitir ativar, suspender e remover acesso de usuários sem apagar histórico. |
| FR-ORG-008 | Must | Alterações em dados cadastrais e bancários devem ser auditadas. |
| FR-ORG-009 | Must | O sistema deve permitir configurar nome público, identidade visual básica e contatos de suporte da produtora. |
| FR-AUTH-001 | Must | O sistema deve oferecer cadastro, login, logout e recuperação de acesso. |
| FR-AUTH-002 | Must | Senhas devem seguir política mínima de segurança e não podem ser armazenadas em texto puro. |
| FR-AUTH-003 | Must | Sessões devem expirar e poder ser revogadas. |
| FR-AUTH-004 | Must | Ações sensíveis devem solicitar reautenticação ou fator adicional, conforme política de risco. |
| FR-AUTH-005 | Should | O sistema deve suportar autenticação multifator para proprietários, financeiro e administradores da plataforma. |
| FR-AUTH-006 | Must | Tentativas excessivas de autenticação devem ser limitadas e monitoradas. |

## 9.2 Gestão de eventos

| ID | Prioridade | Requisito |
|---|---|---|
| FR-EVT-001 | Must | O usuário autorizado deve criar, editar, duplicar e arquivar eventos. |
| FR-EVT-002 | Must | O evento deve possuir título, descrição, imagens, local, cidade, endereço, data e horários. |
| FR-EVT-003 | Must | O evento deve possuir capacidade total e, opcionalmente, capacidade por setor. |
| FR-EVT-004 | Must | O sistema deve suportar os estados rascunho, publicado, vendas pausadas, vendas encerradas, adiado, cancelado, concluído e arquivado. |
| FR-EVT-005 | Must | A publicação deve validar campos obrigatórios, inventário e configuração de pagamento. |
| FR-EVT-006 | Must | O gestor deve poder pausar e retomar vendas sem remover a página pública. |
| FR-EVT-007 | Must | O sistema deve permitir configurar data e hora de início e fim das vendas. |
| FR-EVT-008 | Must | O evento deve possuir política de cancelamento e informações obrigatórias ao comprador. |
| FR-EVT-009 | Must | O sistema deve permitir configurar termos específicos do evento. |
| FR-EVT-010 | Must | O sistema deve registrar histórico de alterações de capacidade, datas e status. |
| FR-EVT-011 | Must | O sistema deve permitir criar setores sem assentos numerados. |
| FR-EVT-012 | Must | O sistema deve permitir limitar quantidade por pedido e por comprador, conforme regra configurada. |
| FR-EVT-013 | Must | O sistema deve suportar ingressos inteiros, meia-entrada, promocionais, cortesias e categorias personalizadas. |
| FR-EVT-014 | Must | O sistema deve permitir configurar perguntas adicionais por pedido ou participante. |
| FR-EVT-015 | Should | O sistema deve permitir pré-visualizar a página antes da publicação. |

## 9.3 Tipos de ingresso, lotes e inventário

| ID | Prioridade | Requisito |
|---|---|---|
| FR-INV-001 | Must | O gestor deve criar tipos de ingresso e lotes associados ao evento ou setor. |
| FR-INV-002 | Must | Cada lote deve possuir nome, preço, quantidade, período de venda e regras de elegibilidade. |
| FR-INV-003 | Must | O sistema deve abrir e encerrar lotes automaticamente por data, hora ou esgotamento. |
| FR-INV-004 | Must | A virada de lote não pode vender quantidade superior à capacidade agregada. |
| FR-INV-005 | Must | O checkout deve criar reserva temporária de inventário com expiração. |
| FR-INV-006 | Must | A reserva deve ser confirmada somente após a transição válida do pedido. |
| FR-INV-007 | Must | Reservas expiradas devem devolver disponibilidade de forma idempotente. |
| FR-INV-008 | Must | O sistema deve impedir overselling mesmo sob concorrência simultânea. |
| FR-INV-009 | Must | Alterações de quantidade após início das vendas devem ser auditadas e validadas contra o total já comprometido. |
| FR-INV-010 | Must | O sistema deve diferenciar quantidade disponível, reservada, vendida, cancelada e cortesia. |
| FR-INV-011 | Must | O gestor deve poder encerrar manualmente um lote. |
| FR-INV-012 | Must | O sistema deve permitir lista de espera ou interesse apenas como coleta de lead, sem promessa de disponibilidade. |

## 9.4 Página pública, campanhas e checkout

| ID | Prioridade | Requisito |
|---|---|---|
| FR-CHK-001 | Must | O evento publicado deve possuir página pública responsiva e indexável conforme configuração. |
| FR-CHK-002 | Must | A página deve exibir organizador, local, data, descrição, classificação, políticas e contatos. |
| FR-CHK-003 | Must | O comprador deve visualizar disponibilidade e preço dos ingressos. |
| FR-CHK-004 | Must | O preço total e suas parcelas de taxa devem ser apresentados antes da confirmação. |
| FR-CHK-005 | Must | O comprador deve poder concluir a compra sem criar senha obrigatória. |
| FR-CHK-006 | Must | O sistema deve coletar dados mínimos do comprador e dados configurados dos participantes. |
| FR-CHK-007 | Must | O checkout deve validar formato, obrigatoriedade e consistência dos campos. |
| FR-CHK-008 | Must | O sistema deve permitir aplicar cupom válido e informar motivo quando recusado. |
| FR-CHK-009 | Must | O sistema deve capturar parâmetros UTM e identificadores de campanha. |
| FR-CHK-010 | Must | O sistema deve identificar promoter por link, código ou cupom, conforme regras de atribuição. |
| FR-CHK-011 | Must | O checkout deve exibir cronômetro ou aviso de expiração da reserva quando aplicável. |
| FR-CHK-012 | Must | O comprador deve aceitar termos e política de privacidade antes de pagar. |
| FR-CHK-013 | Must | O sistema deve oferecer Pix e cartão por meio de PSP integrado. |
| FR-CHK-014 | Must | O cartão deve utilizar tokenização ou componente hospedado do PSP, sem armazenamento de CVV. |
| FR-CHK-015 | Must | O checkout deve tratar pagamento pendente, aprovado, recusado e expirado. |
| FR-CHK-016 | Must | Reenvio de formulário ou atualização de página não pode criar cobrança duplicada. |
| FR-CHK-017 | Must | O comprador deve receber uma página de confirmação com identificador do pedido. |
| FR-CHK-018 | Should | O sistema deve permitir recuperar checkout pendente enquanto a reserva for válida. |

## 9.5 Pedidos, pagamentos e webhooks

| ID | Prioridade | Requisito |
|---|---|---|
| FR-PAY-001 | Must | O sistema deve criar pedido com identificador único antes de iniciar o pagamento. |
| FR-PAY-002 | Must | Pedido, pagamento e ingresso devem possuir estados independentes e correlacionáveis. |
| FR-PAY-003 | Must | O sistema deve registrar valor bruto, descontos, taxas, custo do PSP e valor líquido estimado. |
| FR-PAY-004 | Must | Toda chamada de criação de pagamento deve utilizar chave de idempotência. |
| FR-PAY-005 | Must | Webhooks devem ser autenticados conforme mecanismo do PSP. |
| FR-PAY-006 | Must | Webhooks devem ser persistidos antes do processamento e processados de forma idempotente. |
| FR-PAY-007 | Must | Eventos duplicados ou fora de ordem não podem corromper o estado. |
| FR-PAY-008 | Must | O sistema deve consultar o PSP em caso de inconsistência ou evento inconclusivo. |
| FR-PAY-009 | Must | Pagamento aprovado deve confirmar inventário e iniciar emissão de ingressos. |
| FR-PAY-010 | Must | Pagamento recusado ou expirado deve liberar inventário conforme regras de segurança. |
| FR-PAY-011 | Must | O sistema deve suportar reembolso total. |
| FR-PAY-012 | Should | O sistema deve suportar reembolso parcial quando o PSP e a regra do pedido permitirem. |
| FR-PAY-013 | Must | Reembolsos devem atualizar ingresso, comissão, extrato e métricas. |
| FR-PAY-014 | Must | Chargebacks devem ser registrados e refletidos no financeiro. |
| FR-PAY-015 | Must | O backoffice deve exibir histórico técnico de eventos do pagamento. |
| FR-PAY-016 | Must | O sistema deve permitir reconciliação automática e manual assistida. |
| FR-PAY-017 | Must | Nenhum dado sensível completo de cartão deve aparecer em logs ou telas. |
| FR-PAY-018 | Must | O sistema deve registrar prazo e status esperado de liquidação conforme dados do PSP. |
| FR-PAY-019 | Must | Pagamento Pix deve possuir QR Code, código copia e cola e expiração. |
| FR-PAY-020 | Must | A confirmação do Pix deve depender da confirmação do PSP, e não apenas da visualização do QR. |

## 9.6 Emissão e gestão de ingressos

| ID | Prioridade | Requisito |
|---|---|---|
| FR-TKT-001 | Must | O sistema deve emitir um ingresso para cada unidade paga ou cortesia aprovada. |
| FR-TKT-002 | Must | Cada ingresso deve possuir identificador interno e token de validação único. |
| FR-TKT-003 | Must | O QR Code não deve expor dados pessoais em texto legível. |
| FR-TKT-004 | Must | O ingresso deve possuir página web acessível por link seguro. |
| FR-TKT-005 | Must | O ingresso deve ser enviado por e-mail após emissão. |
| FR-TKT-006 | Must | O comprador deve poder recuperar e reenviar ingressos com verificação apropriada. |
| FR-TKT-007 | Must | O sistema deve suportar transferência de titularidade. |
| FR-TKT-008 | Must | A transferência deve manter histórico de titularidade e invalidar o token anterior quando necessário. |
| FR-TKT-009 | Must | O sistema deve permitir bloquear e desbloquear ingresso com justificativa. |
| FR-TKT-010 | Must | Ingresso cancelado, reembolsado ou bloqueado não pode ser aceito no check-in. |
| FR-TKT-011 | Must | O sistema deve exibir status atual e histórico do ingresso. |
| FR-TKT-012 | Must | O backoffice deve permitir corrigir dados não financeiros do participante conforme permissão. |
| FR-TKT-013 | Must | A correção não pode apagar o valor anterior da auditoria. |
| FR-TKT-014 | Must | O sistema deve suportar geração de cortesia com motivo e usuário responsável. |
| FR-TKT-015 | Must | Cortesias devem consumir capacidade conforme configuração do evento. |
| FR-TKT-016 | Must | O sistema deve impedir emissão duplicada em retentativas da mesma operação. |

## 9.7 Promoters, links, metas e comissões

| ID | Prioridade | Requisito |
|---|---|---|
| FR-PRM-001 | Must | O gestor deve cadastrar e convidar promoters. |
| FR-PRM-002 | Must | O promoter deve possuir acesso próprio e limitado. |
| FR-PRM-003 | Must | O promoter deve ser vinculado a eventos específicos. |
| FR-PRM-004 | Must | O sistema deve gerar link individual por promoter e evento. |
| FR-PRM-005 | Must | O sistema deve permitir cupom individual ou compartilhado conforme configuração. |
| FR-PRM-006 | Must | A regra de prioridade entre link, cupom e atribuição anterior deve ser configurada ou definida de forma global documentada. |
| FR-PRM-007 | Must | A venda atribuída deve registrar origem, timestamp e mecanismo de atribuição. |
| FR-PRM-008 | Must | O sistema deve suportar comissão fixa ou percentual. |
| FR-PRM-009 | Must | A comissão deve poder variar por evento, lote ou tipo de ingresso. |
| FR-PRM-010 | Must | A comissão deve ser calculada a partir de vendas válidas e elegíveis. |
| FR-PRM-011 | Must | Reembolso ou chargeback deve estornar a comissão relacionada. |
| FR-PRM-012 | Must | O promoter deve visualizar vendas, quantidade, valor elegível e comissão prevista. |
| FR-PRM-013 | Must | O gestor deve visualizar ranking e desempenho por promoter. |
| FR-PRM-014 | Must | O sistema deve suportar metas de quantidade ou valor. |
| FR-PRM-015 | Must | Alterações de regra de comissão não devem retroagir sem ação explícita e auditada. |
| FR-PRM-016 | Must | O financeiro deve poder aprovar, ajustar mediante justificativa e marcar comissão como paga. |
| FR-PRM-017 | Must | O sistema deve exportar relatório de comissões. |
| FR-PRM-018 | Should | O sistema deve sinalizar padrões suspeitos de autoindicação ou abuso. |

## 9.8 Dashboard, compradores e participantes

| ID | Prioridade | Requisito |
|---|---|---|
| FR-DAS-001 | Must | O dashboard deve exibir ingressos vendidos, pedidos pagos, pendentes e cancelados. |
| FR-DAS-002 | Must | O dashboard deve exibir GMV, descontos, taxas e valor líquido estimado. |
| FR-DAS-003 | Must | O dashboard deve permitir filtros por período, evento, lote, tipo, canal e promoter. |
| FR-DAS-004 | Must | O sistema deve exibir vendas por Pix e cartão. |
| FR-DAS-005 | Must | O sistema deve exibir vendas e comissão por promoter. |
| FR-DAS-006 | Must | Métricas devem possuir definições documentadas e consistentes. |
| FR-DAS-007 | Must | O sistema deve permitir exportar dados filtrados em CSV. |
| FR-DAS-008 | Must | A lista de compradores deve ser separada da lista de participantes. |
| FR-DAS-009 | Must | O usuário autorizado deve buscar por nome, e-mail, documento, pedido ou ingresso. |
| FR-DAS-010 | Must | O sistema deve exibir origem da venda, promoter, pagamento, ingresso e check-in relacionados. |
| FR-DAS-011 | Must | O sistema deve indicar compradores recorrentes dentro da organização. |
| FR-DAS-012 | Must | O sistema deve permitir exportar participantes conforme permissão e finalidade. |

## 9.9 CRM inicial e campanhas

| ID | Prioridade | Requisito |
|---|---|---|
| FR-CRM-001 | Must | A organização deve possuir base consolidada de compradores e participantes, respeitando base legal e permissões. |
| FR-CRM-002 | Must | O sistema deve registrar consentimentos, versão do texto, data, origem e finalidade quando aplicável. |
| FR-CRM-003 | Must | O sistema deve segmentar por evento, cidade, frequência, quantidade de compras e valor gasto. |
| FR-CRM-004 | Must | O sistema deve segmentar presentes e ausentes. |
| FR-CRM-005 | Must | O sistema deve segmentar por promoter, canal e campanha. |
| FR-CRM-006 | Must | O sistema deve exportar segmentos em CSV. |
| FR-CRM-007 | Must | Exportações devem ser auditadas. |
| FR-CRM-008 | Must | O sistema deve manter preferência de comunicação e opt-out quando aplicável. |
| FR-CRM-009 | Must | O sistema deve registrar parâmetros UTM e links rastreáveis. |
| FR-CRM-010 | Should | O sistema deve permitir criar uma campanha identificada para medir cliques e vendas, sem necessariamente enviar mensagens no MVP. |

## 9.10 Check-in e portaria

| ID | Prioridade | Requisito |
|---|---|---|
| FR-CIN-001 | Must | O coordenador deve criar e revogar operadores de check-in. |
| FR-CIN-002 | Must | Operadores devem ser vinculados a eventos e, opcionalmente, setores ou portões. |
| FR-CIN-003 | Must | O aplicativo web/PWA deve ler QR Code por câmera compatível. |
| FR-CIN-004 | Must | A validação online deve consultar estado, evento, setor e histórico do ingresso. |
| FR-CIN-005 | Must | A validação aceita deve registrar ingresso, operador, dispositivo, data, hora e modo online/offline. |
| FR-CIN-006 | Must | Ingresso já utilizado deve gerar alerta claro e não ser aceito automaticamente. |
| FR-CIN-007 | Must | Ingresso inválido, bloqueado, cancelado ou de outro evento deve gerar motivo claro. |
| FR-CIN-008 | Must | O sistema deve permitir busca manual por dados mínimos, conforme permissão. |
| FR-CIN-009 | Must | O coordenador deve poder autorizar check-in manual excepcional com justificativa. |
| FR-CIN-010 | Must | O sistema deve permitir desfazer check-in por usuário autorizado, com auditoria. |
| FR-CIN-011 | Must | O dispositivo deve poder baixar um pacote offline autorizado e com validade. |
| FR-CIN-012 | Must | O pacote offline deve conter apenas dados necessários à validação. |
| FR-CIN-013 | Must | O modo offline deve impedir duplicidade no mesmo dispositivo. |
| FR-CIN-014 | Must | Conflitos entre dispositivos offline devem ser detectados e sinalizados na sincronização. |
| FR-CIN-015 | Must | O sistema deve permitir estratégia operacional de divisão por portão/setor para reduzir conflitos offline. |
| FR-CIN-016 | Must | O dispositivo deve sincronizar automaticamente quando a conexão retornar. |
| FR-CIN-017 | Must | A sincronização deve ser idempotente. |
| FR-CIN-018 | Must | O coordenador deve visualizar vendidos, presentes, ausentes e taxa de entrada. |
| FR-CIN-019 | Must | O sistema deve suportar múltiplos dispositivos simultâneos. |
| FR-CIN-020 | Must | O sistema deve registrar versão do pacote offline e última sincronização. |
| FR-CIN-021 | Must | A sessão do operador deve expirar e poder ser revogada remotamente. |
| FR-CIN-022 | Must | O sistema deve exportar relatório final de check-ins e exceções. |

## 9.11 Backoffice e suporte

| ID | Prioridade | Requisito |
|---|---|---|
| FR-ADM-001 | Must | O backoffice deve permitir pesquisa global por organização, evento, pedido, pagamento, ingresso e pessoa. |
| FR-ADM-002 | Must | O suporte deve visualizar linha do tempo unificada do pedido. |
| FR-ADM-003 | Must | O suporte autorizado deve reenviar ingresso e corrigir e-mail. |
| FR-ADM-004 | Must | O suporte autorizado deve bloquear ou desbloquear ingresso com justificativa. |
| FR-ADM-005 | Must | O backoffice deve iniciar cancelamento ou reembolso conforme permissão. |
| FR-ADM-006 | Must | Ações irreversíveis ou financeiras devem exigir confirmação explícita. |
| FR-ADM-007 | Must | O backoffice deve exibir webhooks recebidos e estado de processamento. |
| FR-ADM-008 | Must | O administrador deve poder reprocessar eventos de forma segura e idempotente. |
| FR-ADM-009 | Must | O sistema deve permitir adicionar notas internas sem expô-las ao comprador. |
| FR-ADM-010 | Must | O sistema deve registrar quem acessou ou alterou dados sensíveis. |
| FR-ADM-011 | Must | O suporte não deve possuir acesso direto a dados completos de cartão. |
| FR-ADM-012 | Must | A impersonação, se implementada, deve ser temporária, visível, restrita e auditada. |
| FR-ADM-013 | Must | O sistema deve permitir suspender organização, evento ou usuário em caso de risco. |
| FR-ADM-014 | Must | O sistema deve manter motivo e histórico de suspensão. |
| FR-ADM-015 | Must | O backoffice deve exibir alertas de divergência financeira ou operacional. |

## 9.12 Financeiro, comissões e repasses

| ID | Prioridade | Requisito |
|---|---|---|
| FR-FIN-001 | Must | O sistema deve manter ledger ou extrato de movimentações financeiras imutáveis. |
| FR-FIN-002 | Must | O extrato deve distinguir venda, desconto, taxa, custo PSP, reembolso, chargeback, comissão e repasse. |
| FR-FIN-003 | Must | O sistema deve calcular valor líquido estimado por pedido e evento. |
| FR-FIN-004 | Must | O sistema deve registrar repasse previsto e realizado. |
| FR-FIN-005 | Must | O sistema deve permitir conciliar valor esperado com dados do PSP. |
| FR-FIN-006 | Must | Divergências devem gerar status e fila de resolução. |
| FR-FIN-007 | Must | O sistema deve impedir edição destrutiva de lançamentos financeiros; correções devem ocorrer por lançamento compensatório. |
| FR-FIN-008 | Must | O sistema deve gerar extrato por evento e período. |
| FR-FIN-009 | Must | O sistema deve exportar dados financeiros em CSV. |
| FR-FIN-010 | Must | O acesso a dados bancários e repasses deve ser restrito. |
| FR-FIN-011 | Must | Mudança de conta de recebimento deve exigir verificação e carência ou revisão conforme política antifraude. |
| FR-FIN-012 | Must | O sistema deve exibir comissões previstas, aprovadas, pagas e estornadas. |
| FR-FIN-013 | Must | O MVP pode registrar repasse executado externamente, desde que preserve reconciliação e auditoria. |

## 9.13 Notificações

| ID | Prioridade | Requisito |
|---|---|---|
| FR-NOT-001 | Must | O sistema deve enviar confirmação de pedido e ingresso por e-mail. |
| FR-NOT-002 | Must | O sistema deve enviar instruções de pagamento Pix. |
| FR-NOT-003 | Must | O sistema deve notificar pagamento aprovado, recusado ou expirado quando aplicável. |
| FR-NOT-004 | Must | O sistema deve notificar transferência de ingresso ao remetente e destinatário. |
| FR-NOT-005 | Must | O sistema deve notificar cancelamento, adiamento ou alteração relevante do evento. |
| FR-NOT-006 | Must | Falha de envio deve ser registrada e retentada conforme política. |
| FR-NOT-007 | Must | O backoffice deve permitir reenvio manual sem duplicar efeitos financeiros. |
| FR-NOT-008 | Should | O sistema deve disponibilizar templates por organização dentro de limites de identidade visual. |

## 9.14 Auditoria e logs de negócio

| ID | Prioridade | Requisito |
|---|---|---|
| FR-AUD-001 | Must | Toda ação sensível deve gerar evento de auditoria. |
| FR-AUD-002 | Must | O evento deve conter ator, organização, recurso, ação, data/hora, origem e justificativa quando exigida. |
| FR-AUD-003 | Must | Alterações devem registrar valor anterior e posterior, com proteção a dados sensíveis. |
| FR-AUD-004 | Must | Logs de auditoria não devem ser editáveis por usuários comuns. |
| FR-AUD-005 | Must | O backoffice deve permitir consulta por recurso, ator, período e ação. |
| FR-AUD-006 | Must | Exportação de dados pessoais e financeiros deve ser auditada. |
| FR-AUD-007 | Must | A retenção de auditoria deve seguir política jurídica e operacional aprovada. |

---

# 10. Regras de negócio

## 10.1 Inventário

| ID | Regra |
|---|---|
| BR-INV-001 | A soma de ingressos confirmados, cortesias que consomem capacidade e reservas válidas não pode exceder a capacidade disponível. |
| BR-INV-002 | A confirmação de inventário deve ocorrer em operação atômica ou mecanismo equivalente de consistência. |
| BR-INV-003 | Uma reserva expirada não pode ser reativada implicitamente por atualização de página. |
| BR-INV-004 | Alterar capacidade abaixo do total já comprometido é proibido. |
| BR-INV-005 | Cancelamentos liberam capacidade somente quando a regra comercial permitir revenda. |

## 10.2 Pedidos e pagamentos

| ID | Regra |
|---|---|
| BR-PAY-001 | Apenas confirmação confiável do PSP pode marcar pagamento como aprovado. |
| BR-PAY-002 | Um mesmo evento de pagamento não pode ser aplicado mais de uma vez. |
| BR-PAY-003 | Ingresso só pode ser emitido para pedido pago ou cortesia aprovada. |
| BR-PAY-004 | Reembolso deve afetar proporcionalmente itens, taxas, comissões e disponibilidade conforme política. |
| BR-PAY-005 | Chargeback não apaga a venda original; gera movimentação e estado compensatório. |
| BR-PAY-006 | Dados de cartão devem permanecer no ambiente do PSP sempre que possível. |

## 10.3 Promoters e atribuição

| ID | Regra |
|---|---|
| BR-PRM-001 | Atribuição deve ser determinada no momento documentado do funil e persistida com origem. |
| BR-PRM-002 | Regra padrão proposta: cupom explícito válido prevalece sobre link; na ausência de cupom, prevalece o link ativo mais recente dentro da janela configurada. |
| BR-PRM-003 | Mudança manual de atribuição após pagamento exige permissão e justificativa. |
| BR-PRM-004 | Comissão é devida apenas sobre itens pagos, não reembolsados e elegíveis. |
| BR-PRM-005 | A base de cálculo da comissão deve ser configurada: valor nominal, valor após desconto ou outra base aprovada. |
| BR-PRM-006 | Alteração de regra não deve recalcular vendas anteriores sem operação explícita. |

## 10.4 Ingressos

| ID | Regra |
|---|---|
| BR-TKT-001 | Cada ingresso válido possui um único token ativo de validação. |
| BR-TKT-002 | Transferência pode invalidar e regenerar o token para reduzir risco de compartilhamento. |
| BR-TKT-003 | O histórico de titularidade não pode ser apagado. |
| BR-TKT-004 | Ingresso reembolsado ou cancelado deve ficar inválido imediatamente após confirmação da operação. |
| BR-TKT-005 | Cortesia deve possuir origem, motivo e responsável. |

## 10.5 Check-in

| ID | Regra |
|---|---|
| BR-CIN-001 | Um ingresso válido deve possuir no máximo um check-in ativo. |
| BR-CIN-002 | Em modo online, a confirmação deve utilizar controle concorrente para impedir dupla aceitação. |
| BR-CIN-003 | Em modo offline, a prevenção é local ao dispositivo; conflitos entre dispositivos serão detectados na sincronização. |
| BR-CIN-004 | Check-in manual e reversão exigem permissão e justificativa. |
| BR-CIN-005 | Pacotes offline devem expirar e ser revogáveis quando o dispositivo retornar à rede. |
| BR-CIN-006 | Dados locais devem ser protegidos e removidos após encerramento ou expiração. |

## 10.6 Financeiro

| ID | Regra |
|---|---|
| BR-FIN-001 | Valores financeiros devem ser armazenados em unidade monetária inteira mínima, evitando ponto flutuante. |
| BR-FIN-002 | Lançamentos financeiros são imutáveis; ajustes usam lançamentos compensatórios. |
| BR-FIN-003 | O valor líquido exibido como estimado deve ser claramente diferenciado do valor liquidado. |
| BR-FIN-004 | Repasse não pode ser marcado como concluído sem referência ou evidência operacional. |
| BR-FIN-005 | Alteração de conta bancária não deve redirecionar automaticamente repasses já aprovados sem revisão. |

## 10.7 Privacidade

| ID | Regra |
|---|---|
| BR-PRV-001 | A coleta deve ser limitada ao necessário para compra, participação, obrigação legal e finalidades consentidas. |
| BR-PRV-002 | Marketing e execução do contrato devem possuir finalidades e bases legais separadas. |
| BR-PRV-003 | O promoter não deve visualizar dados pessoais de compradores além do mínimo necessário. |
| BR-PRV-004 | Exportações devem respeitar permissão, finalidade e auditoria. |
| BR-PRV-005 | Solicitações de titular devem ser registradas e rastreáveis. |

---

# 11. Estados e transições

## 11.1 Evento

```text
rascunho
→ publicado
→ vendas_pausadas ↔ publicado
→ vendas_encerradas
→ concluído
→ arquivado

publicado | vendas_pausadas | vendas_encerradas
→ adiado
→ publicado ou cancelado

rascunho | publicado | vendas_pausadas | vendas_encerradas | adiado
→ cancelado
```

Regras:

- `cancelado` e `arquivado` são estados terminais para venda;
- reativação após cancelamento exige novo evento ou processo excepcional aprovado;
- alteração de data relevante deve notificar compradores;
- `concluído` depende do encerramento operacional, não apenas do horário final.

## 11.2 Pedido

```text
criado
→ aguardando_pagamento
→ pago
→ parcialmente_reembolsado
→ reembolsado

aguardando_pagamento
→ expirado | cancelado

pago | parcialmente_reembolsado
→ chargeback
```

## 11.3 Pagamento

```text
criado
→ processando
→ aprovado
→ parcialmente_reembolsado
→ reembolsado

criado | processando
→ recusado | expirado | cancelado

aprovado | parcialmente_reembolsado
→ contestado | chargeback
```

## 11.4 Ingresso

```text
pendente_emissão
→ válido
→ transferido → válido
→ checkin_realizado

válido
→ bloqueado ↔ válido
→ cancelado | reembolsado

checkin_realizado
→ válido  (somente reversão autorizada)
```

## 11.5 Comissão

```text
calculada
→ prevista
→ aprovada
→ paga

calculada | prevista | aprovada
→ estornada

prevista | aprovada
→ ajustada  (com justificativa e trilha)
```

## 11.6 Repasse

```text
estimado
→ elegível
→ em_processamento
→ realizado

estimado | elegível | em_processamento
→ bloqueado | divergente

realizado
→ ajustado  (por lançamento compensatório)
```

---

# 12. Requisitos não funcionais

## 12.1 Segurança

| ID | Requisito |
|---|---|
| NFR-SEC-001 | O sistema deve seguir controles compatíveis com OWASP ASVS 5.0 para aplicações web e APIs, com escopo de verificação definido antes do go-live. |
| NFR-SEC-002 | APIs devem mitigar riscos de autorização em nível de objeto e função, especialmente em ambiente multi-tenant. |
| NFR-SEC-003 | Todo tráfego deve utilizar TLS moderno. |
| NFR-SEC-004 | Segredos devem permanecer em cofre ou serviço próprio, nunca no repositório. |
| NFR-SEC-005 | Senhas devem ser protegidas com algoritmo de derivação resistente e parâmetros atualizáveis. |
| NFR-SEC-006 | Sessões e tokens devem possuir expiração, rotação e revogação. |
| NFR-SEC-007 | Endpoints públicos devem possuir rate limiting, proteção contra automação abusiva e monitoramento. |
| NFR-SEC-008 | A aplicação não deve armazenar CVV e deve reduzir escopo PCI por tokenização/checkout hospedado. |
| NFR-SEC-009 | Logs não devem conter senhas, tokens completos, dados completos de cartão ou QR reutilizável. |
| NFR-SEC-010 | Dependências devem ser verificadas continuamente quanto a vulnerabilidades. |
| NFR-SEC-011 | Mudanças sensíveis exigem revisão de código e testes automatizados. |
| NFR-SEC-012 | Backups devem ser criptografados e ter restauração testada. |
| NFR-SEC-013 | Deve existir processo de resposta a incidentes, classificação, contenção, evidência e comunicação. |

## 12.2 Privacidade e LGPD

| ID | Requisito |
|---|---|
| NFR-PRV-001 | O sistema deve apoiar registro de finalidade, base legal e papéis de controlador/operador por tratamento. |
| NFR-PRV-002 | Deve existir inventário de dados pessoais e política de retenção. |
| NFR-PRV-003 | O sistema deve permitir atender solicitações de acesso, correção, portabilidade e eliminação quando aplicável. |
| NFR-PRV-004 | Exclusão deve respeitar retenções legais e financeiras, usando anonimização ou bloqueio quando necessário. |
| NFR-PRV-005 | Dados pessoais devem possuir controle de acesso por necessidade. |
| NFR-PRV-006 | Incidentes com risco ou dano relevante devem seguir processo compatível com a regulamentação da ANPD. |
| NFR-PRV-007 | O sistema deve registrar versão e prova de consentimento quando consentimento for a base escolhida. |
| NFR-PRV-008 | Ambientes de desenvolvimento e teste não devem usar dados pessoais reais sem proteção e autorização. |

## 12.3 Disponibilidade e recuperação

| ID | Requisito |
|---|---|
| NFR-AVL-001 | A meta inicial de disponibilidade mensal para checkout e APIs críticas será 99,9%, excluídas manutenções previamente comunicadas e falhas externas comprovadas. |
| NFR-AVL-002 | Na janela crítica do evento piloto, deve existir monitoramento reforçado e plantão operacional. |
| NFR-AVL-003 | O RPO alvo para dados transacionais será de até 15 minutos, preferencialmente menor para banco gerenciado. |
| NFR-AVL-004 | O RTO alvo para indisponibilidade crítica será de até 2 horas, com contingência operacional imediata para check-in. |
| NFR-AVL-005 | O sistema deve degradar de forma segura quando PSP, e-mail ou analytics estiverem indisponíveis. |
| NFR-AVL-006 | Falha de e-mail não pode invalidar compra ou impedir recuperação do ingresso. |

## 12.4 Performance e capacidade

| ID | Requisito |
|---|---|
| NFR-PER-001 | Páginas públicas devem atingir experiência adequada em conexão móvel comum, com meta de LCP p75 inferior a 2,5 segundos após otimização e medição real. |
| NFR-PER-002 | APIs internas não dependentes de terceiros devem ter p95 inferior a 500 ms em carga nominal. |
| NFR-PER-003 | Validação online de QR deve responder preferencialmente em até 700 ms, excluindo latência extrema de rede. |
| NFR-PER-004 | Validação offline local deve responder em até 200 ms em dispositivo suportado. |
| NFR-PER-005 | O sistema deve ser testado com pelo menos 10 vezes o pico previsto do piloto ou limite superior definido no plano de capacidade. |
| NFR-PER-006 | Operações pesadas de relatório e exportação devem ser assíncronas quando necessário. |
| NFR-PER-007 | O sistema deve suportar rajadas de abertura e virada de lote sem violar inventário. |

## 12.5 Confiabilidade e consistência

| ID | Requisito |
|---|---|
| NFR-REL-001 | Operações de inventário, pagamento, emissão e check-in devem ser idempotentes. |
| NFR-REL-002 | Mensagens assíncronas devem possuir retentativa controlada, fila de falhas e correlação. |
| NFR-REL-003 | Toda transação crítica deve possuir identificador de correlação ponta a ponta. |
| NFR-REL-004 | O sistema deve tolerar webhooks duplicados, atrasados e fora de ordem. |
| NFR-REL-005 | Tarefas assíncronas não podem gerar emissão ou reembolso duplicado. |
| NFR-REL-006 | Relatórios financeiros devem ser reproduzíveis a partir dos lançamentos de origem. |

## 12.6 Usabilidade e acessibilidade

| ID | Requisito |
|---|---|
| NFR-UX-001 | A experiência do comprador deve ser mobile-first. |
| NFR-UX-002 | Mensagens de erro devem indicar ação possível, sem expor detalhes internos. |
| NFR-UX-003 | Estados de pagamento e ingresso devem ser compreensíveis sem conhecimento técnico. |
| NFR-UX-004 | Fluxos públicos essenciais devem buscar conformidade WCAG 2.2 nível AA. |
| NFR-UX-005 | Interfaces de portaria devem usar alto contraste, alvos grandes e feedback imediato. |
| NFR-UX-006 | O sistema deve funcionar nos navegadores e dispositivos definidos na matriz de suporte. |

## 12.7 Observabilidade

| ID | Requisito |
|---|---|
| NFR-OBS-001 | O sistema deve coletar métricas, logs estruturados e rastreamento distribuído onde aplicável. |
| NFR-OBS-002 | Alertas devem cobrir falha de pagamento, backlog de filas, erro de emissão, divergência de inventário e indisponibilidade. |
| NFR-OBS-003 | Dashboards operacionais devem distinguir falhas internas de falhas do PSP. |
| NFR-OBS-004 | Logs técnicos e auditoria de negócio devem ser separados, correlacionáveis e protegidos. |
| NFR-OBS-005 | O dia do evento deve possuir painel de saúde e runbook acessível à equipe. |

## 12.8 Manutenibilidade

| ID | Requisito |
|---|---|
| NFR-MNT-001 | O código deve possuir testes automatizados para regras críticas. |
| NFR-MNT-002 | Migrações de banco devem ser versionadas, reversíveis quando possível e testadas. |
| NFR-MNT-003 | Contratos de API e webhooks devem ser versionados. |
| NFR-MNT-004 | Configurações de taxa, comissão e política não devem exigir deploy quando puderem ser parametrizadas com segurança. |
| NFR-MNT-005 | Feature flags devem ser usadas para liberar funções de risco no piloto. |
| NFR-MNT-006 | Documentação operacional e técnica deve ser atualizada junto com mudanças relevantes. |

---

# 13. Modelo de dados conceitual

## 13.1 Entidades principais

- **Organization:** produtora, dados cadastrais, identidade, configurações e status.
- **User:** identidade de acesso.
- **Membership:** vínculo entre usuário, organização, papel e permissões.
- **Event:** evento e seu ciclo de vida.
- **Venue / Sector / Gate:** local, setores e pontos de acesso.
- **TicketType:** categoria comercial do ingresso.
- **SalesBatch:** lote, preço, período e quantidade.
- **InventoryReservation:** reserva temporária de unidades.
- **Coupon:** desconto e regras.
- **Campaign / Attribution:** UTM, origem e promoter.
- **PromoterProfile:** perfil comercial e vínculo.
- **CommissionRule:** regra de cálculo versionada.
- **Order:** pedido do comprador.
- **OrderItem:** unidade comercial adquirida.
- **Payment:** tentativa ou transação no PSP.
- **PaymentEvent:** evento recebido do PSP.
- **Refund / Chargeback:** reversões financeiras.
- **Ticket:** direito de acesso emitido.
- **TicketHolderHistory:** histórico de titularidade.
- **CheckIn:** registro de entrada ou reversão.
- **CheckInDevice:** dispositivo autorizado.
- **OfflinePackage:** pacote de validação offline.
- **Customer:** comprador consolidado por organização.
- **Participant:** titular/participante associado ao ingresso.
- **Consent:** prova de consentimento e versão.
- **LedgerEntry:** lançamento financeiro imutável.
- **Payout:** repasse previsto ou realizado.
- **CommissionEntry:** comissão por venda e ajustes.
- **Notification:** envio, status e retentativas.
- **AuditEvent:** trilha de ações sensíveis.
- **SupportNote:** observações internas.

## 13.2 Regras de modelagem

- Todas as entidades de negócio da produtora devem possuir ou herdar escopo de organização.
- Identificadores públicos não devem ser sequenciais previsíveis quando isso ampliar risco.
- Valores monetários devem usar inteiro na menor unidade monetária.
- Datas devem ser armazenadas em UTC e exibidas no fuso do evento ou usuário.
- Estados devem ser explícitos e transições validadas.
- Dados derivados críticos devem ser reproduzíveis a partir de eventos ou lançamentos de origem.
- Exclusão física deve ser evitada para registros financeiros e de auditoria.

---

# 14. Integrações externas

## 14.1 PSP/adquirente

Capacidades mínimas:

- Pix dinâmico;
- cartão e parcelamento;
- tokenização ou checkout hospedado;
- webhooks assinados;
- consulta de transação;
- reembolso total e, preferencialmente, parcial;
- chargeback/disputa;
- split ou repasse, caso adotado;
- KYC/KYB, conforme modelo financeiro;
- ambiente de homologação confiável.

Critérios de seleção:

- custo total;
- estabilidade e documentação;
- prazo de liquidação;
- suporte;
- mecanismos antifraude;
- capacidade de conciliação;
- responsabilidades contratuais;
- escopo regulatório e PCI.

## 14.2 E-mail transacional

- API com entrega e eventos de bounce;
- templates responsivos;
- autenticação de domínio;
- retentativa;
- reputação e limites adequados;
- rastreabilidade sem vazar token do ingresso.

## 14.3 Armazenamento de arquivos

- imagens do evento e exportações;
- URLs assinadas para conteúdo privado;
- antivírus ou validação de arquivo quando aplicável;
- política de retenção e expiração.

## 14.4 Analytics e monitoramento

- eventos de funil sem dados pessoais desnecessários;
- correlação com pedidos e campanhas usando identificadores seguros;
- monitoramento de aplicações, filas, banco e integrações.

---

# 15. Analytics e eventos de produto

## 15.1 Eventos mínimos do funil

| Evento | Momento |
|---|---|
| `event_page_viewed` | Visualização da página pública |
| `ticket_selection_started` | Primeira seleção de ingresso |
| `inventory_reserved` | Reserva criada |
| `checkout_started` | Início do checkout |
| `coupon_applied` | Cupom aceito ou recusado |
| `payment_method_selected` | Escolha de Pix ou cartão |
| `payment_created` | Transação criada no PSP |
| `payment_approved` | Confirmação confiável de pagamento |
| `payment_failed` | Recusa, expiração ou erro |
| `ticket_issued` | Ingresso emitido |
| `ticket_transferred` | Transferência concluída |
| `checkin_accepted` | Entrada válida |
| `checkin_rejected` | Tentativa recusada |
| `refund_completed` | Reembolso confirmado |

## 15.2 Propriedades essenciais

- organização e evento;
- lote e tipo de ingresso;
- canal, campanha e promoter;
- método de pagamento;
- dispositivo e modo online/offline para check-in;
- identificador de correlação;
- motivo de falha normalizado;
- valores sem expor dados de cartão.

## 15.3 Métricas

### Comerciais

- conversão página → seleção;
- seleção → checkout;
- checkout → pagamento aprovado;
- vendas por canal e promoter;
- ticket médio;
- recompra por organização;
- uso de cupom;
- abandono por etapa.

### Operacionais

- tempo de criação do evento;
- falhas de emissão;
- solicitações de suporte por mil ingressos;
- tempo de resolução;
- check-ins por minuto;
- conflitos offline;
- percentual de exceções manuais.

### Financeiras

- GMV;
- take rate bruto e líquido;
- custo PSP;
- reembolso e chargeback;
- comissão;
- divergências de conciliação;
- valor repassado.

---

# 16. Critérios de aceite por épico

## EP-01 - Organizações, usuários e permissões

- Um usuário de uma organização não consegue ler ou alterar dados de outra organização.
- Convites expirados ou revogados não podem ser utilizados.
- A revogação de usuário encerra ou invalida sessões conforme política.
- Ações sensíveis aparecem na auditoria.

## EP-02 - Eventos e inventário

- O evento não pode ser publicado com configuração incompleta.
- Testes concorrentes não produzem venda acima da capacidade.
- Reservas expiradas retornam ao inventário uma única vez.
- Alterar capacidade abaixo do comprometido é bloqueado.

## EP-03 - Página e checkout

- O comprador conclui compra mobile sem criar senha.
- Preço total e taxas aparecem antes do pagamento.
- Atualizar a página não duplica pedido ou cobrança.
- Cupom e atribuição de promoter obedecem às regras documentadas.

## EP-04 - Pedidos e pagamentos

- Webhook duplicado não duplica emissão.
- Evento fora de ordem não regride estado de forma inválida.
- Pix só é aprovado após confirmação do PSP.
- Reembolso atualiza ledger, pedido, ingresso e comissão.

## EP-05 - Ingressos

- Cada ingresso possui apenas um token ativo.
- Transferência mantém histórico e invalida token anterior quando configurado.
- Ingresso bloqueado ou reembolsado é recusado no check-in.
- Reenvio não cria novo ingresso.

## EP-06 - Promoters

- Venda atribuída é reproduzível a partir do link/cupom e regras.
- Comissão é calculada somente sobre itens elegíveis.
- Reembolso estorna a comissão correspondente.
- Promoter visualiza apenas seus dados.

## EP-07 - Dashboard e participantes

- Totais do dashboard conferem com pedidos pagos e ledger.
- Filtros retornam dados consistentes.
- Exportação respeita a permissão do usuário.
- Comprador e participante são diferenciados.

## EP-08 - CRM inicial

- Segmentos produzem contagens reproduzíveis.
- Consentimento e opt-out são respeitados.
- Exportação é registrada em auditoria.
- Dados de outra organização não aparecem no segmento.

## EP-09 - Check-in

- Leitura online concorrente aceita apenas um check-in ativo.
- Dispositivo offline rejeita duplicidade local.
- Conflito entre dispositivos offline é sinalizado na sincronização.
- Check-in manual exige usuário autorizado e justificativa.
- Lista offline funciona sem rede durante simulação.

## EP-10 - Backoffice

- Suporte resolve reenvio, correção e bloqueio sem acesso ao banco.
- Reprocessamento é idempotente.
- Ações financeiras exigem confirmação reforçada.
- Histórico completo permanece consultável.

## EP-11 - Financeiro

- Extrato é reproduzível e não permite edição destrutiva.
- Reembolso e chargeback geram movimentos compensatórios.
- Valor estimado e liquidado são diferenciados.
- Repasse externo pode ser registrado com referência e responsável.

## EP-12 - Notificações e observabilidade

- Falha de e-mail entra em retentativa e pode ser reenviada.
- Alarmes são disparados para erros críticos simulados.
- Um pedido pode ser rastreado por correlação entre API, fila, PSP e emissão.
- Runbooks cobrem incidentes principais.

---

# 17. Plano do piloto

## 17.1 Pilot Brief obrigatório

Antes do congelamento técnico final, devem ser preenchidos:

- nome, tipo, local e data do evento;
- capacidade e público esperado;
- tipos, lotes, preços e políticas;
- volume previsto de Pix e cartão;
- quantidade de promoters e regras de comissão;
- quantidade de portões, dispositivos e operadores;
- pico previsto de vendas e check-in;
- plataforma atual e processo de migração;
- política de reembolso e repasse;
- responsáveis e contatos de emergência.

## 17.2 Estratégia recomendada

Preferência por piloto controlado ou paralelo, com quantidade limitada de ingressos, salvo quando a produtora aceitar operação integral e os critérios de prontidão forem atendidos.

## 17.3 Gates de prontidão

### Gate 1 - Funcional

- fluxos principais aprovados em homologação;
- catálogo de exceções testado;
- backoffice operacional;
- relatórios conferidos.

### Gate 2 - Financeiro

- contrato e responsabilidades do PSP definidos;
- reembolsos testados;
- conciliação aprovada;
- processo de repasse documentado.

### Gate 3 - Segurança e privacidade

- revisão de acesso multi-tenant;
- varredura de vulnerabilidades;
- testes de autorização;
- política de privacidade e termos aprovados;
- plano de incidentes aprovado.

### Gate 4 - Portaria

- dispositivos testados;
- pacote offline validado;
- carga e concorrência simuladas;
- equipe treinada;
- contingência impressa ou local disponível.

### Gate 5 - Go/no-go

A decisão de operar deve ser registrada por responsável do produto e responsável da produtora, com riscos conhecidos e plano de reversão.

## 17.4 Retrospectiva

Até dois dias úteis após o evento:

- consolidar métricas;
- comparar venda, pagamento, ingresso e check-in;
- registrar incidentes e exceções;
- entrevistar produtora, promoters e portaria;
- priorizar correções;
- decidir continuidade e próximo evento.

---

# 18. Plano de contingência

## 18.1 Antes do evento

- exportar lista de ingressos e participantes;
- gerar pacote offline em todos os dispositivos autorizados;
- testar pelo menos dois dispositivos reserva;
- testar carregadores, baterias e conectividade;
- simular QR válido, duplicado, cancelado e de outro evento;
- definir responsável técnico e coordenador de portaria;
- disponibilizar contatos e runbook;
- congelar mudanças de risco antes da abertura dos portões.

## 18.2 Durante o evento

- manter painel de saúde e canal de emergência;
- usar modo offline quando a rede estiver instável;
- registrar exceções e liberações manuais;
- separar filas para problemas;
- evitar que operador comum faça decisões financeiras ou de titularidade;
- manter dispositivo e fonte de energia reserva.

## 18.3 Cenários críticos

| Cenário | Resposta mínima |
|---|---|
| API indisponível | Ativar validação offline e acompanhar fila de sincronização |
| Internet local indisponível | Operar pacote offline e dividir portões para reduzir conflito |
| PSP indisponível | Pausar novas cobranças ou informar indisponibilidade sem perder pedidos existentes |
| E-mail indisponível | Manter recuperação web e fila de reenvio |
| Dispositivo perdido | Revogar sessão/pacote quando possível e registrar incidente |
| Inconsistência de inventário | Pausar venda afetada, preservar evidência e reconciliar antes de retomar |
| Evento cancelado | Bloquear vendas, comunicar compradores e iniciar plano financeiro/jurídico |

## 18.4 Depois do evento

- sincronizar todos os dispositivos;
- revogar pacotes offline;
- reconciliar conflitos;
- exportar relatório final;
- revisar logs e incidentes;
- validar repasse e comissões;
- remover dados locais dos dispositivos conforme política.

---

# 19. Riscos e mitigação

| Risco | Impacto | Mitigação |
|---|---|---|
| Overselling | Financeiro e reputacional | Reserva atômica, testes concorrentes e monitoramento |
| Webhook duplicado/fora de ordem | Emissão ou estado incorreto | Persistência, idempotência e reconciliação |
| Chargeback após repasse | Perda financeira | Reserva, política de risco e parceiro financeiro |
| Evento cancelado | Alto volume de reembolso | Processo jurídico-financeiro e comunicação em massa |
| Fraude de conta bancária | Desvio de valores | MFA, revisão, carência e alertas |
| Vazamento multi-tenant | Crítico | Autorização backend, testes BOLA e isolamento rigoroso |
| QR compartilhado | Conflito na entrada | Token único, transferência segura e primeira validação vence |
| Dois dispositivos offline validam o mesmo QR | Entrada duplicada | Divisão operacional, sincronização frequente e detecção de conflito |
| Falha de e-mail | Comprador sem acesso | Página web, recuperação e retentativa |
| Escopo excessivo | Atraso e baixa qualidade | Baseline, gates e mudança formal |
| Dependência de PSP | Indisponibilidade e custo | Contrato, observabilidade e abstração controlada |
| Ausência de suporte no evento | Incidente prolongado | Plantão, runbook e escalonamento |
| Tratamento inadequado de dados | Sanções e reputação | Privacy by design, revisão jurídica e controles ANPD/LGPD |

---

# 20. Dependências e decisões pendentes

## 20.1 Dependências externas

- definição e contratação do PSP;
- validação jurídica de termos, políticas e meia-entrada;
- definição tributária e documental da cobrança de taxas;
- provedor de e-mail;
- infraestrutura de hospedagem e observabilidade;
- dados completos do Pilot Brief;
- dispositivos disponíveis na portaria.

## 20.2 Decisões pendentes

| ID | Decisão | Prazo recomendado |
|---|---|---|
| DEC-001 | Nome e identidade do produto | Antes do protótipo visual final |
| DEC-002 | PSP e modelo de recebedor/split | Antes da arquitetura financeira |
| DEC-003 | Taxa da plataforma e quem a absorve | Antes do checkout final |
| DEC-004 | Base de cálculo de comissão | Antes do módulo de promoters |
| DEC-005 | Janela de atribuição de promoter | Antes do analytics de campanha |
| DEC-006 | Política de reembolso e cancelamento | Antes da homologação |
| DEC-007 | Regra de meia-entrada e documentos | Antes da criação dos tipos de ingresso |
| DEC-008 | Escopo do piloto: controlado, paralelo ou integral | Antes do go-live |
| DEC-009 | Meta de carga do evento piloto | Antes dos testes de performance |
| DEC-010 | Retenção de logs, auditoria e dados pessoais | Antes da produção |
| DEC-011 | Navegadores e dispositivos suportados | Antes da homologação de portaria |
| DEC-012 | MFA obrigatório por papel | Antes da produção |

---

# 21. Roadmap de implementação

## Fase 1 - Fundação

- organizações;
- usuários e permissões;
- autenticação;
- eventos;
- tipos, lotes e capacidade;
- auditoria básica.

**Marco:** evento configurável, ainda sem venda.

## Fase 2 - Motor de vendas

- página pública;
- checkout;
- inventário;
- pedidos;
- Pix e cartão;
- webhooks;
- emissão e e-mail.

**Marco:** primeira venda ponta a ponta em homologação.

## Fase 3 - Promoters

- cadastro e convite;
- links e cupons;
- atribuição;
- comissão;
- metas e painel.

**Marco:** proposta de valor comercial validável.

## Fase 4 - Operação e suporte

- participantes;
- transferências;
- cancelamentos e reembolsos;
- pesquisa global;
- backoffice;
- auditoria completa.

**Marco:** exceções resolvidas sem acesso manual ao banco.

## Fase 5 - Financeiro e CRM

- ledger;
- conciliação;
- repasses;
- comissões consolidadas;
- segmentos e exportações;
- campanhas rastreáveis.

**Marco:** fechamento financeiro reproduzível.

## Fase 6 - Check-in

- operadores e dispositivos;
- leitura online;
- pacote offline;
- sincronização e conflitos;
- relatórios.

**Marco:** simulação completa de portaria.

## Fase 7 - Hardening e piloto

- testes de carga e concorrência;
- testes de segurança;
- ensaio de contingência;
- treinamento;
- monitoramento e plantão;
- go/no-go.

**Marco:** piloto autorizado.

---

# 22. Definition of Ready e Definition of Done

## 22.1 Definition of Ready

Uma história está pronta para desenvolvimento quando:

- possui objetivo e usuário definidos;
- possui requisito e regra de negócio relacionados;
- possui critérios de aceite verificáveis;
- estados e erros relevantes estão descritos;
- dependências externas estão conhecidas;
- impacto em segurança, privacidade e auditoria foi avaliado;
- design ou fluxo necessário está disponível;
- dados de teste estão definidos.

## 22.2 Definition of Done

Uma entrega está concluída quando:

- código revisado e integrado;
- testes unitários e de integração passam;
- testes de autorização e isolamento aplicáveis passam;
- métricas, logs e alertas foram adicionados;
- documentação foi atualizada;
- migração foi testada;
- critérios de aceite foram demonstrados;
- comportamento de erro e retentativa foi validado;
- não existem vulnerabilidades críticas conhecidas;
- homologação do responsável de produto foi registrada.

## 22.3 Requisitos adicionais para fluxos críticos

Para inventário, pagamento, ingresso, financeiro e check-in:

- teste de concorrência;
- teste de idempotência;
- teste de repetição de mensagem/webhook;
- teste de falha parcial;
- teste de auditoria;
- plano de rollback ou compensação;
- evidência de observabilidade.

---

# 23. Glossário

| Termo | Definição |
|---|---|
| B2B2C | Modelo em que a plataforma atende a produtora e entrega experiência ao consumidor final |
| GMV | Volume financeiro bruto processado |
| Take rate | Percentual de receita da plataforma sobre o GMV |
| PSP | Provedor de serviços de pagamento |
| KYC/KYB | Verificação de identidade de pessoa/empresa |
| Ledger | Registro imutável de movimentações financeiras |
| Overselling | Venda acima da capacidade disponível |
| Idempotência | Propriedade que permite repetir uma operação sem duplicar seu efeito |
| Webhook | Notificação enviada por sistema externo para a plataforma |
| Promoter | Pessoa ou parceiro responsável por divulgar e gerar vendas |
| Atribuição | Regra que associa uma venda a canal, campanha ou promoter |
| Chargeback | Contestação de pagamento que pode resultar em reversão |
| PWA | Aplicação web instalável com capacidades offline |
| RPO | Máxima perda de dados aceitável em recuperação |
| RTO | Tempo alvo para restauração de serviço |
| LCP | Métrica de carregamento do maior elemento visível da página |
| BOLA | Falha de autorização em nível de objeto |
| LGPD | Lei Geral de Proteção de Dados Pessoais |
| PCI DSS | Padrão de segurança para dados de cartões de pagamento |

---

# 24. Referências normativas e técnicas

As referências abaixo orientam requisitos e devem ser revisadas na implantação:

1. [Lei nº 13.709/2018 - Lei Geral de Proteção de Dados Pessoais](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm)
2. [Resolução CD/ANPD nº 15/2024 - Comunicação de Incidente de Segurança](https://www.gov.br/anpd/pt-br/assuntos/comunicacao-de-incidentes-de-seguranca-cis)
3. [Guia de Segurança da Informação da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte)
4. [Lei nº 8.078/1990 - Código de Defesa do Consumidor](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm)
5. [Decreto nº 7.962/2013 - Comércio eletrônico](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm)
6. [Lei nº 10.962/2004 - Informação de preços](https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.962.htm)
7. [Lei nº 12.933/2013 - Meia-entrada](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12933.htm)
8. [Decreto nº 8.537/2015 - Regulamentação da meia-entrada](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/decreto/d8537.htm)
9. [Lei nº 13.179/2015 - Disponibilização de meia-entrada pela internet](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/L13179.htm)
10. [Normas e manuais do Pix - Banco Central do Brasil](https://www.bcb.gov.br/estabilidadefinanceira/pix-normas)
11. [PCI DSS - PCI Security Standards Council](https://www.pcisecuritystandards.org/standards/pci-dss/)
12. [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
13. [OWASP API Security Top 10](https://owasp.org/API-Security/)
14. [OWASP Top 10](https://owasp.org/Top10/2025/)

---

## Aprovação

| Papel | Nome | Data | Aprovação |
|---|---|---|---|
| Responsável pelo produto |  |  |  |
| Responsável técnico |  |  |  |
| Representante da produtora piloto |  |  |  |
| Jurídico/privacidade |  |  |  |

**Fim do documento.**
