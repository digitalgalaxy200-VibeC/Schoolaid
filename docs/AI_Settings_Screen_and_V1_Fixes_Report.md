# AI Settings Screen & V1 Security Fixes — Report

**Scope of this increment:** the three approved V1 fixes (I10–I12), the
school-level AI entitlement gate, Groq as the speech-to-text provider, and the
**Super Admin AI settings screen** — the control panel that makes provider choice
and per-school access a click instead of a migration.

**Status:** complete and verified; applied to staging. **No AI call can succeed
yet** — the API keys are still missing (I13).

Verified: **412 passed / 43 skipped** across the suite, `tsc --noEmit` clean, and
every file written here lint-clean. The three touched V1 files are lint-neutral
(`ai-import` reports the same 16 pre-existing `any` errors at `HEAD` and after the
change).

---

## 1. What was built

| # | Deliverable | Where |
| --- | --- | --- |
| **I10** | `ai-import` uploads now validated: extension from the bytes, type checked against the bytes, size capped | `src/app/api/teacher/ai-import/route.ts` |
| **I11** | School-admin school updates projected onto an allow-list of writable columns | `src/app/api/school-admin/school/route.ts` |
| **I12** | School names/Slugs fenced in the copilot's system prompt | `src/lib/copilot/prompts/system-prompt.ts` |
| — | **School-level AI gate** in the gateway | `src/lib/ai/features.ts` + `src/lib/ai/gateway.ts` |
| — | **Groq** provider, both Whisper models, plus a text fallback | migration `053` |
| — | **AI Settings screen** (page + API + nav entry) | `src/app/super-admin/ai/page.tsx`, `src/app/api/super-admin/ai/providers/route.ts` |

### I10 — why the extension mattered

The route built its storage path from `file.name.split(".").pop()` — an extension
chosen by the uploader — and stored the file with `contentType: file.type`, also
client-supplied. Validation now happens **once, before anything is stored or
sent**, and both the storage write and the provider call use the type read from
the bytes. A batch is all-or-nothing: one bad file and nothing is stored.

### I11 — why a projection and not a rejection

The profile screen loads the whole school row (`select("*")`) and PUTs the whole
object back, so a body containing `is_active` is **ordinary traffic from our own
page, not an attack**. Rejecting unknown keys would have broken that screen.
Projecting onto an allow-list achieves the goal — the write cannot touch anything
outside the list — without changing what the UI may send. `slug` is excluded
deliberately: it is in URLs.

### I12 — why the fence, not just sanitising

A school admin can rename their school, and that name is interpolated into the
Super Admin's copilot **system** prompt. Fencing it is the mitigation; the real
guarantee remains that high-risk capabilities are blocked in code and every write
needs human approval.

---

## 2. Your question: can I toggle which schools get AI? — **yes, and it is now enforced**

There are **three independent gates**, and they answer different questions. A call
must pass all three.

| Layer | Question | Where it lives | Who sets it |
| --- | --- | --- | --- |
| **Platform** | Is a provider configured, enabled, and does it have a key? | `ai_providers` | Super Admin (AI Settings) |
| **School** | May **this school** use AI at all? | `school_features`, key `ai` | Super Admin (AI Settings) |
| **Money** | Can this school afford the call? | credit ledger | granted/purchased |

**The school gate is new, and it defaults to deny.** No row means no AI. That is
enforced in **one place** — the gateway — so no feature can forget it, and a
school that complains "AI does nothing" is answered by a
`refused_disabled` row in `ai_usage_events` rather than a mystery.

It reuses `school_features`, the mechanism `ai_import` already uses, rather than
adding a second way to answer the same question. The legacy `ai_import` flag is
untouched: that route keeps its own flag, the gateway uses the master `ai` flag.

---

## 3. What staging now has

| Provider | Priority | Key variable | Serves |
| --- | --- | --- | --- |
| **DeepSeek** | 10 | `DEEPSEEK_API_KEY` | `text`: `deepseek-flash` · `vision`: `deepseek-flash` |
| **Groq** | 20 | `GROQ_API_KEY` | `speech_to_text`: `whisper-large-v3-turbo` (10), `whisper-large-v3` (20) · `text`: `openai/gpt-oss-120b` (50, fallback) |

Lower priority is tried first, then the next. So text and vision go to DeepSeek,
**voice notes go to Groq**, and if DeepSeek fails, text falls through to Groq —
which is the "different provider per capability, with fallback" model you asked
for, working, with the ordering visible and editable on the screen.

---

## 4. Decisions worth your attention

### 4.1 New providers and models start switched **off**

Adding Gemini on the screen creates it disabled; you then flip its toggle. This
keeps 049's principle ("nothing turns AI on by accident") true even when someone
is adding a provider at speed. One line changes it if you would rather new rows
arrive enabled.

### 4.2 Both Whisper models are seeded, turbo first

Turbo is the default — for dictating a note it is accurate enough and costs about
a third as much ($0.04/hr vs $0.111/hr). The full model is enabled **behind** it,
so a turbo failure falls through automatically. That is also the cheapest possible
proof that per-capability fallback works.

### 4.3 Groq is NOT a vision or voice-**output** option

Verified from Groq's own model list: there is **no production vision model**, so
vision stays with DeepSeek (or Gemini, which you can add). Their only
text-to-speech is a **preview** model — "may be discontinued at short notice" —
which does not belong in a production path.

### 4.4 Gemini still cannot serve voice notes — unchanged from before

Gemini transcribes by putting audio *inside* a chat message, not through
`/audio/transcriptions`, so it does not fit the `speech_to_text` capability as
built. Groq covers that capability today. If you specifically want Gemini for
voice, it is a small second adapter — say the word.

---

## 5. What is still blocking a real AI call

| # | Gate | State |
| --- | --- | --- |
| 1 | Provider enabled | ✅ |
| 2 | Model configured, current name | ✅ |
| 3 | **`DEEPSEEK_API_KEY` / `GROQ_API_KEY`** | ❌ **I13 — absent from `.env.staging` and Vercel** |
| 4 | **A school granted the `ai` flag** | ❌ default-deny; grant it on the screen |
| 5 | **The school has credits** | ❌ no credit lots exist |
| 6 | A feature that calls the gateway | ❌ none built — deliberate |

**Two other things carried forward:**

- **I17 — the legacy model name.** `src/app/api/teacher/ai-import/route.ts:55` and
  `src/lib/copilot/providers/deepseek-provider.ts` still use `deepseek-chat`, which
  is not in DeepSeek's current model table. Both are working V1 features, so I did
  not change them. **Whether `deepseek-chat` still resolves is unverified** — it
  needs a key to test. If it is retired, the fix in each is one line.
- **Pricing** remains a placeholder (one credit per call) until you decide it.
  Nothing charges while AI is off.

---

## 6. Not verified

- **The screen has never been opened in a browser.** Types and lint are clean;
  layout, toggle behaviour and the add-provider form are unproven visually. This
  joins the CBT screens on the list that needs your browser pass.
- **No AI call has been made end to end**, for the six reasons above.
