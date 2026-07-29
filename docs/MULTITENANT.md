# Arquitetura Multi-Tenant — Database por Tenant (Neon)

Como a separação física de tenants (produtoras) é implementada nesta
plataforma. O objetivo é **isolamento forte por padrão**: cada produtora tem
seu **próprio projeto Neon**, e uma produtora nunca lê, infere ou escreve
dados de outra — mesmo diante de bug de aplicação.

O desenho adapta o padrão já em produção no Sport55
(`landingpage-misto/docs/ARQUITETURA_MULTITENANT.md`), com uma diferença
estrutural: lá o tenant é resolvido pelo **host** (cada clube tem domínio
próprio); aqui a plataforma é **um domínio só**, e o tenant é resolvido por
**identificador público** (slug de evento, código de pedido, token de
ingresso…) ou pelo **path** (`/painel/[orgId]`). Domínio próprio por
produtora entra depois, como aditivo (§9).

> Público-alvo: engenharia. Referências apontam para o código real.
> Status: em migração — ver §8 (estágios). Fonte de verdade do progresso:
> tasks MT-1..MT-5.

---

## 1. Modelo em uma frase

**Database-per-tenant** (1 projeto Neon por produtora), com um **banco de
plataforma** central que guarda o registro dos tenants (connection string
**cifrada**), a **identidade global** (usuários, sessões, memberships) e o
**mapa de roteamento** `identificador público → org`. Não existe banco
"padrão" em produção — requisição sem tenant resolvido é barrada
(**fail-closed**, 404 genérico anti-enumeração).

```
 /painel/[orgId] ────────────► orgId no path + membership (platform DB)
 /evento/[slug] ─────────────► public_refs(event_slug) ──► org
 /pedido (code) ─────────────► public_refs(order_code) ──► org
 /t/[token] ─────────────────► public_refs(ticket_token_hash) ──► org
 /api/webhooks/mercadopago ──► dedupe (platform) → public_refs(provider_tx) ──► org
                                          │
                                          ▼
                            getTenantPrisma(orgId)
                            URL cifrada → decifra → Neon do tenant
        ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
        │ Neon tenant A │   │ Neon tenant B │   │ Neon tenant C │
        └───────────────┘   └───────────────┘   └───────────────┘

        ┌────────────────────────────────────────────────────────┐
        │ PLATFORM DB — tenants (URL cifrada), users, sessions,   │
        │ memberships, invites, public_refs, payment_events       │
        └────────────────────────────────────────────────────────┘
```

---

## 2. Os dois planos de banco

### 2.1 Platform DB (`PLATFORM_DATABASE_URL`)

Banco único da plataforma. **Não** guarda dado de negócio das produtoras —
só o registro dos tenants, a identidade global e o roteamento. Schema em
[`packages/db/prisma/platform/schema.prisma`](../packages/db/prisma/platform/schema.prisma).

| Tabela | Papel | Estágio |
|---|---|---|
| `Tenant` | 1 linha por produtora: `id` (espelha `Organization.id` do tenant), `slug`, `status`, `plan`, `databaseUrlEncrypted` (**AES-256-GCM**), `directUrlEncrypted`. | MT-1 ✅ |
| `User`, `Session`, `TrustedDevice` | Identidade global. Um usuário pertence a N orgs; no login o tenant ainda não é conhecido — auth vive na plataforma. (≠ Sport55, onde o admin vive dentro do tenant.) | MT-2 |
| `Membership`, `Invite` | Usuário × org × papel. É o que permite "listar minhas organizações" sem varrer N bancos. | MT-2 |
| `PublicRef` | Mapa `(kind, key) → orgId` com `@@unique(kind, key)`. Kinds: `event_slug`, `order_code`, `ticket_token_hash`, `promoter_code`, `provider_tx`, `invite_token_hash`. Além de rotear, **preserva a unicidade global** que o Postgres único dava de graça (`Event.slug`, `Order.code`, `Ticket.tokenHash`). | MT-3 |
| `PaymentEvent` | Dedupe de webhook por `providerEventId` **antes** de rotear ao tenant. | MT-3 |
| `PlatformAuditEvent` | Auditoria de ações sem escopo de org (o `AuditEvent.organizationId` nullable de hoje já anunciava esse split). | MT-2 |

Cliente: `getPlatformPrisma()` — singleton sobre `PLATFORM_DATABASE_URL`
([`packages/db/src/platform.ts`](../packages/db/src/platform.ts)).

### 2.2 Tenant DBs (um projeto Neon por produtora)

Todo o negócio da produtora: eventos, inventário, pedidos, pagamentos,
tickets, promoters/cupons, ledger, CRM, check-in, ofertas e o `AuditEvent`
da org. Mesmo schema de aplicação em todos
([`packages/db/prisma/schema.prisma`](../packages/db/prisma/schema.prisma));
migrations aplicadas **por tenant** (fan-out, MT-4).

A connection string de cada tenant fica **cifrada** em
`Tenant.databaseUrlEncrypted` e só é decifrada em runtime, no servidor,
para abrir a conexão.

