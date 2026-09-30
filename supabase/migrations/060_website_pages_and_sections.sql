-- ============================================================================
-- 060 — Website Engine, Phase 7: website_pages, website_sections, draft_version
-- ============================================================================
-- Forward-only and purely additive. See supabase/migrations/README.md.
--
-- Adds TWO tables and ONE function, and appends ONE column to `website_configs`.
-- No existing table, row, policy or index is touched; no row is created here.
--
-- WHY THESE TABLES EXIST
-- ----------------------
-- Until this migration the public renderer's document came from a code fixture.
-- Pages and sections move that content into the database, where a school can
-- author it — while the section VOCABULARY stays platform code
-- (`src/lib/site/templates/contracts.ts`). The database stores structure:
-- ownership, ordering, visibility. The application stores meaning: every write
-- passes the contracts, and the public resolver re-validates what it reads.
--
-- `path` is unique per school because it will become the page's public address;
-- `key` is the stable handle code refers to a page by (a path may be renamed).
--
-- `kind` is a column rather than a key inside `content`, deliberately: it is the
-- discriminator the resolver filters on and must not be shadowable by JSON.
-- `content` holds the kind-specific fields only.
--
-- There is deliberately NO check constraint on `kind`, unlike `website_configs.
-- status`: the kind vocabulary grows with every template slice (gallery, news,
-- events, staff …), and a constraint would make each addition a migration for a
-- rule that is already enforced — twice — in code (`templates/contracts.ts` on
-- write, the resolver on read).
--
-- Composite foreign key (page_id, school_id) → website_pages (id, school_id) is
-- the platform's existing convention (migration 047) for making a cross-row
-- reference tenant-consistent at the database level rather than trusting the
-- application to have checked it.
--
-- `draft_version` is the optimistic-concurrency token for CONTENT writes: the
-- CMS reads it, sends it back, and `replace_website_page_sections` refuses a
-- write whose token is stale. Theme/contact/SEO saves do not participate — they
-- replace their own fields and cannot collide with a content edit.
--
-- RLS follows the existing platform convention:
--   (school_id = (auth.jwt() ->> 'school_id')::uuid) OR is_super_admin()
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. website_pages — one row per public page a school has
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,

  -- Stable handle code refers to a page by (`home` in V1).
  key         TEXT NOT NULL,
  -- The page's address. V1 serves only `/`; custom routing arrives later.
  path        TEXT NOT NULL,

  title       TEXT,
  -- Page metadata; V1 keeps the site's SEO on `website_configs`.
  seo         JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (school_id, path),
  UNIQUE (school_id, key),
  -- Required by the composite foreign key from website_sections.
  UNIQUE (id, school_id)
);

ALTER TABLE public.website_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_website_pages ON public.website_pages;
CREATE POLICY tenant_select_website_pages ON public.website_pages
  FOR SELECT USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_website_pages ON public.website_pages;
CREATE POLICY tenant_insert_website_pages ON public.website_pages
  FOR INSERT WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_update_website_pages ON public.website_pages;
CREATE POLICY tenant_update_website_pages ON public.website_pages
  FOR UPDATE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin())
  WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_delete_website_pages ON public.website_pages;
CREATE POLICY tenant_delete_website_pages ON public.website_pages
  FOR DELETE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

CREATE INDEX IF NOT EXISTS idx_website_pages_school_order
  ON public.website_pages (school_id, sort_order);

DROP TRIGGER IF EXISTS update_website_pages_updated_at ON public.website_pages;
CREATE TRIGGER update_website_pages_updated_at
  BEFORE UPDATE ON public.website_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 2. website_sections — the ordered, hideable blocks of a page
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.website_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  page_id     UUID NOT NULL,

  -- One of the kinds in `src/lib/site/templates/contracts.ts` (see header).
  kind        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  -- Hidden sections are kept, never rendered, and may be unfinished: a school
  -- hides a block until it has written it.
  is_visible  BOOLEAN NOT NULL DEFAULT TRUE,
  -- The kind-specific fields only, exactly as the contracts normalise them.
  content     JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Tenant consistency, and a page's sections die with the page.
  FOREIGN KEY (page_id, school_id)
    REFERENCES public.website_pages (id, school_id) ON DELETE CASCADE
);

ALTER TABLE public.website_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_select_website_sections ON public.website_sections;
CREATE POLICY tenant_select_website_sections ON public.website_sections
  FOR SELECT USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_insert_website_sections ON public.website_sections;
CREATE POLICY tenant_insert_website_sections ON public.website_sections
  FOR INSERT WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_update_website_sections ON public.website_sections;
CREATE POLICY tenant_update_website_sections ON public.website_sections
  FOR UPDATE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin())
  WITH CHECK ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

DROP POLICY IF EXISTS tenant_delete_website_sections ON public.website_sections;
CREATE POLICY tenant_delete_website_sections ON public.website_sections
  FOR DELETE USING ((school_id = ((auth.jwt() ->> 'school_id'::text))::uuid) OR is_super_admin());

