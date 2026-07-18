"use client";

import { useParams } from "next/navigation";
import QRCode from "react-qr-code";

/**
 * Renders the validation QR from the token already present in the buyer's
 * URL. Client-side on purpose: the raw token never travels in a response
 * body or server-rendered markup beyond what the URL itself carries.
 */
export function TicketQr() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  if (!token) return null;

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <QRCode value={token} size={200} aria-label="QR Code do ingresso" />
    </div>
  );
}
