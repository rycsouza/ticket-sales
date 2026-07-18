# Prontidão para piloto (Fase 7)

Estado do produto e checklist de segurança/operação para autorizar o piloto.
Atualizado em 2026-07-18.

## 1. Escopo entregue (Fases 1–6)

| Fase | Épico | Estado |
|---|---|---|
| 1 Fundação | EP-01, EP-12 | ✅ identidade, papéis, sessões opacas, auth Argon2, auditoria append-only |
| 2 Motor de vendas | EP-02/03/04/05 | ✅ eventos, inventário atômico (zero overselling), checkout, Pix, emissão de ingressos |
| 3 Promoters | EP-06 | ✅ links, cupons, atribuição, comissão versionada + estorno |
| 4 Operação/suporte | EP-05, EP-12 | ✅ transferência/bloqueio/correção de ingresso, loop de reembolso, timeline + notas |
| 5 Financeiro/CRM | EP-08, EP-11 | ✅ taxa por evento, ledger imutável, resumo, exports CSV auditados, base de compradores |
| 6 Check-in | EP-09 | ✅ operadores, validação online, admissão idempotente, pacote/sync offline, console de portaria |

Superfícies: UI pública do comprador (mobile-first), login de staff, console de portaria; ~60 rotas de API. **~187 testes** (unit + integração, incl. concorrência real no Neon). typecheck/build verdes.

## 2. Postura de segurança (CLAUDE_SECURITY_RULES §31)

- **Multi-tenancy (§7):** todo repositório de negócio é escopado por `organizationId`; testes "org A não acessa org B" em todos os módulos. 404 genérico anti-enumeração.
- **Autorização (§6):** por caso de uso, derivada da **sessão** (nunca do body); allowlists de papéis por módulo. Verificado: nenhuma rota de staff sem `requireOrgContext`/`requireAuth` (exceção correta: aceite de convite, pré-auth por token).
- **Mass assignment (§8/§19):** todo input externo passa por Zod `.strict()`; preço, desconto, taxa, status, role, organizationId jamais vêm do cliente.
- **Dinheiro (§19, BR-FIN-001):** centavos inteiros; totais, desconto, taxa e comissão recomputados server-side; ledger imutável reproduz relatórios.
- **Idempotência (§7):** chaves únicas (orderItem, providerEventId, orderId+tipo no ledger/comissão, ticketId no check-in) + transições guardadas; webhooks e sync offline seguros a retentativa.
- **Segredos (§13):** tokens (sessão, convite, ingresso) com CSPRNG, só hash SHA-256 no banco; serializers auditados — nenhum vaza `tokenHash`/`passwordHash`/`idempotencyKey`/QR.
- **Erros (§15):** classes de domínio → HTTP genérico na borda; sem stack/detalhe interno.
- **Rate limiting:** todas as rotas públicas e o login têm limite por IP/e-mail (Upstash).
- **Auditoria (EP-12):** append-only; ações sensíveis (reembolso, bloqueio, transferência, cortesia manual, opt-out, export, check-in manual/undo) registradas com ator/justificativa.

## 3. Runbook operacional (antes do piloto)

1. **Env (Vercel):** `DATABASE_URL`/`DIRECT_URL` (Neon), `UPSTASH_*`, `MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_WEBHOOK_SECRET`, `MAILTRAP_*`, `APP_BASE_URL`. (Todas presentes em dev.)
2. **QStash Schedule:** criar agendamento `POST {APP_BASE_URL}/api/jobs/sweep` a cada 1 min (expira reservas vencidas — FR-INV-007).
3. **Webhook Mercado Pago:** apontar para `{APP_BASE_URL}/api/webhooks/mercadopago` (URL pública; não alcança localhost — usar deploy/túnel).
4. **Migrações:** `pnpm db:migrate`. Se o pooler do Neon travar o advisory lock, usar `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=true`.

## 4. Itens pendentes de pré-produção (decisão ou trabalho dedicado)

Estes **não devem ser inventados** — exigem decisão de negócio ou trabalho de infraestrutura dedicado e testado:

- **DEC-010 Retenção/anonimização de dados/logs (LGPD):** política a definir → job de retenção/anonimização. *Decisão do usuário.*
- **DEC-012 MFA por papel:** exigir MFA para papéis sensíveis (proprietário/financeiro)? *Decisão do usuário.*
- **RLS (defesa em profundidade):** políticas Postgres por `organizationId` + GUC de sessão. Hoje o isolamento é garantido na aplicação (repos escopados + testes). RLS é camada extra; requer implementação e teste dedicados antes de produção (ARQUITETURA §20).
- **Conciliação de PSP (FR-FIN-005/006):** custo real do PSP e liquidação → hoje PSP cost = 0 no ledger; reconciliar quando houver dados reais do MP.
- **PWA de portaria — câmera + offline:** leitura por câmera e service worker/IndexedDB sobre o pacote offline (o domínio `pack`/`sync` já suporta). Validação online já operável.
- **Exports assíncronos + Cloudflare R2:** hoje CSV síncrono (atende escala-piloto). R2 + fila para volumes grandes/arquivos privados.
- **Teste de carga/p95 real** no ambiente de produção (NFR-PER).

## 5. Conclusão

O núcleo transacional (vendas, pagamento, emissão, comissão, financeiro, check-in) está implementado, isolado por organização, idempotente e coberto por testes — incluindo concorrência real. O produto é demonstrável de ponta a ponta. Os itens da §4 são os gates conscientes para autorizar o piloto em produção.
