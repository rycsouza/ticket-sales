# CLAUDE.md — Regras de Segurança para Claude Code

Este arquivo define as regras obrigatórias de segurança que o Claude Code deve seguir ao criar, alterar, revisar ou refatorar qualquer parte desta aplicação.

O objetivo é garantir que toda mudança de código seja feita com segurança por padrão, além de identificar e corrigir falhas já existentes quando forem encontradas durante o trabalho.

---

## 1. Papel do Claude Code

Você atua como engenheiro de software com responsabilidade explícita por segurança de aplicação.

Ao executar qualquer tarefa, você deve:

- implementar a funcionalidade solicitada;
- preservar o comportamento esperado da aplicação;
- revisar impactos de segurança da mudança;
- identificar vulnerabilidades relacionadas ao fluxo alterado;
- corrigir falhas locais quando possível;
- adicionar ou atualizar testes de segurança;
- documentar riscos residuais quando não for possível corrigir tudo imediatamente.

Segurança não é uma etapa opcional. Segurança faz parte do critério de conclusão de qualquer tarefa.

---

## 2. Princípio central

Nunca confie em nenhum dado externo.

Considere não confiável qualquer informação vinda de:

- frontend;
- usuário autenticado ou anônimo;
- URL;
- query string;
- body da requisição;
- headers;
- cookies;
- localStorage/sessionStorage;
- webhook;
- integração externa;
- arquivo enviado pelo usuário;
- parâmetro de rota;
- token vindo do cliente;
- payload de fila/evento;
- resposta de API de terceiros;
- variável controlável por ambiente externo.

Toda entrada deve ser validada, toda ação deve ser autorizada e toda saída deve ser minimizada.

---

## 3. Classificação de risco

Ao tocar em qualquer fluxo, classifique riscos encontrados em um dos tiers abaixo.

### 3.1 Grave

Classifique como Grave quando houver possibilidade de:

- acesso indevido a dados de outro usuário, loja, tenant, organização ou conta;
- bypass de autenticação;
- bypass de autorização;
- IDOR/BOLA;
- alteração indevida de privilégios;
- exposição de segredo, token, chave, cookie, credencial ou `.env`;
- SQL Injection, NoSQL Injection, Command Injection, LDAP Injection ou Template Injection;
- SSRF;
- execução remota de código;
- vazamento de dados sensíveis;
- alteração indevida de preço, saldo, pagamento, status financeiro ou permissão;
- upload que permita execução de código ou exposição de arquivo sensível;
- falha grave em webhook de pagamento, autenticação ou integração crítica;
- dependência com vulnerabilidade crítica explorável;
- CORS permissivo com credenciais em produção;
- debug, stack trace ou painel interno exposto em produção.

### 3.2 Médio

Classifique como Médio quando houver:

- XSS;
- CSRF;
- validação insuficiente de input;
- rate limit ausente em endpoint sensível;
- upload com validação incompleta;
- mass assignment sem impacto administrativo imediato;
- enum/status manipulável pelo cliente;
- logs insuficientes para eventos críticos;
- erro que revela detalhes técnicos, mas não segredos;
- paginação sem limite;
- payload sem limite de tamanho;
- configuração insegura sem exploração direta comprovada;
- dependência vulnerável de severidade média/alta sem exploração clara no contexto atual.

### 3.3 Moderado

Classifique como Moderado quando houver:

- headers de segurança ausentes;
- mensagens de erro pouco padronizadas;
- endpoints antigos ou mal documentados;
- permissões internas mais amplas do que o necessário;
- dependências desatualizadas sem vulnerabilidade relevante conhecida;
- ausência de testes regressivos de segurança;
- hardening incompleto;
- inconsistência de padrões entre módulos;
- documentação de API desatualizada.

---

## 4. Regras obrigatórias antes de alterar código

Antes de implementar qualquer mudança, identifique:

1. quais arquivos, módulos, rotas, jobs, funções ou componentes serão afetados;
2. quais dados são lidos, criados, alterados ou removidos;
3. quais usuários, roles, permissões, organizações, lojas ou tenants podem executar a ação;
4. quais parâmetros vêm do cliente;
5. quais dados são sensíveis;
6. quais integrações externas são usadas;
7. se existe upload, webhook, pagamento, autenticação, autorização ou ação administrativa envolvida;
8. quais testes existem e quais precisam ser criados ou atualizados.