**FKs que cruzam a fronteira deixam de existir**: `Promoter.membershipId` e
`CheckinAssignment.membershipId` referenciam `Membership` (plataforma) —
viram referências *soft* (sem FK), validadas na aplicação e reconciliáveis.

---

## 3. Resolução de tenant (o caminho de um request)

Duas famílias de rota:

**A) Staff — `/painel/[orgId]/*` e `/api/painel/.../[orgId]/...`**
O tenant vem do **path**. A borda (`requireOrgContext`) valida a sessão
(platform DB) e o **membership ativo** do usuário naquela org (platform DB)
— só então abre a conexão do tenant. O `organizationId` continua vindo da
sessão+path, **nunca** do body (invariante atual preservada).

**B) Público — evento, pedido, ingresso, check-in, afiliado, webhook**
Nenhum host/path de tenant. A borda resolve pelo **identificador público**:

1. Redis first: `tenant:ref:<kind>:<key>` (sem TTL; invalidação explícita).
2. Miss: `PublicRef` no platform DB; grava no Redis.
3. Ref inexistente → **404 genérico** (mesma resposta para "não existe" e
   "sem permissão" — anti-enumeração, padrão já vigente).

**Webhook Mercado Pago** (o caso mais crítico — a plataforma é recebedora
única, DEC-002; 1 conta MP, 1 secret, zero pista de tenant no payload):
verificar assinatura → **dedupe** em `PaymentEvent` (platform) →
`public_refs(provider_tx)` → processar no tenant. Pagamento sem ref (janela
de corrida) → evento `FAILED` + retry do provedor cobre a lacuna (o
processamento já é idempotente e tolerante a redelivery).

**Fail-closed:** em produção, chegar à camada de dados sem org resolvida
**lança** — não há banco default. Em dev, `DATABASE_URL` continua servindo
como conveniência local (espelha o `isDevLocalhost` do Sport55).

---

## 4. Camada de dados

[`packages/db/src/index.ts`](../packages/db/src/index.ts) +
[`platform.ts`](../packages/db/src/platform.ts) +
[`tenant.ts`](../packages/db/src/tenant.ts):

- `getPrisma(url)` — cache **por URL** (Map). ⚠️ A versão anterior usava
  `globalThis.prisma ??=` e **ignorava a URL após a primeira chamada**: num
  mundo multi-URL, o tenant que aquecesse a instância serverless serviria
  seu banco a todos os demais. Corrigido no MT-1.
- `getPlatformPrisma(url)` — client do schema da plataforma (gerado em
  `src/generated/platform-client`).
- `createTenantDbResolver({ platformUrl, encryptionKeyHex })` →
  `getTenantDb(orgId)`: consulta `Tenant` (status `ACTIVE`), **decifra** a
  URL com `ENCRYPTION_KEY_PLATFORM_DB`, abre o client e cacheia **por
  orgId, por instância** serverless. A URL decifrada não é retida — só o
  client. `invalidateTenant(orgId)` derruba o cache da instância.

Composição de serviços ([`apps/web/src/lib/services.ts`](../apps/web/src/lib/services.ts)):
`getServices()` (singleton global, 249 call sites) se divide em

- `getPlatformServices()` — auth, identity, memberships, roteamento;
- `getTenantServices(orgId)` — o grafo de repositórios de negócio,
  construído sobre `getTenantDb(orgId)` e cacheado por org (MT-2).

Cifra ([`packages/db/src/encryption.ts`](../packages/db/src/encryption.ts)):
AES-256-GCM, chave de 32 bytes (`ENCRYPTION_KEY_PLATFORM_DB`, 64 hex),
formato `base64( iv[12] | authTag[16] | ciphertext )` — **idêntico ao
Sport55**, para reuso de tooling.

---

## 5. Isolamento e defesa em profundidade

O isolamento deixa de depender de `WHERE organizationId = …` correto em
cada query (fonte clássica de vazamento). Ele passa a ser **físico**.

1. **Separação física** — 1 projeto Neon por produtora: compute, storage,
   backup/PITR e branching próprios. Restore/export por tenant.
2. **Escopo lógico mantido** — os repositórios continuam exigindo
   `organizationId` (defesa em profundidade + o dado carrega seu dono, o
   que mantém export/migração/merge triviais).
3. **URL cifrada em repouso** — AES-256-GCM; decifrada só no servidor.
4. **Fail-closed** — ref/org não resolvida nunca cai em outro tenant.
5. **Cache sempre com escopo** — toda chave de cache carrega `orgId`/ref;
   não há cache global que misture tenants.
6. **Least-privilege** — runtime conecta com papel `app_runtime` (CRUD,
   sem DDL); migrations usam papel elevado só no fan-out (MT-4).
7. **Invariante central (inalterada):** `organizationId` vem **sempre** da
   sessão + membership verificado, ou de ref resolvida pela plataforma —
   **nunca** de input do cliente.

---

## 6. Admin da plataforma

