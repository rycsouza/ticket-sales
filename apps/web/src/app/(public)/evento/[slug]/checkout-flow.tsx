"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Estado compartilhado do passo do checkout, elevado acima dos blocos da página.
 * Permite que os blocos de marketing (hero, countdown, faq…) e o CTA flutuante
 * desapareçam assim que o comprador avança do passo 1 (seleção de ingressos)
 * para os passos de dados/revisão — deixando só o checkout na tela.
 */
interface CheckoutFlow {
  step: number;
  setStep: (step: number) => void;
}

const CheckoutFlowContext = createContext<CheckoutFlow | null>(null);

export function CheckoutFlowProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState(1);
  return (
    <CheckoutFlowContext.Provider value={{ step, setStep }}>
      {children}
    </CheckoutFlowContext.Provider>
  );
}

export function useCheckoutStep(): CheckoutFlow {
  const ctx = useContext(CheckoutFlowContext);
  if (!ctx) throw new Error("useCheckoutStep must be used within a CheckoutFlowProvider");
  return ctx;
}

/** Renderiza os filhos apenas no passo 1; some quando o checkout avança. */
export function StepOneOnly({ children }: { children: ReactNode }) {
  const { step } = useCheckoutStep();
  if (step !== 1) return null;
  return <>{children}</>;
}
