"use client";

import { useEffect, useState } from "react";
import type { PageBlock } from "@ingressos/core";
import type { PublicEventView } from "@/lib/public-views";
import { EventPageView } from "@/app/(public)/evento/[slug]/event-page-view";

/** Draft handed over by the page editor via sessionStorage. Mirrors the page
 * fields the editor controls; everything else comes from the saved event. */
interface PageDraft {
  brandColor: string | null;
  theme: "light" | "dark";
  logoUrl: string | null;
  bannerUrl: string | null;
  faviconUrl: string | null;
  backgroundUrl: string | null;
  blocks: PageBlock[];
}

/**
 * Renders the sales page for preview. If the editor left an unsaved draft in
 * sessionStorage (same tab session), overlay it so the producer sees exactly
 * what they have on screen — before saving. Otherwise shows the saved page.
 */
export function PreviewClient({
  event,
  mpPublicKey,
  storageKey,
}: {
  event: PublicEventView;
  mpPublicKey: string | null;
  storageKey: string;
}) {
  const [view, setView] = useState<PublicEventView>(event);
  const [draftApplied, setDraftApplied] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const d = JSON.parse(raw) as PageDraft;
      setView({
        ...event,
        page: {
          ...event.page,
          brandColor: d.brandColor,
          theme: d.theme,
          logoUrl: d.logoUrl,
          bannerUrl: d.bannerUrl,
          faviconUrl: d.faviconUrl,
          backgroundUrl: d.backgroundUrl,
          blocks: d.blocks,
        },
      });
      setDraftApplied(true);
    } catch {
      // Malformed draft → keep the saved page.
    }
  }, [storageKey, event]);

  return (
    <>
      {draftApplied && (
        <div className="bg-warning-bg px-4 py-1.5 text-center text-caption font-medium text-warning-text">
          Pré-visualizando alterações não salvas
        </div>
      )}
      <EventPageView event={view} mpPublicKey={mpPublicKey} preview />
    </>
  );
}
