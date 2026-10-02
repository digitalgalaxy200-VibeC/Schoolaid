import type { SiteSection } from "@/lib/site/types";

type GallerySection = Extract<SiteSection, { kind: "gallery" }>;

export function Gallery({ section }: { section: GallerySection }) {
  return (
    <section id="gallery" className="scroll-mt-16 py-16 sm:py-20 bg-gray-50/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Campus Life
          </span>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.subheading ? (
            <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">
              {section.subheading}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {section.items.map((item, index) => (
            <div
              key={index}
              className="group relative overflow-hidden rounded-2xl bg-gray-200 aspect-[4/3] shadow-sm hover:shadow-xl transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.caption || `Campus photo ${index + 1}`}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {item.caption ? (
                <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <p className="text-xs font-semibold text-white line-clamp-2">
                    {item.caption}
                  </p>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
