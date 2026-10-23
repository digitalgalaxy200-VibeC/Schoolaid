# GS-Apex Stars School — Website Content Request

**Prepared:** 2026-10-23
**Site:** https://gsapexstars.com.ng/ (live, SchoolAid, template `classic`, palette `forest`)
**Purpose:** information the school owners must supply before the website can be finished.

---

## Where the site stands today

**Already live (7 visible blocks):** hero, mission/vision/values, about, programmes, principal's welcome, why-choose-us, contact.

**Switched off / empty (7 blocks):** notice bar, facilities, testimonials, admissions process, events, FAQs, gallery. *(School News cannot be used — the platform has no editor for it yet.)*

**School record:** name, motto, address, phone, email and website are filled in. Logo is uploaded.

So the site is *presentable*, but it is missing the blocks that actually convert a parent — admissions, fees, facilities, photos, proof — and there are a few internal contradictions we need the owners to settle.

---

## PRIORITY 0 — Decisions we cannot make for them

**Answered by the school on 2026-10-23.** Recorded here so the rest of the copy can be written against it.

| # | Question | Answer |
|---|---|---|
| 0.1 | **Exact school name** | "GS-Apex Stars **School**" — singular, hyphenated. Already applied across the site. |
| 0.2 | **Exact address** | The first version: **No. 2, Yomi Olaofe Avenue, Afolabi B/Stop, Lasu–Igando Road, Lagos**. The "Yemi … Akesan" version is wrong. |
| 0.3 | **Second phone line** | Place it as a real second number, not prose — now a `schools.phone_secondary` column, shown under the first number on the contact card (migration 077). |
| 0.4 | **Who signs the welcome message** | **Mrs Priscillia Uzoamaka Ariguzo, Proprietress.** Now stored in `authorName` / `authorTitle`; the handwritten signature is removed from the message body. |
| 0.5 | **Which classes actually exist** | **Basic** is the stage name — use "Basic Classes", not "Primary". The About prose has been changed to match the programme cards. |
| 0.6 | **Curriculum claim** | Keep the existing record ("a blend of British and Nigerian curricula"). |
| 0.7 | **Government approval / registration** | **Still outstanding** — needed only if we add it as proof under "Why Choose Us". |

---

## PRIORITY 0 (original wording, for the record)

| # | Question | Why it matters |
|---|---|---|
| 0.1 | **Exact school name?** Live copy uses "GS-Apex Stars School" (singular, hyphenated). Old material says "GS APEX STARS SCHOOLS" / "GS Apex Stars Schools" (plural). Which is official, and how should it be capitalised? | It renders in the navbar, footer, browser tab, values, about and SEO. We currently normalise to the singular. |
| 0.2 | **Exact address?** Two versions exist: "No. 2, Yomi Olaofe Avenue, Afolabi B/Stop, Lasu–Igando Road, Lagos" and "No 2, Yemi Olaofe Avenue, Afolabi, Akesan, Lagos". Which is correct (Yomi or Yemi? B/Stop or Akesan? Lasu–Igando Road?) | It is the Google/search-visible address and is printed in the footer. |
| 0.3 | **Second phone line** `08028761523` appears only inside the contact paragraph. Should it replace or sit beside `08032252480`? The platform stores **one** number — the second can only live in prose. | Contact cards, WhatsApp link and "Call Admissions Office" all use the stored number. |
| 0.4 | **Who signs the welcome message?** The block currently shows author "The School Leadership / Principal" while the message is signed by **Mrs Priscillia Uzoamaka Ariguzo, Proprietress**. Confirm the correct name and title (Proprietress? Principal? Head Teacher?), and whether the signature line should stay in the message body. | Name/title are separate fields; the paragraph signature is a workaround. |
| 0.5 | **Which classes actually exist?** Programme cards say Pre School / Nursery Classes / Basic Classes, but the About text says "preschool, nursery, **primary**". Give the real list with age ranges (e.g. Creche 0–2, Pre-Nursery 2–3, Nursery 1–2, Primary 1–6). | Programme cards are the main academic page; parents need ages. |
| 0.6 | **Is "a blend of British and Nigerian curricula" accurate?** This claim was in the old site copy. Confirm, or tell us which curriculum (Nigerian national, British, Montessori, blended) so we correct it. | It is an academic claim on a public page. |
| 0.7 | **Is the school government-approved / registered?** If yes, the approval or registration reference. | Needed for the "Why Choose Us" proof points. |

---

## PRIORITY 1 — Fill the blocks that are already live

