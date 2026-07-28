"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Cover carousel for the hero. Dependency-free: a scroll-snap track drives
 * native swipe on touch; arrows and dots scroll it programmatically. Auto-
 * advances gently and pauses while the buyer is interacting/hovering.
 */
export function HeroCarousel({ images, overlayClass }: { images: string[]; overlayClass: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const paused = useRef(false);

  function scrollTo(i: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = (i + images.length) % images.length;
    track.scrollTo({ left: clamped * track.clientWidth, behavior: "smooth" });
  }

  // Keep the active dot in sync as the track scrolls (swipe or programmatic).
  function onScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setIndex(Math.round(track.scrollLeft / track.clientWidth));
  }

  // Gentle auto-advance; pauses on hover/touch so it never fights the buyer.
  useEffect(() => {
    const id = setInterval(() => {
      if (paused.current) return;
      const track = trackRef.current;
      if (!track) return;
      const next = (Math.round(track.scrollLeft / track.clientWidth) + 1) % images.length;
      track.scrollTo({ left: next * track.clientWidth, behavior: "smooth" });
    }, 3000);
    return () => clearInterval(id);
  }, [images.length]);

  return (
    <div
      className="relative"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onTouchStart={() => (paused.current = true)}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            className="aspect-[16/9] w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>

      {overlayClass && <div className={`pointer-events-none absolute inset-0 ${overlayClass}`} aria-hidden />}

      <button
        type="button"
        aria-label="Imagem anterior"
        onClick={() => scrollTo(index - 1)}
        className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
      >
        <ChevronLeft className="size-5" />
      </button>
      <button
        type="button"
        aria-label="Próxima imagem"
        onClick={() => scrollTo(index + 1)}
        className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
      >
        <ChevronRight className="size-5" />
      </button>

      <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ir para a imagem ${i + 1}`}
            aria-current={i === index}
            onClick={() => scrollTo(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? "w-5 bg-white" : "w-1.5 bg-white/60"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
