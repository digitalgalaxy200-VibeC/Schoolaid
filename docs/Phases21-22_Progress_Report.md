# Phases 21–22 — Progress Report

**Scope of this increment:** the AI gateway and the AI credit ledger — the
database layer (migrations 049–051) and the TypeScript layer that will call them.

**Status:** the layer is complete and verified against staging. **No AI feature
uses it yet**, and no route or screen was added. See §4.

Verified: **79 new unit tests** (5 files) + **6 live tests against staging**,
**347 passed / 37 skipped** across the whole suite, `tsc --noEmit` clean, every
file in `src/lib/ai` lint-clean. Staging left exactly as found.

---

## 1. What each phase delivered

### Phase 21 — AI Gateway

| File | Responsibility |
| --- | --- |
| `src/lib/ai/types.ts` | The contract: capabilities, route rows, request/result shapes, three error classes |
| `src/lib/ai/adapters/openai-compatible.ts` | The **only** HTTP in the gateway: `/chat/completions`, `/audio/transcriptions`, `/audio/speech` |
| `src/lib/ai/registry.ts` | Reads provider configuration and joins it into an ordered route list (pure `buildRoutes`) |
| `src/lib/ai/router.ts` | Tries routes in order, falls back, classifies failures (pure) |
| `src/lib/ai/gateway.ts` | `runAiCall` — the one entry point: config → credits → provider → usage record |

**One adapter, not one per provider.** DeepSeek, OpenAI, Groq, Together and
Ollama all speak the same three endpoints. A provider is a **row**
(`base_url` + `api_key_env`), so supporting a new one is an insert, not a class.
`kind` is the seam if a genuinely different protocol ever appears.

**Configuration is read on every call, deliberately uncached.** Disabling a
provider is the kill switch for a provider that is misbehaving or burning money;
a cache would make that take effect at some unspecified later time. The tables
hold a handful of rows.

### Phase 22 — AI Credits

`src/lib/ai/credits.ts` — thin wrappers over the four database functions
(`grant_ai_credits`, `charge_ai_credits`, `ai_credit_balance`,
`sweep_expired_ai_credits`) plus `getAiCreditPosition` for the balance view.

**Nothing re-implements the balance.** The arithmetic stays in Postgres because
spending is a read-then-write: done in TypeScript, two AI calls arriving together
would both read the same balance and both succeed, so the school gets two answers
and pays for one.

---

## 2. Two decisions worth your attention

### 2.1 Pricing is a placeholder in exactly one place — **still owed (O7)**

`PLACEHOLDER_PRICING = { perCall: 1 }` in `src/lib/ai/credits.ts`. One credit per
call, until you decide the real schedule. This is deliberate: inventing a
plausible-looking per-token schedule and burying it in the gateway would put a
made-up number in the path of real money. When you decide, that constant is what
changes and nothing else — every charge already goes through `creditsForUsage`.

### 2.2 A call that succeeds but cannot be charged is **given away, loudly**

The flow checks the balance, calls the provider, then charges. If a concurrent
call takes the credit in between, the answer is already produced and is returned
anyway; the usage row records `credits_charged: 0` and an error saying so.

The alternative — reserve first, refund on failure — needs a reservation concept
and a refund path that can itself fail. Giving away one call is **bounded and
visible**; a reservation that fails to release is a school locked out of a
feature it paid for. Verified by test, not by comment.

---

## 3. What is verified, and how

### Against the real database (6/6, `CBT_LIVE=1`)

These four claims were only *comments* until this run. Each has a **positive
control**, because "a tenant reads zero rows" is also true of an empty table:

| Check | Positive control |
| --- | --- |
| The registry's column names match the real schema | The seeded DeepSeek row is read and asserted disabled |
| `ai_providers` / `ai_provider_models` are deny-all to a tenant token | The service client reads rows from both in the same test |
| A tenant token **cannot execute** the credit functions | The service role calls `ai_credit_balance` successfully first |
| `runAiCall` refuses end to end while AI is off, and **records** it | The usage row is read back: `refused_disabled`, `credits_charged = 0`, no provider named |

The third is the important one: on a `SECURITY DEFINER` function, EXECUTE
privilege is the **only** remaining guard. If that revoke were wrong, any signed-in
user could spend any school's credits.

### Staging after the run — unchanged

```
ai_providers       1      ai_credit_lots     0
ai_provider_models 1      ai_credit_ledger   0
ai_usage_events    0      leftover test rows 0
```

---

## 4. What was deliberately NOT built

**No HTTP route, and no public AI endpoint.** Output validation and
injection-resistant prompt assembly are Phase 23, and an endpoint built before
them would be the insecure version of the thing, published. `runAiCall` is a
server-side library: a caller still has to authenticate, authorize and derive the
tenant itself.

**Nothing was rewired to use the gateway.** Two existing places call DeepSeek
directly:

| Location | What it does |
| --- | --- |
| `src/lib/copilot/providers/deepseek-provider.ts` | Super Admin copilot's own provider abstraction, hardcoded to DeepSeek |
| `src/app/api/teacher/ai-import/route.ts` (L57) | Score-import from photos, calls the DeepSeek vision API with `process.env.DEEPSEEK_API_KEY` |

Both are **working V1 features**. Moving them onto the gateway is the right
destination — it would give them the usage ledger, the credit ledger and the
fallback — but it is **not a refactor, it is a behaviour change**, and I did not
make it unasked:

1. their AI usage would begin to be **charged against school credits**;
2. they would **stop working whenever AI is disabled**, which is the default
   state of the platform today;
3. `ai-import` would become **vision-capability-dependent**, and no vision model
   is seeded (deliberately — see below).

**This needs your decision.** It is recorded as **I9** in the register.

**No guessed model names were seeded.** Only `deepseek-chat` for text. A vision
or speech model name invented to "complete the config" would sit in the database
looking authoritative and be wrong.

---

## 5. What this leaves

| Phase | State |
| --- | --- |
| 21 — AI Gateway | ✅ complete (config + adapter + routing + fallback + usage ledger) |
| 22 — AI Credits | ✅ complete (four functions + view, wrapped) |
| 23 — AI security | ⬜ next: output validation, prompt assembly that delimits untrusted content, upload validation |
| 24–25 | ⬜ testing · production readiness gate |

**Phase 23 is the gate that matters**: it is what makes it safe to expose AI to
teachers and students at all, and it is the phase that turns this library into
something with a request surface.

### Owed before phases 21–23 can be *finished* (not before 23 can start)

| # | Input | Unblocks |
| --- | --- | --- |
| O7a | Credit pricing schedule | `PLACEHOLDER_PRICING` → the real schedule |
| O7b | Vision model + speech-to-text provider | Seeding those capabilities at all |
| O7c | Fallback triggers (is 429 worth a retry? is a 401?) | Currently: everything except 400/422 falls back |
| O7d | Usage retention | Whether `ai_usage_events` needs pruning |
| I9 | Consent to move `ai-import` / copilot onto the gateway | Removing the second and third DeepSeek client |