### 1. Hero banner
- [ ] **Hero photo** — one wide landscape image (roughly 16:9), children in class or on campus. Best available resolution. *(Currently no image, so the banner is text-only.)*
- [ ] **Badge text** (40 characters, optional) — default is "🎓 Welcome to GS-Apex Stars School". Keep or replace?
- [ ] **Stat cards, up to 4.** Each needs a *value* (30 chars) and a *label* (60 chars). Suggested: year founded, number of pupils, teacher–pupil ratio, years of operation, WAEC/common-entrance results. *(Currently zero stats — this is the biggest credibility gap on the page.)*

### 2. Mission, vision & values *(live — verify only)*
- [ ] Confirm the **mission** wording: "Established to nurture and groom a total child … raising outshining stars."
- [ ] Confirm the **vision** wording: "To raise a godly generation prepared and equipped to make formidable global impact."
- [ ] Confirm the **five core values** are the official set: High Moral Standard, Quality Education, Honesty, Teamwork, Raising a Total Child.

### 3. About the school *(live — mostly history missing)*
- [ ] **Year founded** and by whom.
- [ ] Brief history / milestones (first set of pupils, expansions, new buildings).
- [ ] **About photo** — campus exterior, assembly, or a classroom (portrait or landscape).
- [ ] Anything we should *remove* from the current 7-paragraph text? (It is long; parents skim.)

### 4. Academic programmes
- [ ] Per class: **name, age range, and what a parent should expect** (max 200 characters each).
- [ ] Optional per-card **badge** (40 chars, e.g. "Ages 3–5") and **photo** (landscape).
- [ ] Do you offer **after-school care, holiday coaching, or extra lessons**? (Can be added as programmes or a facility.)

### 5. Principal's welcome
- [ ] **Photo of the head** — square, face-centred, good lighting.
- [ ] Confirm/approve the welcome message (currently 2 paragraphs) or send a replacement (max 1,200 characters).

### 6. Why Choose Us
- [ ] Confirm the three points: Shaping Future Leaders, World-Class Education, Excellence as a Standard.
- [ ] **Add up to three more** with proof (max 60-character title, 200-character description), e.g. qualified teachers, small classes, secure campus, transport, Christian ethos, results.

### 7. Contact & Admissions *(live — links missing)*
- [ ] **WhatsApp number** — confirm it is the same as `+234 803 225 2480`.
- [ ] **Social media links** — Facebook, Instagram, X, YouTube (page URLs only; each is hidden until supplied).
- [ ] **Office / visiting hours** (e.g. Mon–Fri, 8am–4pm) and whether weekends are possible.
- [ ] **Admissions contact person** — name and direct number, if different from the main line.

---

## PRIORITY 2 — Switch on the empty blocks

These are the blocks most likely to win enquiries. Each is optional, but the four marked ★ are recommended.

### ★ 8. Admissions Process (`admissions_steps`)
- [ ] The real steps, 1–6 of them. Each: step number, title (60 chars), description (200 chars). Typical: enquire → buy/collect form → submit documents → entrance assessment/interview → offer & acceptance → resumption.
- [ ] **Documents required** for enrolment (birth certificate, immunisation record, passport photos, previous school report, transfer certificate…).
- [ ] **Is there an entrance examination or interview?** For which classes, and when?
- [ ] **Prospectus** — a PDF link or file we can host/link. *(Without it the "Download Prospectus" banner is weak.)*

### ★ 9. Campus Facilities (`facilities`)
- [ ] List of facilities, 1–12. Each: title (60) + description (200). Think: classrooms, ICT/computing room, library, science corner, playground, sick bay, dining hall, school bus, security/CCTV, generator/solar, water, assembly hall.
- [ ] **Photos** of each (landscape) — optional but they do the selling.

### ★ 10. Campus Life & Gallery (`gallery`)
- [ ] **8–12 photos at 4:3** (the slot is fixed 4:3; other shapes get cropped). Suggested mix: classroom, outdoor play, reading, art, sports, assembly, events, graduation.
- [ ] A **caption** (60 chars) and a **category** (40 chars, e.g. "Classrooms", "Sports", "Events") per photo — categories become the filter chips.
- [ ] **Consent confirmation:** do you have parental permission to publish these children's faces? If not, send photos without identifiable faces or we will not publish them.

### ★ 11. Frequently Asked Questions (`faq`)
- [ ] 6–12 questions parents actually ask, with answers (question 120 chars, answer 1,200 chars). Suggested: school fees and payment terms, uniform, school bus/routes, meals, resumption and holiday dates, class sizes, teacher qualifications, assessment/testing, transfer between classes.