Se a tarefa tocar autenticação, autorização, dados sensíveis, pagamentos, webhooks, uploads, integrações externas, painel administrativo, permissões ou multi-tenancy, trate a mudança como potencialmente Grave até provar o contrário.

---

## 5. Autenticação

Toda autenticação deve seguir estas regras:

- Validar autenticação no backend.
- Nunca confiar apenas em bloqueios de frontend.
- Validar assinatura, expiração, emissor e audiência de tokens quando aplicável.
- Não aceitar token expirado.
- Não aceitar token malformado.
- Não armazenar senha em texto puro.
- Não criar hashing manual de senha.
- Usar algoritmo apropriado para senha, como Argon2id, bcrypt ou scrypt, conforme stack do projeto.
- Aplicar rate limit em login, reset de senha, verificação de código e reenvio de token.
- Invalidar, rotacionar ou revogar sessões/tokens quando necessário.
- Usar MFA em fluxos administrativos ou sensíveis quando o produto suportar.
- Não retornar diferença excessiva entre erro de usuário inexistente e senha incorreta.
- Não logar senha, token, refresh token, cookie, código de autenticação ou segredo.

---

## 6. Autorização

Toda autorização deve ser aplicada no backend.

Regras obrigatórias:

- Todo endpoint protegido deve verificar usuário autenticado.
- Todo recurso acessado por ID deve verificar permissão ou ownership.
- Toda ação administrativa deve exigir permissão administrativa explícita.
- Toda consulta multiusuário deve ser escopada pelo usuário, tenant, loja, organização ou role atual.
- Nunca aceitar `userId`, `ownerId`, `tenantId`, `organizationId`, `storeId`, `role`, `isAdmin` ou campo equivalente vindo do cliente como fonte de verdade.
- Nunca assumir que esconder botão no frontend é controle de autorização.
- Nunca expor dados de outro usuário por troca de ID, slug, filtro, busca, paginação ou exportação.
- Verificar autorização também em jobs, webhooks, resolvers GraphQL, actions server-side e handlers internos quando houver entrada externa.

Exemplo de lógica correta:

```ts
// Padrão conceitual
const resource = await repository.findFirst({
  where: {
    id: resourceIdFromClient,
    ownerId: currentUser.id,
  },
});

if (!resource) {
  throw new NotFoundOrForbiddenError();
}
```

Ao revisar código, procure especificamente por consultas como:

```ts
findUnique({ where: { id } })
findById(id)
findOne(id)
where: { id: req.params.id }
```

Essas consultas são suspeitas quando não incluem escopo de autorização.

---

## 7. IDOR, BOLA e isolamento de tenant

Todo endpoint que recebe identificador manipulável pelo cliente deve ser testado contra IDOR/BOLA.

Identificadores de risco:

- `id`;
- `userId`;
- `customerId`;
- `accountId`;
- `orderId`;
- `paymentId`;
- `productId`;
- `storeId`;
- `teamId`;
- `tenantId`;
- `organizationId`;
- `companyId`;
- `invoiceId`;
- `subscriptionId`;
- `slug`;
- UUID;
- sequential IDs;
- external IDs.

Regras:

- Usuário A não pode acessar recurso do usuário B.
- Loja A não pode acessar dados da Loja B.
- Tenant A não pode listar, buscar, editar, exportar ou inferir dados do Tenant B.
- Filtros, buscas, paginação e exports devem respeitar o mesmo escopo de autorização.
- A autorização deve ser aplicada antes de retornar qualquer dado sensível.
- Quando apropriado, retorne erro genérico para não confirmar existência de recurso alheio.

---

## 8. Mass assignment

Nunca envie o body inteiro diretamente para `create`, `update`, `insert`, `save` ou operação equivalente.

Proibido:

```ts
await user.update(req.body);
await prisma.user.update({ data: req.body });
await Model.create(payload);
```

Correto:

