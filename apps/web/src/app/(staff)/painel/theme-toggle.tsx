"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export type PanelTheme = "light" | "dark";

/**
 * Panel-only dark-mode switch. Sets data-theme on the shell root (scoped, so it
 * never leaks to the public checkout, whose theme is per-event) and persists it
 * in a cookie so the server renders the right theme with no flash on reload.
 */
export function ThemeToggle({ initial }: { initial: PanelTheme }) {
  const [theme, setTheme] = useState<PanelTheme>(initial);

  function toggle() {
    const next: PanelTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.getElementById("panel-shell")?.setAttribute("data-theme", next);
    document.cookie = `panel_theme=${next}; path=/; max-age=31536000; samesite=lax`;
  }

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-body font-medium text-ink-muted transition-colors hover:bg-hover hover:text-ink"
    >
      {dark ? <Sun className="size-5 shrink-0" strokeWidth={1.75} /> : <Moon className="size-5 shrink-0" strokeWidth={1.75} />}
      {dark ? "Tema claro" : "Tema escuro"}
    </button>
  );
}
