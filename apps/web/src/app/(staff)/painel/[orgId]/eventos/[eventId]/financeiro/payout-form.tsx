"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Alert, Button, Field, Input, MoneyInput } from "@/components/ui";
import { ConfirmDialog } from "../../../../ui";
import { fmtBRL } from "@/lib/status";

export function PayoutForm({ apiBase }: { apiBase: string }) {
  const router = useRouter();
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [memo, setMemo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [ok, setOk] = useState(false);

  const memoValid = memo.trim().length >= 3;
  const amountValid = amountCents !== null && amountCents > 0;

  async function submit() {
    const res = await fetch(`${apiBase}/payouts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents, memo: memo.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error ?? "Não foi possível registrar o repasse." };
    }
    setAmountCents(null);
    setMemo("");
    setOk(true);
    setTimeout(() => setOk(false), 3000);
    router.refresh();
    return { ok: true };
  }

  return (
    <>
      <Alert tone="info" icon={<Info className="size-5" />} className="mb-4">
        Este registro não realiza uma transferência. Ele apenas informa ao sistema que um pagamento
        foi feito externamente (por exemplo, um Pix da plataforma para a produtora).
      </Alert>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (amountValid && memoValid) setConfirming(true);
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Valor" htmlFor="po-amount">
            <MoneyInput id="po-amount" valueCents={amountCents} onChangeCents={setAmountCents} />
          </Field>
          <Field
            label="Referência"
            htmlFor="po-memo"
            hint="Identifique o pagamento (comprovante, meio, destinatário)."
          >
            <Input
              id="po-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Ex.: Pix 20/07 — comprovante 1234"
            />
          </Field>
        </div>
        <div aria-live="polite">
          {ok && <p className="text-small text-success-text">Repasse registrado.</p>}
        </div>
        <Button type="submit" disabled={!amountValid || !memoValid}>
          Registrar repasse
        </Button>
      </form>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Registrar repasse externo?"
        description={
          <>
            Você vai registrar um repasse de{" "}
            <strong className="text-ink">{amountCents !== null ? fmtBRL(amountCents) : "—"}</strong>{" "}
            (ref.: {memo.trim() || "—"}). Isto <strong>não movimenta dinheiro</strong> — apenas
            registra no sistema um pagamento feito externamente.
          </>
        }
        confirmLabel="Registrar repasse"
        onConfirm={submit}
      />
    </>
  );
}