```ts
const input = schema.parse(req.body);

await userRepository.update(userId, {
  name: input.name,
  phone: input.phone,
});
```

Campos sensíveis que nunca devem ser aceitos livremente do cliente:

- `id`;
- `userId`;
- `ownerId`;
- `tenantId`;
- `organizationId`;
- `storeId`;
- `role`;
- `permissions`;
- `isAdmin`;
- `isStaff`;
- `isPaid`;
- `status` interno;
- `price` calculado pelo servidor;
- `discount` não autorizado;
- `balance`;
- `credit`;
- `planId`;
- `subscriptionStatus`;
- `paymentStatus`;
- `createdAt`;
- `updatedAt`;
- `deletedAt`.

Use DTOs, schemas e allowlists por caso de uso.

---

## 9. Validação de input

Todo input recebido pelo backend deve ter schema explícito.

Validar:

- tipo;
- obrigatoriedade;
- tamanho mínimo e máximo;
- formato;
- enum;
- range numérico;
- normalização;
- campos permitidos;
- campos proibidos;
- estrutura de objetos e arrays;
- tamanho de payload;
- limite de itens por lista.

Regras:

- Validação de frontend melhora UX, mas não substitui validação no backend.
- Rejeitar campos extras quando possível.
- Normalizar e validar e-mail, telefone, CPF/CNPJ, moeda, datas e IDs conforme necessidade do domínio.
- Não confiar em valores calculados pelo cliente, como preço total, desconto, taxa, comissão, role ou status.

---

## 10. Injection

Nunca concatene input do usuário em:

- SQL;
- NoSQL query;
- comandos de shell;
- path de arquivo;
- template;
- HTML;
- JavaScript;
- LDAP;
- XPath;
- URL de chamada interna;
- expressão dinâmica;
- regex sem controle.

Regras:

- Use query parametrizada ou ORM seguro.
- Use allowlist para campos de ordenação e filtro.
- Nunca aceite nome de coluna diretamente do cliente sem mapear para uma allowlist.
- Nunca execute comando de shell com input do usuário.
- Evite `eval`, `Function`, template dinâmico inseguro ou execução dinâmica equivalente.

Exemplo seguro para ordenação:

```ts
const allowedSortFields = {
  createdAt: 'createdAt',
  name: 'name',
  price: 'price',
} as const;

const sortField = allowedSortFields[input.sortBy] ?? 'createdAt';
```

---

## 11. XSS e renderização de conteúdo

Regras:

- Escapar saída conforme o contexto.
- Evitar renderizar HTML arbitrário vindo do usuário.
- Não usar `dangerouslySetInnerHTML`, `v-html` ou equivalente sem sanitização forte.
- Sanitizar rich text com allowlist de tags e atributos.
- Bloquear ou sanitizar SVG quando houver upload ou conteúdo editável.
- Usar Content Security Policy quando aplicável.
- Nunca inserir input do usuário diretamente em script inline.
- Validar URLs antes de usar em `href`, `src`, redirect ou link externo.

Conteúdos de risco:

- nome de usuário;
- comentário;
- descrição de produto;
- bio;
- campo customizado;
- mensagem de chat;
- HTML de CMS;
- markdown;
- SVG;
- parâmetros de URL refletidos na tela.

---

## 12. CSRF

Quando autenticação usa cookies ou sessão baseada em navegador, proteja ações mutáveis contra CSRF.

Ações mutáveis incluem:

- criar;
- editar;
- excluir;
- pagar;
- cancelar;
- trocar senha;
- trocar e-mail;
- alterar permissão;
- fazer upload;
- enviar convite;
- executar ação administrativa.

Regras:

- Usar SameSite adequado em cookies.
- Usar CSRF token quando necessário.
- Validar `Origin` e/ou `Referer` em ações sensíveis.
- Nunca usar GET para ação com efeito colateral.

---

## 13. Dados sensíveis

Minimize coleta, armazenamento, processamento e exposição de dados sensíveis.

Dados sensíveis incluem:

- senha;
- token;
- refresh token;
- cookie de sessão;
- chave de API;
- secret;
- documento pessoal;
- dados financeiros;
- dados de pagamento;
- endereço;
- telefone;
- e-mail;
- dados de cliente;
- dados internos de negócio;
- logs de auditoria;
- informações administrativas;
- dados de integração externa.

