import type { SiteSection } from "@/lib/site/types";

type BlogSection = Extract<SiteSection, { kind: "blog" }>;

export function Blog({ section }: { section: BlogSection }) {
  if (!section.posts || section.posts.length === 0) return null;

  return (
    <section id="blog" className="scroll-mt-16 py-14 sm:py-20 bg-white border-t border-gray-100">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--site-accent)]">
            School News
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

        {/* Posts grid: 1 col → 2 col (tablet) → 3 col (desktop) */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {section.posts.map((post, index) => (
            <article
              key={index}
              className="group flex flex-col overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              {/* Cover Image */}
              {post.imageUrl ? (
                <div className="h-44 w-full overflow-hidden bg-gray-100 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="h-2 bg-gradient-to-r from-[var(--site-primary)] to-[var(--site-accent)] shrink-0" />
              )}

              {/* Content */}
              <div className="flex flex-col flex-1 p-5">
                {/* Meta */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {post.category ? (
                    <span className="rounded-full bg-[var(--site-tint)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--site-primary-dark)]">
                      {post.category}
                    </span>
                  ) : null}
                  {post.date ? (
                    <span className="text-[11px] text-gray-400 font-medium">{post.date}</span>
                  ) : null}
                </div>

                <h3 className="text-sm font-bold text-gray-900 leading-snug group-hover:text-[var(--site-primary)] transition-colors">
                  {post.title}
                </h3>

                {post.excerpt ? (
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-gray-600 flex-1 line-clamp-3">
                    {post.excerpt}
                  </p>
                ) : null}

                {post.author ? (
                  <div className="mt-4 pt-3 border-t border-gray-100 text-[11px] text-gray-500 font-medium">
                    By {post.author}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
