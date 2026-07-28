import type { Metadata, Viewport } from "next";
import { CheckinConsole } from "./checkin-console";

export const metadata: Metadata = {
  title: "Portaria — Ingressos",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Portaria" },
};

export const viewport: Viewport = { themeColor: "#111111" };

/** Operator check-in console (EP-09). Online validation; camera + offline are
 * progressive enhancements over the same API. */
export default function CheckinPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-md p-4">
      <CheckinConsole />
    </main>
  );
}
