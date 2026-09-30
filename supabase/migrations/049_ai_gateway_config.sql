-- ============================================================================
-- 049 — AI Gateway: provider configuration (Phase 21)
-- ============================================================================
-- Additive. Creates two platform-configuration tables and seeds DeepSeek as a
-- DISABLED provider.
--
-- WHY CONFIGURATION IS DATA, NOT CODE
-- ----------------------------------
-- Which provider serves which capability, in what order, is a Super Admin
-- decision that changes without a deployment. Hardcoding "DeepSeek" into a
-- function would mean every provider change is a code change, a review and a
-- release. Here, adding a provider is a row.
--
-- `kind` is the adapter seam. DeepSeek, OpenAI, Groq, Together and Ollama all
-- speak the same /chat/completions dialect, so ONE adapter (openai_compatible)
-- covers all of them, and "support another provider later" means inserting a row
-- with the right base_url — not writing another adapter.
--
-- THE API KEY IS NOT IN THIS TABLE
-- --------------------------------
-- `api_key_env` holds the NAME of the environment variable that holds the key
-- (for example DEEPSEEK_API_KEY). The key itself lives in the environment, where
-- it is not readable by any tenant-scoped connection, cannot leak through a
-- `select *`, and is not copied into a database backup. A key column here would
-- be readable by every service-role query and every dump.
--
-- DISABLED BY DEFAULT, DELIBERATELY
-- ---------------------------------
-- Every row seeds with is_enabled = false. The CBT system must work completely
-- with AI off (a stated requirement), so the default state of the platform is
-- exactly that. Nothing turns AI on by accident.
--
-- ACCESS: platform configuration, not tenant data. RLS is enabled with NO
-- policies, so a tenant-scoped token reads zero rows — the same treatment as
-- `components_rows` and `super_admins`. Super Admin screens reach it through the
-- service client. These tables carry no `school_id`, so they are outside the
-- tenant-policy ratchet in the isolation harness by design.
-- ============================================================================


create table if not exists public.ai_providers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,          -- stable key: 'deepseek'
  label       text not null,                 -- shown to a Super Admin
  -- The adapter seam. One adapter covers every OpenAI-compatible provider.
  kind        text not null default 'openai_compatible'
              check (kind in ('openai_compatible')),
  base_url    text not null,
  -- NAME of the environment variable holding the key. Never the key itself.
  api_key_env text not null,
  is_enabled  boolean not null default false,
  -- Lower runs first. Ties are broken by name so ordering is never arbitrary.
  priority    integer not null default 100,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.ai_provider_models (
  id                uuid primary key default gen_random_uuid(),
  provider_id       uuid not null references public.ai_providers(id) on delete cascade,
  capability        text not null
                    check (capability in ('text','vision','speech_to_text','text_to_speech')),
  model             text not null,
  is_enabled        boolean not null default false,
  priority          integer not null default 100,
  max_output_tokens integer,
  created_at        timestamptz not null default now(),
  unique (provider_id, capability, model)
);

create index if not exists idx_ai_provider_models_capability
  on public.ai_provider_models (capability, is_enabled, priority);

alter table public.ai_providers        enable row level security;
alter table public.ai_provider_models enable row level security;

-- No policies on purpose: platform configuration, service-role only. See the
-- header. A tenant token gets zero rows rather than an error, which is the
-- fail-closed behaviour we want.


-- ----------------------------------------------------------------------------
-- Seed: DeepSeek, disabled, text only
-- ----------------------------------------------------------------------------
-- Only the TEXT model is seeded. Vision and speech-to-text models are added as
-- configuration once those choices are made — seeding a guessed model name would
-- put an invented value in the database that looks authoritative and is not.
-- ----------------------------------------------------------------------------
insert into public.ai_providers (name, label, kind, base_url, api_key_env, is_enabled, priority, notes)
values (
  'deepseek', 'DeepSeek', 'openai_compatible', 'https://api.deepseek.com',
  'DEEPSEEK_API_KEY', false, 10,
  'Initial provider. Disabled by default: CBT must work fully with AI off.'
)
on conflict (name) do nothing;

insert into public.ai_provider_models (provider_id, capability, model, is_enabled, priority, max_output_tokens)
select p.id, 'text', 'deepseek-chat', false, 10, 4096
  from public.ai_providers p
 where p.name = 'deepseek'
on conflict (provider_id, capability, model) do nothing;
