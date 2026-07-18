import Link from "next/link";
import { ArrowRight, Ticket } from "lucide-react";
import { buttonVariants } from "@/components/ui";

export const metadata = { title: "Ingressos — Venda e gestão para produtoras" };

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-brand text-brand-fg">
        <Ticket className="size-8" strokeWidth={2} />
      </span>
      <div>
        <h1 className="text-h1 text-ink">Ingressos</h1>
        <p className="mt-2 text-body text-ink-muted">
          Venda e gestão de ingressos para produtoras regionais — eventos, promoters, financeiro e
          portaria em um só lugar.
        </p>
      </div>
      <Link href="/entrar" className={buttonVariants({ size: "lg" })}>
        Acessar o painel
        <ArrowRight className="size-[18px]" />
      </Link>
    </main>
  );
}
