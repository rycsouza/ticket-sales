import type { Metadata } from "next";
import { CheckinConsole } from "./checkin-console";

export const metadata: Metadata = { title: "Portaria — Ingressos" };

/** Operator check-in console (EP-09). Online validation; camera + offline are
 * progressive enhancements over the same API. */
export default function CheckinPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-md p-4">
      <CheckinConsole />
    </main>
  );
}