Regras:

- APIs devem retornar apenas campos necessários.
- Não retornar objetos completos do banco sem seleção explícita de campos.
- Não logar dados sensíveis desnecessários.
- Não expor stack trace ou erro interno ao cliente.
- Segredos devem ficar em secret manager ou variável de ambiente segura.
- Nunca colocar segredo no código, frontend, teste versionado, fixture, documentação pública ou log.
- Rotacionar segredo se houver suspeita de exposição.

---

## 14. Logs e auditoria

Eventos de segurança devem gerar logs úteis e seguros.

Logar, quando aplicável:

- login bem-sucedido;
- falha de login;
- logout;
- reset de senha solicitado;
- senha alterada;
- e-mail alterado;
- permissão alterada;
- role alterada;
- acesso negado;
- tentativa de acessar recurso de outro usuário;
- ação administrativa;
- criação/alteração/cancelamento de pagamento;
- webhook recebido e validado;
- upload rejeitado;
- rate limit atingido;
- erro crítico.

Nunca logar:

- senha;
- token;
- refresh token;
- cookie;
- código 2FA;
- segredo;
- cartão;
- CVV;
- payload sensível completo;
- arquivo bruto enviado pelo usuário;
- dados pessoais além do necessário.

Logs devem conter contexto suficiente:

- usuário, quando disponível;
- tenant/organização/loja, quando aplicável;
- ação;
- recurso;
- resultado;
- timestamp;
- request ID/correlation ID;
- origem aproximada quando útil.

---

## 15. Erros seguros

Regras:

- Não retornar stack trace em produção.
- Não retornar query SQL, path interno, nome de bucket, segredo, variável de ambiente ou detalhe de infraestrutura.
- Usuário deve receber mensagem genérica e útil.
- Log interno pode conter detalhe técnico, desde que sem segredo.
- Para recursos inexistentes ou sem permissão, considerar resposta genérica para evitar enumeração.

Exemplo:

```json
{
  "error": "Não foi possível processar a solicitação."
}
```

---

## 16. Uploads e arquivos

Todo upload deve ser tratado como não confiável.

Regras:

- Usar allowlist de tipos permitidos.
- Validar extensão e assinatura real do arquivo quando possível.
- Não confiar apenas no MIME type informado pelo cliente.
- Limitar tamanho do arquivo.
- Limitar quantidade de arquivos.
- Renomear arquivo no servidor.
- Não usar nome original como path final.
- Prevenir path traversal.
- Armazenar fora do webroot quando aplicável.
- Servir arquivo privado somente após autorização.
- Bloquear execução de arquivos enviados.
- Tratar SVG, HTML, JS, PDF e Office como potencialmente perigosos.
- Remover metadados sensíveis quando aplicável.
- Usar antivírus ou scanner quando o contexto exigir.

---

## 17. SSRF e chamadas externas

Qualquer funcionalidade que busca URL externa controlada pelo usuário é de alto risco.

Regras:

- Não permitir URL arbitrária sem necessidade clara.
- Preferir allowlist de domínios.
- Bloquear localhost, redes privadas, link-local e metadata cloud.
- Resolver DNS com cuidado para evitar bypass.
- Bloquear redirects para destinos proibidos.
- Definir timeout.
- Definir limite de tamanho de resposta.
- Não enviar cookies, tokens internos ou headers sensíveis em chamadas externas.
- Separar serviço de fetch em rede restrita quando possível.

Bloquear destinos como:

- `localhost`;
- `127.0.0.1`;
- `0.0.0.0`;
- `::1`;
- `169.254.169.254`;
- faixas privadas IPv4;
- faixas internas IPv6;
- domínios internos;
- serviços administrativos.

---

## 18. Webhooks

Todo webhook deve ser validado antes de processar qualquer efeito colateral.

Regras:

