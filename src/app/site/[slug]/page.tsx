import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteRenderer } from "@/components/site/SiteRenderer";
import { resolveSite } from "@/lib/site/load-published";

/**
 * The public website renderer.
 *
 * PATH MODE. The school's own host does not exist yet (host resolution is a
 * later slice), so a site is reachable at /site/<slug>. That path is
 * deliberately `noindex`: it is an internal address, and the canonical address
 * will be the school's domain once it has one.
 *
 * This route is a shell around `resolveSite` and `SiteRenderer`: it decides
 * *whether* there is a site (404 for every failure cause — unknown slug,
 * archived school, flag off, unconfigured, suspended, invalid document,
 * database error) and the template decides *what it looks like*. It renders no
 * content of its own, so there is exactly one place where a school's page is
 * assembled and exactly one place where its data is read.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

/** Deduped within a request, so metadata and the page share one lookup. */
const loadSite = cache(async (slug: string) => resolveSite(slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadSite(slug);

  if (!result.ok) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  return {
    title: result.site.seo.title ?? result.site.school.name,
    description: result.site.seo.description ?? result.site.school.motto ?? undefined,
    // Path access is never a search result. Indexing becomes a deliberate
    // per-host decision in the host-resolution slice.
    robots: { index: false, follow: false },
  };
}

export default async function PublicSitePage({ params }: Props) {
  const { slug } = await params;
  const result = await loadSite(slug);
  if (!result.ok) notFound();

  return <SiteRenderer site={result.site} />;
}
