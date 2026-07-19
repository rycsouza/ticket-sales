type GalleryConfig = {
  heading?: string | undefined;
  images: string[];
};

/** Grade simples 2 colunas — URLs já validadas como do nosso CDN. */
export function GalleryBlock({ config }: { config: GalleryConfig }) {
  if (config.images.length === 0) return null;

  return (
    <section className="mb-6">
      {config.heading && (
        <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
          {config.heading}
        </h2>
      )}
      <div className="grid grid-cols-2 gap-2">
        {config.images.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            loading="lazy"
            className={`aspect-square w-full rounded-xl border border-line object-cover ${
              config.images.length % 2 === 1 && i === 0 ? "col-span-2 aspect-video" : ""
            }`}
          />
        ))}
      </div>
    </section>
  );
}
