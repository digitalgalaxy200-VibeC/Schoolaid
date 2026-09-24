-- ============================================================================
-- 053 — Groq as the speech-to-text provider (Phase 21)
-- ============================================================================
-- Additive. Adds Groq, which is the answer to "what gives us voice notes": its
-- transcription endpoint is OpenAI-compatible, so it fits the existing adapter
-- with NO new code.
--
-- WHY GROQ FOR VOICE
-- ------------------
-- Verified from Groq's own docs (2026-09-24), not assumed:
--
--   endpoint   POST https://api.groq.com/openai/v1/audio/transcriptions
--   models     whisper-large-v3-turbo   $0.04/hour, WER ~12%
--              whisper-large-v3         $0.111/hour, WER ~10.3%
--   max file   25 MB
--
-- The base URL is the API ROOT, which is what `ai_providers.base_url` holds and
-- what the adapter appends `audio/transcriptions` to — the same shape DeepSeek
-- already uses. And Groq's 25 MB ceiling is exactly the cap already set in
-- `UPLOAD_POLICY.audio.maxBytes`, so the validator and the provider agree.
--
-- GEMINI CANNOT SERVE THIS CAPABILITY
-- -----------------------------------
-- Gemini does transcribe audio, but by putting an `input_audio` part INSIDE a chat
-- completion — not through `/audio/transcriptions`. It therefore does not fit the
-- `speech_to_text` capability as built. Recorded here because it is the obvious
-- next question.
--
-- BOTH WHISPER MODELS, AND WHY
-- ---------------------------
-- Turbo is the default: for dictating a note it is accurate enough and costs about
-- a third as much. The full model is enabled at a LOWER priority, so it is the
-- automatic fallback when turbo fails — which is also the cheapest possible
-- demonstration that per-capability fallback works.
--
-- THE TEXT FALLBACK
-- -----------------
-- `openai/gpt-oss-120b` is added for `text` at provider priority 20, behind
-- DeepSeek's 10. It is therefore only ever used when DeepSeek FAILS, which is what
-- "automatic fallback between configured providers" means. A Super Admin can turn
-- it off on the AI settings screen.
--
-- NOT SEEDED, DELIBERATELY
-- ------------------------
--   * A Groq VISION model — Groq publishes none in its production list, so vision
--     stays with DeepSeek (`deepseek-flash`) or Gemini.
--   * Text-to-speech — Groq's only option is a PREVIEW model ("intended for
--     evaluation only... may be discontinued at short notice"), and preview models
--     do not belong in a production path.
--   * Any second vision provider — adding one is a row, and the Super Admin screen
--     can now do it without a migration. Seeding a guess would put an invented
--     model name in the database looking authoritative.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The provider — priority 20, so DeepSeek (10) still wins wherever both serve
-- ----------------------------------------------------------------------------
insert into public.ai_providers
  (name, label, kind, base_url, api_key_env, is_enabled, priority, notes)
values
  ('groq', 'Groq', 'openai_compatible', 'https://api.groq.com/openai/v1',
   'GROQ_API_KEY', true, 20,
   'Speech-to-text provider. Whisper transcription is OpenAI-compatible, so no '
   'extra adapter is needed. Requires GROQ_API_KEY; a call made without it fails '
   'naming that variable rather than reporting a generic provider error.')
on conflict (name) do nothing;


-- ----------------------------------------------------------------------------
-- 2. Speech to text — turbo first, full model as the fallback
-- ----------------------------------------------------------------------------
insert into public.ai_provider_models
  (provider_id, capability, model, is_enabled, priority, max_output_tokens)
select p.id, v.capability, v.model, true, v.priority, v.max_output_tokens
  from public.ai_providers p
  cross join (values
    -- The cast is required: an untyped NULL in a VALUES list is inferred as text,
    -- and the target column is an integer.
    ('speech_to_text', 'whisper-large-v3-turbo', 10, null::integer),
    ('speech_to_text', 'whisper-large-v3',       20, null::integer)
  ) as v(capability, model, priority, max_output_tokens)
 where p.name = 'groq'
on conflict (provider_id, capability, model) do nothing;


-- ----------------------------------------------------------------------------
-- 3. Text fallback — reached only when DeepSeek fails
-- ----------------------------------------------------------------------------
-- `max_output_tokens` here is a COST cap, not the model's limit.
insert into public.ai_provider_models
  (provider_id, capability, model, is_enabled, priority, max_output_tokens)
select p.id, 'text', 'openai/gpt-oss-120b', true, 50, 4096
  from public.ai_providers p
 where p.name = 'groq'
on conflict (provider_id, capability, model) do nothing;