CREATE INDEX IF NOT EXISTS idx_website_sections_page_order
  ON public.website_sections (page_id, sort_order);

DROP TRIGGER IF EXISTS update_website_sections_updated_at ON public.website_sections;
CREATE TRIGGER update_website_sections_updated_at
  BEFORE UPDATE ON public.website_sections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ----------------------------------------------------------------------------
-- 3. website_configs.draft_version — the content concurrency token
-- ----------------------------------------------------------------------------
ALTER TABLE public.website_configs
  ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.website_configs.draft_version IS
  'Counts content saves (pages/sections) only. Bumped by replace_website_page_sections(); the CMS sends the value it read and a stale one is refused. Theme/contact/SEO saves do not touch it.';


-- ----------------------------------------------------------------------------
-- 4. replace_website_page_sections — one atomic content save
-- ----------------------------------------------------------------------------
-- WHY THIS IS A DATABASE FUNCTION
-- -------------------------------
-- A content save is three dependant writes: claim the expected draft version,
-- remove the page's old sections, insert the new list. Through the REST client
-- those are separate statements with no transaction around them, so a failure
-- between them would leave a live page with half its sections — and the public
-- resolver, which refuses a page it cannot validate, would take the school's
-- website down until somebody noticed. One function is one transaction.
--
-- The version claim is a compare-and-swap: two admins who loaded the same
-- version cannot both save, and the loser gets `version_conflict` rather than
-- silently overwriting the winner.
--
-- Caller rules are the application's (the route): the feature flag, the section
-- contracts and the "at least one visible section" rule are all enforced there
-- before this is called. This function holds structure, not product rules.
--
-- SECURITY INVOKER, and EXECUTE revoked from everything but service_role: the
-- only caller is the server's service client, so a tenant token that finds the
-- RPC endpoint gets a permission error rather than a write.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_website_page_sections(
  p_school_id        uuid,
  p_page_id          uuid,          -- NULL = the school's home page (created if absent)
  p_expected_version integer,
  p_sections         jsonb          -- [{"kind": "...", "is_visible": bool, "content": {...}}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_page_id uuid;
  v_version integer;
BEGIN
  IF p_school_id IS NULL OR p_expected_version IS NULL OR p_sections IS NULL THEN
    RAISE EXCEPTION 'replace_website_page_sections: missing arguments';
  END IF;
  IF jsonb_typeof(p_sections) <> 'array' OR jsonb_array_length(p_sections) = 0 THEN
    RAISE EXCEPTION 'replace_website_page_sections: at least one section is required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_sections) elem
    WHERE coalesce(elem ->> 'kind', '') = ''
  ) THEN
    RAISE EXCEPTION 'replace_website_page_sections: every section needs a kind';
  END IF;

  -- 1. Resolve (or create) the page the ids refer to. A supplied id that is not
  --    this school's is `page_not_found`, and nothing else happens.
  IF p_page_id IS NULL THEN
    INSERT INTO public.website_pages (school_id, key, path, sort_order)
    VALUES (p_school_id, 'home', '/', 0)
    ON CONFLICT (school_id, path) DO NOTHING;

    SELECT id INTO v_page_id
      FROM public.website_pages
     WHERE school_id = p_school_id AND path = '/';
  ELSE
    SELECT id INTO v_page_id
      FROM public.website_pages
     WHERE id = p_page_id AND school_id = p_school_id;
  END IF;

  IF v_page_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'page_not_found');
  END IF;

  -- 2. Claim the draft version. The configuration row is created here on first
  --    content save, exactly as it is on first settings save — a school that
  --    authors content has a website configuration by definition.
  INSERT INTO public.website_configs (school_id) VALUES (p_school_id)
  ON CONFLICT (school_id) DO NOTHING;

  UPDATE public.website_configs
     SET draft_version = draft_version + 1
   WHERE school_id = p_school_id
     AND draft_version = p_expected_version
  RETURNING draft_version INTO v_version;

  IF v_version IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'version_conflict');
  END IF;

  -- 3. Replace the page's sections wholesale. The caller normalised every
  --    section against its contract; this stores exactly what it sent.
  DELETE FROM public.website_sections WHERE page_id = v_page_id;

  INSERT INTO public.website_sections (school_id, page_id, kind, sort_order, is_visible, content)
  SELECT p_school_id,
         v_page_id,
         elem ->> 'kind',
         (ord - 1)::integer,
         coalesce((elem ->> 'is_visible')::boolean, true),
         coalesce(elem -> 'content', '{}'::jsonb)
    FROM jsonb_array_elements(p_sections) WITH ORDINALITY AS t(elem, ord);

  RETURN jsonb_build_object('ok', true, 'page_id', v_page_id, 'draft_version', v_version);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_website_page_sections(uuid, uuid, integer, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_website_page_sections(uuid, uuid, integer, jsonb)
  TO service_role;