### 12. School Events & Calendar (`events`)
- [ ] Upcoming dates, 1–8: title (60), date (free text, e.g. "Nov 14, 2026"), time, location, category. Examples: open day, PTA meeting, mid-term break, cultural day, graduation.
- [ ] **Note:** this list never expires and is not sorted automatically — it needs a refresh each term.

### 13. Top Announcement Bar (`notice`)
- [ ] One current announcement (max 200 characters) plus an optional link — e.g. "Admissions for the 2026/2027 session are now open" → admissions page/anchor.
- [ ] Confirm the message should be removed or changed after the admissions window.

### 14. Community Testimonials (`testimonials`)
- [ ] 3–6 short quotes from parents (or alumni). Each needs: quote, **author name**, **role** (e.g. "Parent, Primary 3"), optional avatar.
- [ ] **Written consent** from each named parent to publish.

---

## Media checklist (what to send, and in what shape)

**Accepted:** PNG, JPEG, WebP only. Max 8 MB per file. No SVG, no GIF, no HEIC.
**Please send original files** (not screenshots or WhatsApp-compressed copies where possible).

| Item | Shape | How many |
|---|---|---|
| Hero photo | Wide landscape (~16:9) | 1 |
| About photo | Portrait or landscape | 1 |
| Head's photo | Square | 1 |
| Programme photos | Landscape | up to 12 |
| Facility photos | Landscape | up to 12 |
| Gallery photos | **4:3 exactly** | 8–12 |
| Parent avatars | Square/circle crop | optional |
| Logo | Square, high resolution | already uploaded — confirm it is the current one |
| Prospectus | PDF link or file | 1 |

---

## What the website cannot do (so you don't send content we can't use)

- **No staff/teachers page** — there is no block for listing teachers.
- **No contact/enquiry form** — parents use phone, WhatsApp, email or walk in.
- **No Google Map embed** — the address is plain text.
- **No School News / blog** — the block exists but has no editor, so it cannot be used yet.
- **No multi-page structure** — everything is one page with a menu that scrolls.
- **No video embeds**, no document library (one prospectus link only).
- **Only these social channels:** WhatsApp, Facebook, Instagram, X, YouTube.
- **Colours:** five fixed palettes (Cobalt, Forest, Plum, Slate, Maroon). Currently **Forest**. If you prefer another, say so.

---

## Copy-ready reply form

Paste answers here (character limits are enforced by the site).

```text
SCHOOL IDENTITY
Official name (exact capitalisation/hyphenation):
Motto:
Address (exact):
Main phone:
Second phone (prose only):
WhatsApp number:
Email:
Office hours:
Social links — Facebook / Instagram / X / YouTube:
Year founded:
Founder(s):
Government approval / registration ref:

HERO
Badge text (40):
Stat 1 — value (30) / label (60):
Stat 2 — value (30) / label (60):
Stat 3 — value (30) / label (60):
Stat 4 — value (30) / label (60):

PROGRAMMES
1. Name (60) / Age range / Description (200):
2. Name (60) / Age range / Description (200):
3. Name (60) / Age range / Description (200):
4. …

PRINCIPAL'S WELCOME
Author name (80):
Author title (80):
Message (1200, or "approve current"):

WHY CHOOSE US
1. Title (60) / Description (200):
2. Title (60) / Description (200):
3. Title (60) / Description (200):
4. …

ADMISSIONS PROCESS
Step 1 — number / title (60) / description (200):
Step 2 — …
Documents required:
Entrance exam or interview? (which classes / when):
Prospectus link:

FACILITIES
1. Title (60) / Description (200):
2. …
3. …

FAQ
Q1 (120) / A1 (1200):
Q2 / A2:
Q3 / A3:
…

EVENTS
1. Title (60) / Date / Time / Location / Category:
2. …

ANNOUNCEMENT BAR
Message (200):
Link text (40):
Link URL:

TESTIMONIALS
1. Quote / Name (80) / Role (60) / Consent given?:
2. …

MEDIA
Attached: hero / about / head / programmes / facilities / gallery (4:3) / logo
Parental consent for children's photos on the public website? Yes / No / Only non-identifiable
```

> **Follow-up questions after the 2026-10-23 answers:** the second line's actual number (the copy currently quotes 08028761523, which needs confirming as the number to publish in the new field); whether office hours and the admissions officer's name can be added; and the approval/registration reference.

---

## Suggested order of work

1. Get **P0 answers** — they unlock rewriting the current copy (name, address, classes, signatory).
2. Collect **photos + stats** — hero stats and gallery do more for conversion than any paragraph.
3. Write and switch on **admissions process → FAQ → facilities → gallery** in that order.
4. Add **events** and the **notice bar** last, with a named person responsible for keeping them current each term.