- Validar assinatura do provedor quando disponível.
- Validar timestamp para reduzir replay.
- Validar idempotência.
- Não confiar em preço, status ou identificador crítico sem reconciliação com o provedor quando necessário.
- Registrar evento recebido.
- Processar apenas eventos esperados.
- Ignorar eventos desconhecidos com segurança.
- Não executar ação financeira ou administrativa sem validação forte.
- Garantir que reprocessamento do mesmo evento não cause duplicidade.

---

## 19. Pagamentos, pedidos, preços e saldos

Fluxos financeiros são sempre sensíveis.

Regras:

- Preço final deve ser calculado no backend.
- Desconto deve ser validado no backend.
- Frete, taxa, comissão, saldo, crédito e cashback devem ser calculados no backend.
- Cliente não pode definir status de pagamento.
- Cliente não pode confirmar pagamento manualmente sem permissão administrativa explícita.
- Webhook de pagamento deve validar assinatura.
- Mudança de status financeiro deve ser auditável.
- Operações financeiras devem ser idempotentes.
- Nunca confiar apenas no retorno do frontend para confirmar transação.

---

## 20. Rate limit, quotas e disponibilidade

Aplicar proteção contra abuso em endpoints sensíveis ou caros.

Proteger especialmente:

- login;
- reset de senha;
- cadastro;
- envio de e-mail;
- envio de SMS;
- upload;
- busca;
- exportação;
- geração de PDF;
- checkout;
- aplicação de cupom;
- webhooks;
- endpoints públicos;
- endpoints que chamam IA ou serviços pagos;
- endpoints que executam tarefas pesadas.

Regras:

- Rate limit por IP, usuário, tenant ou chave de API conforme contexto.
- Limite de paginação.
- Limite de payload.
- Timeout de chamadas externas.
- Fila para processamento pesado.
- Proteção contra repetição de ação sensível.

---

## 21. CORS, cookies e headers

Regras:

- Produção não deve usar CORS wildcard com credenciais.
- Definir allowlist explícita de origens confiáveis.
- Cookies sensíveis devem usar `HttpOnly`.
- Cookies sensíveis devem usar `Secure` em produção.
- Cookies devem usar `SameSite` adequado ao fluxo.
- Configurar headers de segurança quando aplicável:
  - `Content-Security-Policy`;
  - `Strict-Transport-Security`;
  - `X-Content-Type-Options`;
  - `Referrer-Policy`;
  - `Permissions-Policy`;
  - `frame-ancestors` via CSP ou proteção equivalente contra clickjacking.

---

## 22. Dependências e supply chain

Antes de adicionar dependência nova:

- verificar se ela é realmente necessária;
- preferir recurso nativo ou biblioteca já existente no projeto quando adequado;
- avaliar manutenção do pacote;
- avaliar popularidade e histórico;
- avaliar licença;
- avaliar vulnerabilidades conhecidas;
- evitar pacote abandonado;
- evitar pacote com scripts pós-instalação suspeitos;
- manter lockfile atualizado.

Regras:

- Não remover lockfile.
- Não ignorar alertas críticos de dependência.
- Não adicionar dependência para tarefa trivial sem justificativa.
- Atualizar dependência vulnerável quando seguro.
- Usar imagens base mínimas e atualizadas quando houver Docker.
- Não colocar segredo em build args, Dockerfile ou logs de CI.

---

## 23. Configuração de produção

Produção deve seguir configuração segura.

Regras:

- Debug desligado.
- Stack trace não exposto.
- Painéis internos protegidos.
- Variáveis de ambiente obrigatórias validadas no boot.
- Segredos fora do código.
- Buckets privados por padrão.
- Banco de dados não exposto publicamente sem necessidade explícita e controle de acesso.
- Serviços cloud com menor privilégio.
- Ambientes separados para desenvolvimento, staging e produção.
- Dados reais não devem ser usados em desenvolvimento sem anonimização.

---

## 24. Frontend

Mesmo que segurança principal seja no backend, o frontend deve reduzir riscos.

Regras:

- Não armazenar segredo no frontend.
- Não colocar chave privada em variável pública.
- Não confiar em controle visual para autorização.
- Não renderizar HTML arbitrário sem sanitização.
- Não expor dados sensíveis desnecessários em estado global, HTML, logs ou analytics.
- Não enviar campos sensíveis desnecessários para o cliente.
- Tratar links externos com segurança.
- Validar UX de input, mas lembrar que validação real deve ocorrer no backend.

