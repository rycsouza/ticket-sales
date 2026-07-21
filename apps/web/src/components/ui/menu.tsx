"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { buttonVariants, type ButtonVariant, type ButtonSize } from "./button";

const MenuContext = createContext<{ close: () => void } | null>(null);

/**
 * Accessible dropdown menu: click/Escape/outside-click to close, focus returns
 * to the trigger on Escape. Reused for the event sales control and every
 * per-item context menu. Items are declared as <MenuItem>.
 */
export function Menu({
  triggerContent,
  triggerAriaLabel,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName,
  align = "end",
  children,
}: {
  triggerContent: ReactNode;
  triggerAriaLabel?: string | undefined;
  triggerVariant?: ButtonVariant | undefined;
  triggerSize?: ButtonSize | undefined;
  triggerClassName?: string | undefined;
  align?: "start" | "end" | undefined;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerAriaLabel}
        className={buttonVariants({ variant: triggerVariant, size: triggerSize, className: triggerClassName })}
        onClick={() => setOpen((v) => !v)}
      >
        {triggerContent}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute top-full z-30 mt-1 min-w-[12rem] overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <MenuContext.Provider value={{ close: () => setOpen(false) }}>
            {children}
          </MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  href,
  external,
  destructive,
  disabled,
}: {
  icon?: ReactNode | undefined;
  children: ReactNode;
  onSelect?: (() => void) | undefined;
  href?: string | undefined;
  external?: boolean | undefined;
  destructive?: boolean | undefined;
  disabled?: boolean | undefined;
}) {
  const ctx = useContext(MenuContext);
  const className = cn(
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-body transition-colors",
    disabled
      ? "cursor-not-allowed text-ink-faint"
      : destructive
        ? "text-danger hover:bg-danger-bg"
        : "text-ink-soft hover:bg-hover",
  );

  if (href && !disabled) {
    return (
      <Link
        href={href}
        role="menuitem"
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={className}
        onClick={() => ctx?.close()}
      >
        {icon && <span className="shrink-0 text-ink-faint">{icon}</span>}
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={className}
      onClick={() => {
        onSelect?.();
        ctx?.close();
      }}
    >
      {icon && <span className={cn("shrink-0", destructive ? "text-danger" : "text-ink-faint")}>{icon}</span>}
      {children}
    </button>
  );
}

/** Non-interactive separator/label inside a menu. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="border-b border-line px-3 pb-1.5 pt-1 text-caption font-semibold uppercase tracking-wide text-ink-faint">
      {children}
    </p>
  );
}
