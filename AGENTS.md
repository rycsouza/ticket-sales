# AGENTS.md — Convenções de engenharia

Guia operacional para qualquer agente/dev trabalhando neste repositório. Os documentos de referência são a fonte de verdade:

- **O quê:** [docs/PRD.md](docs/PRD.md) — requisitos (FR-*), regras de negócio (BR-*), NFRs, estados, épicos EP-01..12.
- **Limites obrigatórios:** [docs/CLAUDE_SECURITY_RULES.md](docs/CLAUDE_SECURITY_RULES.md) — regras de segurança. **Leia antes de alterar qualquer fluxo sensível** (auth, autorização, pagamentos, webhooks, uploads, multi-tenancy). Segurança é critério de conclusão de tarefa, e o formato de resposta da §32 é obrigatório ao concluir.
- **Como:** [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — decisões de arquitetura, módulos, infra.

## Stack

Node 22 + TypeScript (strict) · pnpm workspaces + Turborepo · Next.js App Router na Vercel · Prisma + Neon Postgres · Upstash Redis/QStash · Mercado Pago (via `PspPort`) · Mailtrap · Cloudinary (imagens públicas) / Cloudflare R2 (arquivos privados) · Vitest · Zod · Sentry + pino.

## Comandos

```bash
pnpm install              # instalar dependências
pnpm dev                  # apps/web em desenvolvimento
pnpm build                # build de tudo (turbo)
pnpm typecheck            # tsc em todos os pacotes
pnpm lint                 # eslint
pnpm test                 # vitest (unit + integração)
pnpm db:generate          # prisma generate
pnpm db:migrate           # prisma migrate dev (usa DIRECT_URL)
pnpm db:studio            # prisma studio
```

## Estrutura do monorepo

```text
apps/web/            # Next.js: (public) (dashboard) (promoter) (backoffice) + API
apps/checkin/        # PWA de portaria (criada na Fase 6)
packages/core/       # NÚCLEO DE DOMÍNIO — proibido importar next/react/vercel aqui
  modules/<nome>/    # um diretório por módulo (ver ARQUITETURA §5)
  shared/            # dinheiro, erros, ids, clock, tipos
  ports/             # interfaces: PspPort, MailerPort, StoragePort, QueuePort, CachePort
packages/db/         # Prisma schema, migrations, client
packages/config/     # validação de env com Zod no boot
```

**Regra de dependência (inegociável):** `apps/*` → `packages/core` → `packages/db`. O core nunca importa de `apps/*` nem de SDKs de vendor; vendors implementam `ports/` e são injetados na borda.

## Padrão de módulo (`packages/core/modules/<nome>/`)

```text
<nome>/
  service.ts        # casos de uso; recebe deps por injeção (repos, ports, clock)
  repository.ts     # acesso a dados; TODA função exige organizationId no escopo
  schemas.ts        # Zod: input allowlist (`.strict()`), output com seleção explícita
  errors.ts         # erros de domínio tipados
  index.ts          # API pública do módulo (só exporte o necessário)
  __tests__/        # testes do módulo
```

- **Serviços** recebem `ctx: { organizationId, userId, role, correlationId }` resolvido pela borda a partir da **sessão** — nunca do body/params.
- **Repositórios escopados:** não existe query sem `organizationId` em tabela de negócio. `findFirst({ where: { id, organizationId } })`, nunca `findUnique({ where: { id } })`.
- Módulo não acessa tabela de outro módulo; comunica-se via serviço (in-process) ou evento assíncrono (QStash).

## Convenções de código

- **Idioma:** código, identificadores e mensagens de commit em **inglês**; docs e textos de UI em **pt-BR**.
- **Dinheiro:** inteiro em **centavos** (`Int`/`BigInt` no banco, tipo `Money` do core). Proibido `float` e aritmética decimal em JS.
- **Datas:** UTC no banco (`timestamptz`); conversão de fuso só na exibição.
- **IDs:** UUIDv7 como PK; identificadores públicos nunca sequenciais. Tokens (ingresso, convite, magic link) gerados com CSPRNG e armazenados com hash.
- **Erros:** classes de erro de domínio no core; a borda mapeia para HTTP com **mensagem genérica** (sem stack, sem detalhe interno). 404 genérico para recurso inexistente **ou** sem permissão (anti-enumeração).
- **Validação:** todo input externo passa por schema Zod `.strict()` na borda **antes** de chegar ao serviço. Campos sensíveis (role, organizationId, status, price...) jamais vêm do cliente.
- **Idempotência:** operação com efeito externo/financeiro exige chave de idempotência (tabela `idempotency_key`). Webhooks: persistir cru → deduplicar por `provider_event_id` → processar.
- **Estados:** máquinas de estado do PRD §11 implementadas como transições explícitas validadas; transição inválida = erro, nunca "corrigida" silenciosamente.
- **Ledger e auditoria:** append-only. Nunca `UPDATE`/`DELETE` em `LedgerEntry`/`AuditEvent`; correção via lançamento compensatório.
- **Logs:** pino estruturado com `correlationId`; **nunca** logar senha, token, cookie, cartão, QR ou payload sensível completo.

## Testes (Vitest)

- Unit: regras de domínio no core, sem banco (repos fake).
- Integração: repositórios e fluxos contra Postgres real (Neon branch ou Docker local).
- **Obrigatórios para todo endpoint/serviço sensível** (CLAUDE_SECURITY_RULES §30): autorizado passa · não autenticado bloqueado · sem permissão bloqueado · org A não acessa org B · payload inválido rejeitado · mass assignment impossível.
- **Fluxos críticos** (inventário, pagamento, emissão, check-in): teste de concorrência (N paralelos não ultrapassam capacidade) + idempotência (repetição não duplica efeito).
- Todo fix de segurança ganha teste regressivo.

## Git

- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`), escopo por módulo: `feat(inventory): ...`.
- Nunca commitar `.env*` (exceto `.env.example`), segredos ou dados reais.
- Migrations sempre no mesmo commit da mudança de schema que as exige.

## Checklist antes de concluir qualquer tarefa

1. Checklist de segurança da §31 do [CLAUDE_SECURITY_RULES.md](docs/CLAUDE_SECURITY_RULES.md).
2. `pnpm typecheck && pnpm lint && pnpm test` verdes.
3. Requisito do PRD referenciado (FR-*/BR-*) atendido e testado.
4. Resposta no formato da §32 das regras de segurança.