Hoje: allowlist `PLATFORM_ADMIN_EMAILS` (DEC-003) gateando `/plataforma`
(taxa e repasses). No mundo multi-DB:

- Config global (taxa default, flags) vive no **platform DB** e é lida
  pelos tenants na borda — "a plataforma repassa aos tenants".
- Relatórios agregados (repasses de todas as orgs): **fan-out ao vivo**
  sobre os tenants ativos, com o ledger de cada tenant como fonte de
  verdade. Rollup materializado só se a latência doer (decisão adiada de
  propósito — sincronia é superfície de erro financeiro).

---

## 7. Operação

Scripts em [`scripts/`](../scripts) — **dry-run por padrão**, só escrevem
com `--commit`, nunca ecoam segredo:

| Script | O que faz |
|---|---|
| `encrypt-db-url.mts` | Cifra uma URL avulsa com a chave da plataforma. |
| `register-tenant.mts` | Upsert de um tenant: cifra a URL e grava em `Tenant`. Idempotente por `id`. |

**Provisionar uma produtora nova (MT-4):**

1. Criar o projeto Neon (API) e rodar as migrations de aplicação.
2. Criar o papel `app_runtime` (CRUD only) e obter a connection string.
3. `register-tenant.mts --commit` → cifra e registra.
4. Invalidar caches (Redis + reciclagem de instância quando trocar URL).

**Migrations:** plataforma e tenant têm trilhas separadas
(`prisma/platform/migrations` × `prisma/migrations`). Aplicação nos
tenants é fan-out de `prisma migrate deploy` org a org, com registro de
versão e tratamento de falha parcial (MT-4).

---

## 8. Estágios de entrega

Cada estágio é deployável. Progresso nas tasks MT-1..MT-5.

| Estágio | Entrega | Estado |
|---|---|---|
| **MT-1 Fundação** | Platform schema (`Tenant`), cifra, `getPlatformPrisma`/`getTenantDb`, fix do `??=`, env/config/scripts, tenants legados registrados apontando para o banco atual. Zero mudança de comportamento. | ✅ |
| **MT-2 Split lógico** | Identidade global move para o platform schema; `getPlatformServices()` × `getTenantServices(orgId)`; refs soft de membership. Ainda 1 banco físico. | — |
| **MT-3 Roteamento** | `PublicRef` + reserva de ref **antes** da escrita no tenant; webhook/rotas públicas resolvendo pela plataforma; Redis + invalidação. | — |
| **MT-4 Operação** | Provisionamento via API Neon; fan-out de migrations; jobs (retention/sweeps) por tenant. | — |
| **MT-5 Corte** | Re-provisionar as orgs de dev em projetos próprios; remover o banco default do runtime (fail-closed pleno); atualizar ARQUITETURA §6. | — |
| *(futuro)* | Domínio próprio por produtora: tabela `tenant_domains` + resolução por host no middleware — o desenho do Sport55 encaixa aqui sem mudança de modelo. | — |

**Consistência sem transação cross-DB** (regra dos estágios 3+): a ref
pública é **reservada na plataforma antes** de gravar no tenant; falha no
meio deixa uma ref órfã (inócua, reciclável por reconciliação), nunca um
recurso inalcançável ou duplicado. Efeitos externos continuam idempotentes.

---

## 9. Variáveis de ambiente

| Var | Papel |
|---|---|
| `PLATFORM_DATABASE_URL` | Banco da plataforma (pooled). |
| `PLATFORM_DIRECT_URL` | Banco da plataforma, conexão direta (migrations). |
| `ENCRYPTION_KEY_PLATFORM_DB` | Chave AES-256-GCM (64 hex) que cifra as URLs dos tenants. Gerar: `openssl rand -hex 32`. |
| `DATABASE_URL` / `DIRECT_URL` | **Transitório/dev**: banco único legado. Após MT-5, só conveniência de dev — produção não tem DB default. |

Toda var nova **precisa** entrar em `turbo.json → globalPassThroughEnv`
(o build da Vercel roda em env podado; var ausente ali chega vazia ao
runtime — já causou o 404 do `/plataforma`).

---

## 10. Checklist de invariantes (revisão de código)

- [ ] Query de negócio usa o client do **tenant resolvido** (nunca um
      client default em produção).
- [ ] `orgId` vem de sessão+membership, path validado ou `PublicRef` —
      nunca de body/query/cookie não assinado.
- [ ] Ref pública nova é **reservada na plataforma antes** do insert no
      tenant.
- [ ] Toda chave de cache carrega `orgId` (ou a ref) no nome.
- [ ] Mutação de tenant (URL/status) invalida Redis + considera reciclagem
      das instâncias (connCache é por instância).
- [ ] Rota nova que roda sem tenant resolvido usa o **platform DB**
      conscientemente (jobs, callbacks, auth).
- [ ] Nenhuma connection string ou chave em log, erro, código ou bundle.
- [ ] Checklist §31 do CLAUDE_SECURITY_RULES continua valendo integralmente.
