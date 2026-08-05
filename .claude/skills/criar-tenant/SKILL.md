---
name: criar-tenant
description: Onboarding completo de um novo tenant (produtora) — entrevista os dados, cria a organização no platform DB e provisiona o banco Neon dedicado. Use quando pedirem para "criar tenant/organização/produtora X".
---

# Criar tenant (onboarding de produtora)

Fluxo em 3 fases: **entrevista → criação (platform DB) → provisionamento (banco dedicado)**. Docs de referência: `docs/MULTITENANT.md` (§7 e MT-6: 1 projeto Neon por tenant).

## Fase 1 — Entrevista

Colete o que estiver faltando (aceite tudo de uma vez se o usuário já mandar). Pergunte APENAS o que não foi informado:

| Dado | Obrigatório | Default / observação |
|---|---|---|
| Nome da organização | sim | — |
| Slug | não | derivado do nome (minúsculas, sem acento, hífens); vira `/painel/<slug>` e `/<slug>` |
| Nicho | não | `EVENTOS` \| `VIAGENS` — define vocabulário (viagens/vagas/embarque) |
| Fuso horário | não | `America/Sao_Paulo`; IANA válido (ex.: `America/Campo_Grande`) |
| Dono: nome + e-mail | sim | — |
| Senha do dono | se usuário novo | usuário já existente reusa a senha atual (a flag é ignorada); mínimo 12 chars |
| Cor da marca | não | `#rrggbb` — tinge painel e vitrine; sem cor = defaults |
| Taxa da plataforma | não | `--fee-bps` (500 = 5%) + `--fee-mode BUYER|PRODUCER`; default 0/PRODUCER |
| Logo | não | precisa de upload Cloudinary — configurar DEPOIS via `/plataforma/<orgId>` (editor da vitrine) |

Antes de rodar, confirme o resumo com o usuário em uma mensagem só.

## Fase 2 — Criar organização (platform DB)

Script: `scripts/create-tenant.mts` (DRY-RUN por padrão; cria Organization + dono OWNER + settings + vitrine opcional; slug duplicado aborta).

```bash
node --experimental-strip-types scripts/create-tenant.mts \
  --name "<Nome>" --slug <slug> --niche VIAGENS --timezone America/Campo_Grande \
  --owner-email dono@exemplo.com --owner-name "<Nome do Dono>" --owner-password "<senha>" \
  --brand-color "#f59e0b" --fee-bps 500 --fee-mode PRODUCER
```

1. Rode SEM `--commit` e mostre o plano ao usuário.
2. Com aval, repita com `--commit`.
3. **Anote o `Organization.id` impresso** — é a entrada da fase 3.

(`npx tsx` também funciona quando disponível; `node --experimental-strip-types` não depende de download.)

## Fase 3 — Provisionar banco dedicado (MT-6)

Script existente: `scripts/provision-tenant.mts` (cria projeto Neon, roda migrations, registra a URL CIFRADA no platform DB). Convenção de nome do projeto: `ingressos-<slug>`. Requer `NEON_API_KEY` no `.env` (se faltar, PARE e peça ao usuário para adicioná-la — nunca invente/peça o valor em chat público).

```bash
node --experimental-strip-types scripts/provision-tenant.mts \
  --id <Organization.id> --slug <slug> --name "<Nome>" \
  --neon-project ingressos-<slug> --commit
```

Dry-run primeiro (sem `--commit`) se o usuário quiser revisar. Em DEV sem Neon, a alternativa é `--create-database ingressos_t_<slug>` (mesmo host do `DATABASE_URL`).

## Fase 4 — Verificação (obrigatória antes de reportar)

1. Tenant registrado: consultar o platform DB (script temporário em `scripts/tmp-*.mts`, apagar depois) — `Tenant.status = ACTIVE`, `Organization` com niche/timezone corretos, membership OWNER.
2. Com o dev server rodando: `/painel/<slug>` responde (login do dono ou de um admin da plataforma) e `/<slug>` retorna 404 até a vitrine ser habilitada (esperado).
3. Informe ao usuário: credenciais do dono (só o e-mail — NUNCA repita a senha no relatório), 1º login pede setup de TOTP (MFA ativo), e que logo/vitrine se configuram em `/plataforma/<orgId>`.

## Regras de segurança (inegociáveis)

- **Nunca ecoar** connection strings, senhas, hashes ou `NEON_API_KEY` em logs, commits ou respostas.
- Dry-run SEMPRE antes de `--commit`; slug duplicado aborta — não contornar.
- Scripts temporários de verificação: criar em `scripts/`, apagar após uso; jamais commitar `tmp-*`.
- Nada de `DROP`/`TRUNCATE`/reset — provisionamento só CRIA.
- Em PROD (Vercel), lembrar o usuário: novo tenant não exige redeploy (resolução é dinâmica), mas o `NEON_API_KEY` é só local/ops — nunca vai para a Vercel.
