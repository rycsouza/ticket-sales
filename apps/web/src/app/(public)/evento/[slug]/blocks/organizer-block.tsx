import { AtSign, Globe, MessageCircle } from "lucide-react";
import type { PublicEventView } from "@/lib/public-views";

type OrganizerConfig = {
  showLogo: boolean;
  contactText?: string | undefined;
  instagram?: string | undefined;
  whatsapp?: string | undefined;
  website?: string | undefined;
};

/** Identidade pública do produtor (FR-ORG-009) — nome, logo, contato e redes. */
export function OrganizerBlock({
  event,
  config,
}: {
  event: PublicEventView;
  config: OrganizerConfig;
}) {
  const organizer = event.organizer;
  const hasSocial = Boolean(config.instagram || config.whatsapp || config.website);
  if (!organizer?.publicName && !config.contactText && !hasSocial) return null;

  const logoUrl = config.showLogo ? organizer?.logoUrl : null;

  // Handles/números já validados por formato no schema; URLs montadas aqui
  const socials = [
    config.instagram && {
      label: `@${config.instagram}`,
      href: `https://instagram.com/${config.instagram}`,
      icon: <AtSign className="size-4" />,
    },
    config.whatsapp && {
      label: "WhatsApp",
      href: `https://wa.me/55${config.whatsapp}`,
      icon: <MessageCircle className="size-4" />,
    },
    config.website && {
      label: "Site",
      href: config.website,
      icon: <Globe className="size-4" />,
    },
  ].filter(Boolean) as { label: string; href: string; icon: React.ReactNode }[];

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-small font-semibold uppercase tracking-wide text-ink-muted">
        Realização
      </h2>
      <div className="rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-12 shrink-0 rounded-lg object-contain" />
          )}
          <div className="min-w-0">
            {organizer?.publicName && (
              <p className="truncate text-body font-medium text-ink">{organizer.publicName}</p>
            )}
            {config.contactText && (
              <p className="whitespace-pre-line text-small text-ink-muted">{config.contactText}</p>
            )}
          </div>
        </div>
        {socials.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {socials.map((social) => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-subtle px-3 py-1.5 text-small font-medium text-ink-soft transition-colors hover:bg-hover"
              >
                {social.icon}
                {social.label}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
