"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui";
import { ConfirmDialog } from "../../../ui";

/** Toggle promotional communications for one buyer, with confirmation. */
export function CommunicationButton({
  orgId,
  email,
  optedOut,
}: {
  orgId: string;
  email: string;
  optedOut: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function apply() {
    const res = await fetch(`/api/orgs/${orgId}/customers/opt-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, optedOut: !optedOut }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "Não foi possível atualizar." };
    router.refresh();
    return { ok: true };
  }

  return (
    <>
      <Button
        variant={optedOut ? "outline" : "outline"}
        size="sm"
        leftIcon={optedOut ? <BellRing className="size-4" /> : <BellOff className="size-4" />}
        onClick={() => setOpen(true)}
      >
        {optedOut ? "Reativar comunicações" : "Desativar comunicações promocionais"}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title={optedOut ? "Reativar comunicações promocionais?" : "Desativar comunicações promocionais?"}
        description={
          optedOut
            ? "O comprador voltará a poder receber campanhas e mensagens promocionais."
            : "O comprador deixará de receber campanhas e mensagens promocionais."
        }
        confirmLabel={optedOut ? "Reativar comunicações" : "Desativar comunicações"}
        tone={optedOut ? "primary" : "danger"}
        onConfirm={apply}
      />
    </>
  );
}
