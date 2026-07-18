"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Não foi possível criar a organização.");
        return;
      }
      router.push(`/painel/${data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="rounded-xl bg-white p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="mb-1 block text-sm font-medium">Nova organização</label>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-base outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          placeholder="Nome da produtora"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-bold text-white active:bg-brand-600 disabled:opacity-40"
        >
          Criar
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </form>
  );
}
