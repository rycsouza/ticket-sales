import { redirect } from "next/navigation";

/**
 * Aba REMOVIDA por decisão de produto: os KPIs consolidados moraram no
 * Dashboard. Serviços e APIs continuam existindo; para reativar, restaure a
 * página no histórico do git e re-adicione o item de navegação no panel-shell.
 */
export default async function HiddenSection({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/painel/${orgId}`);
}
