"use client";

import { useState } from "react";
import type { SiteSection } from "@/lib/site/types";

type GallerySection = Extract<SiteSection, { kind: "gallery" }>;

const CATEGORIES_ALL = "All";

export function Gallery({ section }: { section: GallerySection }) {
  if (!section.items || section.items.length === 0) return null;

  // Build unique category list
  const categories = [
    CATEGORIES_ALL,
    ...Array.from(
      new Set(
        section.items
          .map((i) => i.category)
          .filter((c): c is string => !!c && c.length > 0),
      ),
    ),
  ];

  const [active, setActive] = useState(CATEGORIES_ALL);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const filtered =
    active === CATEGORIES_ALL
      ? section.items
      : section.items.filter((i) => i.category === active);

  return (
    <section id="gallery" className="scroll-mt-16 py-14 sm:py-20 bg-gray-50/60">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            Campus Life
          </span>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--site-primary-dark)] sm:text-3xl">
            {section.heading}
          </h2>
          {section.subheading ? (
            <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">
              {section.subheading}
            </p>
          ) : null}
        </div>

        {/* Category Filter — only show if there are real categories */}
        {categories.length > 1 ? (
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActive(cat)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${
                  active === cat
                    ? "bg-[var(--site-primary)] text-[var(--site-on-primary)] shadow-sm"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        ) : null}

        {/* Photo Grid: 2 col mobile → 3 col tablet → 4 col desktop */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">
          {filtered.map((item, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setLightbox(index)}
              className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gray-200 aspect-[4/3] shadow-sm hover:shadow-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--site-primary)] focus:ring-offset-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageUrl}
                alt={item.caption || `Campus photo ${index + 1}`}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {item.caption ? (
                <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 via-black/20 to-transparent p-2.5 sm:p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <p className="text-[11px] sm:text-xs font-semibold text-white line-clamp-2 text-left">
                    {item.caption}
                  </p>
                </div>
              ) : null}
              {/* Expand icon */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-gray-700 text-xs shadow">
                  ⛶
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white text-2xl font-bold hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
          {/* Prev */}
          {filtered.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((prev) => (prev === null ? 0 : (prev - 1 + filtered.length) % filtered.length));
              }}
              className="absolute left-3 sm:left-6 text-white text-3xl font-bold hover:text-gray-300 transition-colors"
              aria-label="Previous"
            >
              ‹
            </button>
          ) : null}
          {/* Image */}
          <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={filtered[lightbox].imageUrl}
              alt={filtered[lightbox].caption || ""}
              className="w-full max-h-[80vh] object-contain rounded-xl"
            />
            {filtered[lightbox].caption ? (
              <p className="mt-3 text-center text-sm text-white/80">{filtered[lightbox].caption}</p>
            ) : null}
          </div>
          {/* Next */}
          {filtered.length > 1 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightbox((prev) => (prev === null ? 0 : (prev + 1) % filtered.length));
              }}
              className="absolute right-3 sm:right-6 text-white text-3xl font-bold hover:text-gray-300 transition-colors"
              aria-label="Next"
            >
              ›
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
