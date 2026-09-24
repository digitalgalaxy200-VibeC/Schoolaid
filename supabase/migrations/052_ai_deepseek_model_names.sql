-- ============================================================================
-- 052 — DeepSeek model names for the AI gateway (Phase 21)
-- ============================================================================
-- Corrects the model name seeded in 049, adds the vision row, and enables the
-- provider.
--
-- WHY THE NAME CHANGED
-- --------------------
-- 049 seeded `deepseek-chat`, copied from the existing copilot provider
-- (`src/lib/copilot/providers/deepseek-provider.ts`) because that was the only
-- known-good value in the codebase. It was not a guess, but it was not verified
-- either.
--
-- DeepSeek's current model table lists `deepseek-flash` and `deepseek-v4-pro`.
-- `deepseek-chat` is not among them, and the legacy aliases their docs still
-- accept are different (`deepseek-v4-flash`, `deepseek-v4-flash-vision-exp`).
-- The product owner confirms `deepseek-flash` is the model in use.
--
-- ONE MODEL SERVES TWO CAPABILITIES
-- ---------------------------------
-- Vision is a property of `deepseek-flash`, not a separate model, so the same
-- name appears once for `text` and once for `vision`. The unique constraint is
-- (provider_id, capability, model), so that is two legitimate rows, and it means
-- switching provider for vision is a priority change rather than a code change.
--
-- ENABLING
-- --------
-- 049 seeded disabled, so the default state of the platform was AI-off — which
-- is a stated requirement (CBT works fully with AI off). This migration enables
-- it, at the product owner's instruction, now that the gateway is complete.
--
-- Flipping this per environment is a RUNTIME action and does not belong in a
-- migration. Once the Super Admin AI configuration screen exists, enable/disable
-- is a click. Editing this file later would break migration history; disable it
-- in that screen instead.
--
-- ENABLING WITHOUT A KEY FAILS, LOUDLY
-- ------------------------------------
-- There is no DEEPSEEK_API_KEY in the environment yet. With the provider enabled
-- and the key absent, an AI call fails with a message naming the missing
-- variable, and the usage record says so. That is intended: fail closed, and say
-- which variable is missing rather than reporting a generic provider error.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Correct the text model, and enable it
-- ----------------------------------------------------------------------------
update public.ai_provider_models m
   set model            = 'deepseek-flash',
       is_enabled       = true,
       -- Not the model's limit (the docs give 384K) but a COST cap: this column
       -- exists so an operator can bound an expensive call without a deployment.
       max_output_tokens = 4096
  from public.ai_providers p
 where m.provider_id = p.id
   and p.name = 'deepseek'
   and m.capability = 'text';


-- ----------------------------------------------------------------------------
-- 2. Add the vision row — the same model, a second capability
-- ----------------------------------------------------------------------------
insert into public.ai_provider_models
  (provider_id, capability, model, is_enabled, priority, max_output_tokens)
select p.id, 'vision', 'deepseek-flash', true, 10, 4096
  from public.ai_providers p
 where p.name = 'deepseek'
-- Idempotent: re-running changes nothing.
on conflict (provider_id, capability, model) do nothing;


-- ----------------------------------------------------------------------------
-- 3. Enable the provider
-- ----------------------------------------------------------------------------
-- Last, so it cannot become visible-and-enabled before its model rows are right.
update public.ai_providers
   set is_enabled = true,
       notes = 'Initial provider. Enabled for staging 2026-09-24; model names '
               'corrected from deepseek-chat to deepseek-flash in migration 052.',
       updated_at = now()
 where name = 'deepseek';
