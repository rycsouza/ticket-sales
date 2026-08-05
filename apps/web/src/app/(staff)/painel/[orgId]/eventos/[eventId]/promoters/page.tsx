import { redirect } from "next/navigation";

/**
 * Seção OCULTA por decisão de produto (navegação enxuta) — serviços e APIs
 * continuam existindo; para reativar, restaure a página no histórico do git
 * e re-adicione o item de navegação no panel-shell.
 */
export default async function HiddenSection({
  params,
}: {
  params: Promise<{ orgId: string; eventId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/painel/${orgId}`);
}