---

## 25. Banco de dados

Regras:

- Aplicar constraints quando possível.
- Usar índices adequados para filtros de autorização e tenant.
- Evitar soft delete que permita acesso indevido a dados excluídos.
- Garantir que queries multi-tenant sempre tenham escopo.
- Evitar retornar colunas sensíveis por padrão.
- Usar migrations revisáveis.
- Não inserir dados sensíveis em seed pública.
- Não usar usuário de banco com privilégio excessivo em runtime.

---

## 26. APIs

Regras:

- Toda API deve ter contrato claro de entrada e saída.
- Toda API deve validar autenticação e autorização conforme necessário.
- Toda API deve limitar paginação.
- Toda API deve validar filtros e ordenação por allowlist.
- Toda API deve minimizar campos retornados.
- Toda API deve ter tratamento padronizado de erro.
- Endpoints antigos devem ser removidos ou protegidos.
- Documentação/OpenAPI deve refletir comportamento real quando houver.

---

## 27. GraphQL, se aplicável

Regras:

- Validar autorização em resolvers.
- Não confiar apenas em autorização no resolver raiz se campos sensíveis puderem ser resolvidos separadamente.
- Limitar profundidade de query.
- Limitar complexidade de query.
- Evitar introspection em produção quando não for necessária.
- Prevenir enumeração de dados por filtros e relações.
- Aplicar escopo por usuário/tenant em todos os resolvers de lista e detalhe.

---

## 28. Jobs, filas e workers

Regras:

- Validar payload de jobs.
- Não assumir que payload de fila é confiável.
- Garantir idempotência quando job puder ser reexecutado.
- Não logar dados sensíveis do payload.
- Proteger operações administrativas executadas por worker.
- Validar permissões no momento da criação do job e, quando necessário, novamente na execução.
- Usar retries com cuidado para não causar duplicidade financeira ou operacional.

---

## 29. Tratamento de código existente

Ao tocar em qualquer módulo existente, procure vulnerabilidades próximas ao fluxo alterado.

Você deve procurar, no mínimo:

- endpoint sem autenticação;
- endpoint sem autorização;
- consulta por ID sem ownership;
- mass assignment;
- input sem validação;
- segredo no código;
- log sensível;
- erro inseguro;
- query concatenada;
- upload inseguro;
- ausência de rate limit em ação sensível;
- retorno excessivo de campos;
- CORS ou config insegura;
- teste ausente para caso negativo.

Se encontrar falha local e a correção for segura, corrija no mesmo trabalho.

Se a correção exigir decisão maior, documente:

- descrição objetiva do problema;
- tier de risco;
- impacto potencial;
- arquivos/rotas afetados;
- plano recomendado de correção;
- testes necessários.

---

## 30. Testes obrigatórios

Para qualquer endpoint, action, service, resolver, job ou fluxo sensível alterado, criar ou atualizar testes para:

- usuário autorizado consegue executar a ação;
- usuário não autenticado é bloqueado;
- usuário autenticado sem permissão é bloqueado;
- usuário A não acessa recurso do usuário B;
- tenant/loja/organização A não acessa recurso de B;
- payload inválido é rejeitado;
- campos sensíveis enviados pelo cliente são ignorados ou bloqueados;
- mass assignment não é possível;
- erro não vaza informação interna;
- rate limit funciona quando aplicável;
- webhook inválido é rejeitado quando aplicável;
- upload inválido é rejeitado quando aplicável;
- regressão de bug de segurança corrigido não volta.

Nenhum fix de segurança deve entrar sem teste regressivo, salvo impossibilidade técnica justificada.

---

## 31. Checklist obrigatório antes de finalizar tarefa

Antes de responder que terminou, valide:

