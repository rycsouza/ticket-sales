import "server-only";

import { NextResponse } from "next/server";

/**
 * Minimal, safe CSV builder. Fields with comma/quote/newline are quoted and
 * internal quotes doubled (RFC 4180). A leading '=' / '+' / '-' / '@' is
 * prefixed with a quote+apostrophe guard to prevent spreadsheet formula
 * injection (CSV injection) on export.
 */
function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeField).join(",")];
  for (const row of rows) lines.push(row.map(escapeField).join(","));
  // Trailing newline + BOM so Excel opens UTF-8 (accented pt-BR) correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function csvResponse(filename: string, csv: string): NextResponse {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
