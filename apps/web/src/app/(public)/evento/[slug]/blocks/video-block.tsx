type VideoConfig = {
  heading?: string | undefined;
  /** ID de 11 chars validado no schema — nunca URL livre. */
  youtubeId: string;
};

/**
 * Embed via youtube-nocookie.com (modo privacidade: sem cookies até o play).
 * O iframe só carrega nosso ID validado — nada de HTML/URL arbitrários.
 */
export function VideoBlock({ config }: { config: VideoConfig }) {
  return (
    <section className="mb-6">
      {config.heading && (
        <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
          {config.heading}
        </h2>
      )}
      <div className="overflow-hidden rounded-xl border border-line">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${config.youtubeId}`}
          title="Vídeo do evento"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="aspect-video w-full"
        />
      </div>
    </section>
  );
}