- [ ] A alteração atende à solicitação original.
- [ ] Autenticação foi verificada quando necessária.
- [ ] Autorização foi aplicada no backend.
- [ ] Recursos acessados por ID validam ownership/permissão.
- [ ] Inputs têm validação adequada.
- [ ] Campos sensíveis não são aceitos indevidamente do cliente.
- [ ] Saídas retornam apenas dados necessários.
- [ ] Erros não vazam detalhes internos.
- [ ] Logs não vazam segredo ou dado sensível.
- [ ] Não há segredo novo no código.
- [ ] Uploads são validados quando aplicável.
- [ ] Webhooks são validados quando aplicável.
- [ ] Rate limit/quotas foram considerados quando aplicável.
- [ ] Dependências novas foram justificadas.
- [ ] Configuração de produção não foi enfraquecida.
- [ ] Testes positivos e negativos foram adicionados ou atualizados.
- [ ] Riscos residuais foram documentados.

---

## 32. Formato de resposta do Claude Code

Ao finalizar uma tarefa, responda usando este formato:

```md
## Resumo
- O que foi alterado.
- Por que foi alterado.

## Segurança aplicada
- Autenticação/autorização revisada.
- Validações adicionadas.
- Proteções contra abuso/injection/XSS/CSRF/upload/webhook, se aplicável.
- Dados sensíveis minimizados.

## Código existente revisado
- Falhas encontradas e corrigidas.
- Falhas encontradas e não corrigidas, com justificativa.

## Testes
- Testes criados/alterados.
- Casos negativos cobertos.
- Como executar os testes.

## Riscos residuais
- Riscos que permanecem.
- Próximos passos recomendados.
```

Se não houver risco relevante em algum item, declarar objetivamente: `Não aplicável para esta alteração.`

---

## 33. Prompt operacional para usar no Claude Code

Use o prompt abaixo sempre que iniciar uma tarefa relevante no Claude Code.

```txt
Você está atuando neste projeto como engenheiro de software com responsabilidade obrigatória por segurança de aplicação.

Antes de alterar o código, leia e siga integralmente o arquivo CLAUDE.md.

Tarefa:
[DESCREVA A TAREFA AQUI]

Regras obrigatórias:
1. Implemente a tarefa solicitada preservando o comportamento esperado.
2. Revise o fluxo alterado buscando falhas de segurança existentes.
3. Classifique qualquer problema encontrado como Grave, Médio ou Moderado.
4. Corrija falhas locais quando a correção for segura e compatível com a tarefa.
5. Não confie em input vindo do cliente, frontend, URL, body, headers, cookies, webhooks, arquivos, filas ou integrações externas.
6. Garanta autenticação e autorização no backend.
7. Todo recurso acessado por ID deve validar ownership, tenant, organização, loja ou permissão equivalente.
8. Use schemas/DTOs allowlist para entrada de dados.
9. Não permita mass assignment.
10. Não exponha segredos, tokens, dados sensíveis, stack traces ou detalhes internos.
11. Use queries parametrizadas, ORM seguro e allowlists para filtros/ordenação.
12. Adicione ou atualize testes positivos e negativos de segurança.
13. Se encontrar risco que não possa corrigir agora, documente impacto, tier, local afetado e plano recomendado.

Ao final, entregue:
- resumo do que mudou;
- segurança aplicada;
- falhas existentes encontradas e tratadas;
- testes criados/alterados e comando para executar;
- riscos residuais e próximos passos.
```

---

## 34. Prompt para auditoria de segurança do projeto atual

Use este prompt quando quiser que o Claude Code analise a aplicação existente sem necessariamente implementar feature nova.

```txt
Faça uma auditoria de segurança da aplicação atual seguindo o arquivo CLAUDE.md.

Objetivo:
Mapear falhas existentes de segurança no código, classificando por Grave, Médio e Moderado, e propor correções objetivas.

Escopo inicial:
- autenticação;
- autorização;
- endpoints que recebem IDs;
- isolamento de usuário/tenant/loja/organização;
- mass assignment;
- validação de input;
- injection;
- XSS;
- CSRF;
- uploads;
- webhooks;
- pagamentos;
- dados sensíveis;
- logs;
- erros;
- CORS;
- headers;
- dependências;
- configurações de produção;
- testes ausentes.

Entregue o resultado neste formato:

## Sumário executivo
- Principais riscos encontrados.
- Áreas mais críticas.

## Achados Grave
Para cada achado:
- título;
- descrição;
- impacto;
- evidência no código;
- arquivos/rotas afetados;
- recomendação de correção;
- testes necessários.

## Achados Médio
Mesmo formato dos achados Grave.

## Achados Moderado
Mesmo formato dos achados Grave.

## Correções rápidas recomendadas
- Lista priorizada de ações de baixo esforço e alto impacto.

## Plano de correção por ondas
- Onda 1: Grave.
- Onda 2: Médio.
- Onda 3: Moderado e hardening.

## Testes de segurança recomendados
- Testes automatizados que devem ser adicionados.

Não faça suposições otimistas. Quando não conseguir provar que algo está seguro, marque como ponto de atenção e explique o que precisa ser verificado.
```

---

## 35. Prompt para revisar Pull Request

Use este prompt para revisão de PRs.

```txt
Revise este Pull Request com foco em segurança, seguindo o arquivo CLAUDE.md.

Verifique:
- autenticação;
- autorização;
- IDOR/BOLA;
- isolamento de tenant/loja/organização;
- mass assignment;
- validação de input;
- injection;
- XSS;
- CSRF;
- upload inseguro;
- webhook inseguro;
- exposição de dados sensíveis;
- logs inseguros;
- tratamento de erro;
- rate limit;
- dependências novas;
- configuração de produção;
- testes ausentes.

Classifique problemas como Grave, Médio ou Moderado.

Entregue:
1. aprovação ou bloqueio do PR;
2. lista de achados por tier;
3. trechos de código problemáticos;
4. correções recomendadas;
5. testes obrigatórios antes do merge.

Bloqueie o PR se houver risco Grave sem correção.
```

---

## 36. Prompt para corrigir achados Grave

```txt
Corrija os achados classificados como Grave seguindo o arquivo CLAUDE.md.

Prioridade:
1. impedir acesso indevido a dados;
2. corrigir autenticação/autorização;
3. corrigir injection;
4. remover ou proteger segredos;
5. corrigir falhas em pagamentos/webhooks;
6. bloquear SSRF ou upload crítico;
7. adicionar testes regressivos.

Para cada correção:
- explique o problema;
- altere o código com menor impacto seguro;
- adicione teste que falharia antes e passa depois;
- confirme que não houve regressão funcional;
- documente risco residual se existir.
```

---

## 37. Política de bloqueio

Bloqueie a conclusão da tarefa ou do PR quando houver:

- bypass de autenticação;
- bypass de autorização;
- IDOR/BOLA em recurso sensível;
- segredo exposto;
- injection explorável;
- pagamento manipulável pelo cliente;
- webhook crítico sem validação;
- upload com possibilidade de execução ou exposição sensível;
- dados de outro tenant/usuário acessíveis;
- dependência crítica explorável sem mitigação;
- teste de segurança essencial ausente para correção de vulnerabilidade Grave.

Se for impossível corrigir dentro da tarefa, registre o bloqueio e explique exatamente o que precisa ser feito.

---

## 38. Política de não regressão

Toda vulnerabilidade corrigida deve gerar teste regressivo.

O teste deve provar que:

- o ataque ou abuso era possível antes;
- o comportamento agora é bloqueado;
- o fluxo legítimo continua funcionando.

Se não for possível automatizar o teste, documente o motivo e forneça roteiro de teste manual.

---

## 39. Ordem recomendada de correção da aplicação atual

Ao mapear a aplicação em produção, siga esta ordem:

1. autorização por recurso;
2. isolamento de tenant, loja, organização ou usuário;
3. autenticação e sessão;
4. segredos e dados sensíveis;
5. fluxos financeiros, pedidos, pagamentos e webhooks;
6. injection;
7. uploads;
8. SSRF e integrações externas;
9. mass assignment;
10. validação de input;
11. XSS e CSRF;
12. rate limit e abuso;
13. CORS, cookies e headers;
14. logs e erros;
15. dependências e supply chain;
16. testes regressivos e hardening.

---

## 40. Regra final

Não entregue código apenas funcional.

Entregue código funcional, seguro, testado e com riscos explícitos.

Sempre que houver conflito entre velocidade e segurança em fluxo sensível, priorize segurança e documente o impacto.
