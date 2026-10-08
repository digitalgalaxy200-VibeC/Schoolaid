# SchoolAid School Website — Content Structure Inventory

> **Provenance.** Compiled from direct inspection of the implementation (section contracts, renderer components, CMS editor, and media policy) and re-verified at branch `staging`, commit `a703252` (2026-10-08). This describes the platform as it ships today. No code changes accompany this document.

**Three facts that frame everything below:**

1. **A school website is one page** (`/`, the home page). "Sections" are blocks on that single page — there are no sub-pages, and the "menu" is anchor links down one page.
2. **The platform vocabulary is 15 blocks. 14 are editable in the dashboard; `blog` is not** (detailed in §7).
3. **A save is live.** There is no draft/publish split in the implementation today: the editor writes the same tables the public page reads. Hidden blocks may be unfinished; a visible block must be complete; at least one block must be visible; max 25 blocks; at most one block of each kind.

---

## 1. Website Sections

Every block is **optional as a whole** — the school switches it on/off. "Required" below means: *if the block is visible, these fields are required*.

| # | Section (`kind`) | Dashboard label | Purpose | Required? | Where it appears | Supports |
|---|---|---|---|---|---|---|
| 1 | `notice` | Top Announcement Bar | Urgent notice / admissions alert | Block optional; `message` required | Very top, above the header | Text + optional link |
| 2 | `hero` | Welcome Banner & Hero | Main introduction | `headline`, `subheadline` required | Top of page (wherever the school orders it) | Text, badge, image, 2 buttons, up to 4 stat cards |
| 3 | `values` | Mission, Vision & Values | Educational philosophy, mission, pillars | `heading` + 1–12 items required | Anywhere in the page order | Text, mission/vision cards, icon cards |
| 4 | `about` | About Our School | History, background, character | `heading`, `body` required | Anywhere | Text + optional image |
| 5 | `programs` | Academic Programmes | Curriculum levels, classes, tiers | `heading` + 1–12 items required | Anywhere | Text, optional per-card image and badge |
| 6 | `facilities` | Campus Facilities | Labs, sports, hostels, infrastructure | `heading` + 1–12 items required | Anywhere | Text + optional per-card image |
| 7 | `principal_message` | Principal's Welcome | Greeting from the Head | `heading`, `message` required | Anywhere | Text + optional photo, name, title |
| 8 | `highlights` | Why Choose Us | Strengths, distinctions | `heading` + 1–12 items required | Anywhere | Text + optional icon cards |
| 9 | `testimonials` | Community Testimonials | Parent/student/alumni quotes | `heading` + 1–12 items required | Anywhere | Quote cards + optional avatar |
| 10 | `admissions_steps` | Admissions Process | Step-by-step enrolment guide | `heading` + 1–6 steps required | Anywhere | Numbered step cards + optional prospectus link |
| 11 | `events` | School Events & Calendar | Upcoming dates, open days | `heading` + 1–8 items required | Anywhere | Date/time/location cards (all typed by hand) |
| 12 | `faq` | Frequently Asked Questions | Parent questions | `heading` + 1–12 Q&As required | Anywhere | Accordion text |
| 13 | `gallery` | Campus Life & Gallery | Photo album | `heading` + 1–12 images required | Anywhere | Photo grid, filter categories, lightbox |
| 14 | `blog` | *(falls back to "blog")* | School news posts | `heading` + 1–12 posts required | Not usable — no editor (§7) | Post cards (title/meta/image), renderer exists |
| 15 | `contact` | Contact & Admissions | Phone, email, address, inquiries | `heading`, `intro` required | Anywhere | Details cards from school data + social chips + fixed action panel |

Ordering is fully school-controlled (up/down in the dashboard). The list above is the platform's declaration order; a school's actual page order is whatever they saved.

---

## 2. Content Fields

Actual field names from the validation contracts. `max` = character limit enforced. Sections with **no editor** (`blog`) are marked.

### 1. `notice` — Top Announcement Bar

| Field | Type | Required | Max | Notes |
|---|---|---|---|---|
| `message` | Text | Yes | 200 | |
| `linkText` | Text | No | 40 | Editor: "Action Link Text (Optional)" |
| `linkUrl` | Text/URL | No | 300 | If set and `linkText` empty, renders "Learn more" |

### 2. `hero` — Welcome Banner & Hero

| Field | Type | Required | Max | Notes |
|---|---|---|---|---|
| `headline` | Text | Yes | 120 | |
| `subheadline` | Text | Yes | 200 | |
| `badgeText` | Text | No | 40 | If empty, renders "🎓 Welcome to {school name}" |
| `imageUrl` | Image (media library) | No | 300 | Large featured photo |
| `ctaText` | Text | No | 40 | Default "Apply Now" |
| `ctaLink` | Text/URL | No | 300 | Default `#contact` |
| `secondaryCtaText` | Text | No | 40 | Default "Explore Academics" |
| `secondaryCtaLink` | Text/URL | No | 300 | Default `#programs` |
| `stats[]` (max 4) | List | No | — | Each: `value` (max 30) + `label` (max 60), both required if an entry exists |

### 3. `values` — Mission, Vision & Values

| Field | Type | Required | Max | Notes |
|---|---|---|---|---|
| `heading` | Text | Yes | 80 | |
| `mission` | Textarea | No | 1200 | Renders an "Our Mission" card |
| `vision` | Textarea | No | 1200 | Renders an "Our Vision" card |
| `items[]` (1–12) | List | Yes | — | Each: `title` (60) + `description` (200) required; `icon` optional (40, emoji; default 💎) |

### 4. `about` — About Our School

| Field | Type | Required | Max |
|---|---|---|---|
| `heading` | Text | Yes | 80 |
| `body` | Textarea (preserves line breaks) | Yes | 1200 |
| `imageUrl` | Image (media library) | No | 300 |

### 5. `programs` — Academic Programmes

| Field | Type | Required | Max | Notes |
|---|---|---|---|---|
| `heading` | Text | Yes | 80 | |
| `intro` | Textarea | No | 1200 | |
| `items[]` (1–12) | List | Yes | — | Each: `name` (60) + `description` (200) required; `badge` optional (40); `imageUrl` optional |

### 6. `facilities` — Campus Facilities

| Field | Type | Required | Max |
|---|---|---|---|
| `heading` | Text | Yes | 80 |
| `subheading` | Text | No | 200 |
| `items[]` (1–12) | List | Yes | Each: `title` (60) + `description` (200) required; `imageUrl` optional |

### 7. `principal_message` — Principal's Welcome

| Field | Type | Required | Max | Notes |
|---|---|---|---|---|
| `heading` | Text | Yes | 80 | |
| `message` | Textarea | Yes | 1200 | Rendered in quotes |
| `authorName` | Text | No | 80 | Default "The School Leadership" |
| `authorTitle` | Text | No | 80 | Default "Principal" |
| `imageUrl` | Image (media library) | No | 300 | If empty, a 🎓 placeholder |

### 8. `highlights` — Why Choose Us

| Field | Type | Required | Max |
|---|---|---|---|
| `heading` | Text | Yes | 80 |
| `subheading` | Text | No | 200 |
| `items[]` (1–12) | List | Yes | Each: `title` (60) + `description` (200) required; `icon` optional (40, emoji; defaults rotate 🏆📚🔬🎭⚽🎨💡🌱) |

### 9. `testimonials` — Community Testimonials

| Field | Type | Required | Max |
|---|---|---|---|
| `heading` | Text | Yes | 80 |
| `subheading` | Text | No | 200 |
| `items[]` (1–12) | List | Yes | Each: `quote` (1200) + `authorName` (80) + `role` (60) required; `avatarUrl` optional |

### 10. `admissions_steps` — Admissions Process

| Field | Type | Required | Max |
|---|---|---|---|
| `heading` | Text | Yes | 80 |
| `subheading` | Text | No | 200 |
| `prospectusUrl` | Text/URL | No | 300 |
| `items[]` (1–6) | List | Yes | Each: `stepNumber` (10) + `title` (60) + `description` (200) required |

### 11. `events` — School Events & Calendar

| Field | Type | Required | Max | Notes |
|---|---|---|---|---|
| `heading` | Text | Yes | 80 | |
| `subheading` | Text | No | 200 | |
| `items[]` (1–8) | List | Yes | Each: `title` (60) + `date` (40) required; `time` (40), `location` (60), `category` (40) optional |

`date` is **free text** (a plain input, placeholder "Date (e.g. Nov 14, 2026)") — no date picker, no sorting, no expiry. Write it in the format you want parents to read.

### 12. `faq` — Frequently Asked Questions

| Field | Type | Required | Max |
|---|---|---|---|
| `heading` | Text | Yes | 80 |
| `subheading` | Text | No | 200 |
| `items[]` (1–12) | List | Yes | Each: `question` (120) + `answer` (1200) required |

### 13. `gallery` — Campus Life & Gallery

| Field | Type | Required | Max | Notes |
|---|---|---|---|---|
| `heading` | Text | Yes | 80 | |
| `subheading` | Text | No | 200 | |
| `items[]` (1–12) | List | Yes | `imageUrl` required; `caption` (60) optional; `category` (40) optional |

`category` powers the filter chips; with no categories the chips are hidden. Lightbox included.

### 14. `blog` — School News

| Field | Type | Required | Max |
|---|---|---|---|
| `heading` | Text | Yes | 80 |
| `subheading` | Text | No | 200 |
| `posts[]` (1–12) | List | Yes | `title` (120) required; `excerpt` (1200), `date` (40), `author` (80), `category` (40), `imageUrl` optional |

⚠️ **Not editable in the dashboard** — see §7.

### 15. `contact` — Contact & Admissions

| Field | Type | Required | Max | Notes |
|---|---|---|---|---|
| `heading` | Text | Yes | 80 | |
| `intro` | Textarea | Yes | 1200 | |
| *(everything else automatic)* | — | — | — | Phone, email, address (School Settings); WhatsApp + Facebook/Instagram/X/YouTube links (Website → Contact links); fixed action panel |

### 2b. Fixed text the template renders (not editable anywhere — do not write copy for these)

| Where | Fixed text |
|---|---|
| Notice bar | pill "Notice"; link fallback "Learn more →" |
| Hero | fallback badge "🎓 Welcome to {school}", "Official Campus" chip, motto quote (auto) |
| Values | "Our Foundation", "Our Mission", "Our Vision", "Our Core Values" |
| About / Programs / Facilities / Highlights / Testimonials | eyebrows "About Our School", "Curriculum & Levels", "World-Class Infrastructure", "Why Choose Us", "Community Voices" |
| Principal | "Welcome Message" |
| Admissions | "How to Join Us", banner "Have questions about admissions?" + "Download our complete academic prospectus or contact our admissions desk.", buttons "📄 Download Prospectus" / "Contact Admissions" |
| Events / FAQ / Gallery / Blog / Contact | eyebrows "School Calendar", "Questions & Answers", "Campus Life", "School News", "Get In Touch" |
| Contact panel | "Admissions Open", "Ready to Join Our Community?", fixed paragraph, "Call Admissions Office", "Student / Teacher Portal Login →" |
| Programs cards | "Inquire for admission →" |
| Footer | "Quick Navigation", "School Portals", three fixed portal labels, "Powered by SchoolAid", © year |

---

## 3. Website Navigation

The menu is **derived from the blocks the school has switched on** — a hidden block gets no link. Order is fixed by the template, not by block order.

**Header (desktop + mobile drawer):**

| Menu item | Targets | Appears when |
|---|---|---|
| About | `#about` | `about` on |
| Academics | `#programs` | `programs` on |
| Highlights | `#highlights` | `highlights` on |
| Gallery | `#gallery` | `gallery` on |
| Blog | `#blog` | `blog` on |
| Events | `#events` | `events` on |
| Contact | `#contact` | `contact` on |

Plus, always: the school brand (logo + name + motto) and the **Portal Login** button → `/school/<slug>/login`. The mobile drawer adds a **Contact Admissions** button when `contact` is on. If no menu-worthy block is on, the menu and hamburger don't render at all.

**Footer:**

- Quick Navigation: About the School (`#about`), Academic Programmes (`#programs`), Principal's Message (`#principal`), Campus Gallery (`#gallery`), Contact & Location (`#contact`) — each only when its block is on; the column disappears if none are.
- School Portals (always): "Student / Parent Login →", "Teacher & Staff Portal →", "School Administration →" — all to `/school/<slug>/login`.

**Not in any menu:** `notice`, `hero`, `values`, `facilities`, `faq`, `testimonials`, `admissions_steps` (they still render in-page; `principal_message` appears only in the footer).

Note: menu links are filtered, but **authored links are not** — a hero button or notice link is whatever the school typed and may point at a switched-off block (found on GS Apex live).

---

## 4. Dynamic Content

Content pulled automatically from school data — the content specialist does **not** write these:

| Data | Source | Appears in |
|---|---|---|
| School name | School Settings | Navbar, footer, hero fallback badge, hero crest chip, SEO/manifest default |
| Motto | School Settings | Navbar, hero quote block, footer, SEO description default |
| Logo | School Settings, or a website-specific logo chosen in Website → Branding | Navbar, footer, hero crest, browser favicon/manifest |
| Phone | School Settings | Contact "Call Us", "Call Admissions Office" |
| Email | School Settings | Contact "Email Us" (mailto) |
| Address | School Settings | Contact "Campus Location", footer |
| Portal links (slug) | School record | Navbar button, contact panel, footer ×3 |
| Colour palette | Website → Branding (Cobalt/Forest/Plum/Slate/Maroon) | Every section |
| Browser branding | Derived (school name/title/logo/palette) | Tab title, favicon, home-screen manifest |
| Year | Automatic | Footer copyright |

**Nothing else is dynamic.** News, announcements, events, gallery, programmes, testimonials and FAQs are **typed lists** — not fed by any other SchoolAid subsystem. There is **no staff/teachers section at all**, and the events list is not connected to any calendar, isn't sorted, and never expires.

---

## 5. Media Requirements

**Upload policy (enforced):** PNG / JPEG / WebP only (no SVG, no GIF) · max **8 MB per file** · **250 MB per school** · alt text up to 200 characters · images stored in the school's own media library and reusable across blocks.

**No dimension requirements are defined anywhere in the implementation.** Rendered crops (guidance only — images are centre-cropped with `object-cover`):

| Purpose | Where | Rendered shape | Multiple? |
|---|---|---|---|
| Hero image | `hero.imageUrl` | Wide landscape, ~16:9–3:2 (h-56→96) | No (one) |
| About photo | `about.imageUrl` | Portrait-ish/landscape, h-80–96 | No |
| Programme card image | `programs.items[].imageUrl` | Landscape card h-44 (~16:9) | Yes (1 per item, ≤12) |
| Facility card image | `facilities.items[].imageUrl` | Landscape card h-48 | Yes (≤12) |
| Principal photo | `principal_message.imageUrl` | Square 176×176, rounded | No |
| Testimonial avatar | `testimonials.items[].avatarUrl` | Circle, small (~40 px) | Yes (≤12) |
| Gallery photo | `gallery.items[].imageUrl` | **4:3 exactly** (slot is aspect-[4/3]) | Yes (≤12) |
| Blog cover | `blog.posts[].imageUrl` | Landscape h-44 (~16:9) | Yes (≤12) |
| Website logo | Website → Branding | Square works best; shown ~36–40 px | No |
| Prospectus | `admissions_steps.prospectusUrl` | Not an image — a URL (any link) | No |

---

## 6. Calls to Action

| CTA | Location | Button text | Destination | Configurable? | Optional? |
|---|---|---|---|---|---|
| Primary hero button | Hero | `ctaText` | `ctaLink` | Yes (text + link) | Yes — defaults "Apply Now" → `#contact` |
| Secondary hero button | Hero | `secondaryCtaText` | `secondaryCtaLink` | Yes | Yes — defaults "Explore Academics" → `#programs` |
| Notice link | Notice bar | `linkText` | `linkUrl` | Yes | Yes — hidden unless `linkUrl` set |
| "Inquire for admission →" | Each programme card | Fixed | Fixed `#contact` | No | Always when `programs` on |
| "📄 Download Prospectus" | Admissions banner | Fixed | `prospectusUrl` | Link only | Yes |
| "Contact Admissions" | Admissions banner | Fixed | Fixed `#contact` | No | Always when `admissions_steps` on |
| WhatsApp card | Contact | Fixed "Chat us on WhatsApp →" | `wa.me/<number>` (auto-built from the number typed in Website → Contact links) | Number only | Yes |
| Call / Email cards | Contact | Fixed | `tel:` / `mailto:` from School Settings | No (data-driven) | Yes (hidden if data absent) |
| Social chips | Contact | Facebook, Instagram, X, YouTube | URLs from Website → Contact links | URLs only | Yes (each hidden if empty) |
| "Call Admissions Office" | Contact panel | Fixed | `tel:` school phone | No | Hidden if no phone |
| "Student / Teacher Portal Login →" | Contact panel + navbar "Portal Login" + footer ×3 ("Student / Parent Login →", "Teacher & Staff Portal →", "School Administration →") | Fixed | `/school/<slug>/login` | No | Always |
| "Contact Admissions" | Mobile drawer | Fixed | Fixed `#contact` | No | When `contact` on |

Only two destinations are school-configurable in any meaningful way (`ctaLink`, `ctaText` pair; notice link; prospectus URL; contact URLs).

---

## 7. Content That Cannot Currently Be Added

Documented as limitations, in order of significance:

- **`blog` (School News) is not editable.** The block exists in the platform vocabulary (contract + full renderer), and the dashboard even offers it (labelled "blog", falling back from the editor's label map, which has no entry for it) — but the editor has **no fields for it**, and a visible block with no content fails validation on save. It is effectively unusable today. *(Verified from code; exact on-screen behaviour of the empty block was not exercised — Needs verification.)*
- **`about` "highlights" checklist is unreachable.** The About renderer supports a ✓ checklist and the type declares `stats` too, but the contract neither accepts nor stores either — so content of this kind can never reach the page.
- **No staff/teachers section.** No way to list leadership or teachers on the website.
- **No contact form / enquiry form** of any kind (phone/WhatsApp/email links only).
- **No map.** Address is plain text; no Google Maps embed.
- **No multi-page structure.** One home page only; no separate About/Admissions/News pages, no page-level menu.
- **No integration with platform data** for news, announcements, events, calendar, results, or admissions — all typed lists.
- **No announcement scheduling or expiry.** The notice bar shows until someone edits it.
- **No video embeds, downloads library, or document hosting** — only the single `prospectusUrl` link.
- **No custom fonts or per-section colours** — palette applies site-wide (5 fixed palettes).
- **No analytics** on the school site.
- **No floating WhatsApp widget** — WhatsApp only inside the Contact block.
- **No social platforms beyond** WhatsApp, Facebook, Instagram, X, YouTube.
- **No automatic image resizing/optimisation** — original files are served (derivatives recorded as a future decision).

---

## 8. Final Website Copy Template

```text
SCHOOL WEBSITE COPY

[BLOCK] = optional; a school switches it on.
(field, limit) — required fields are marked *.

======================================================
1. TOP ANNOUNCEMENT BAR  (optional block)
- Announcement Message (200) *
- Action Link Text (40):
- Action Link URL (300):

2. WELCOME BANNER & HERO  (recommended; block optional)
- Main Headline (120) *
- Sub-headline / Value Proposition (200) *
- Announcement Badge (40):
- Featured Hero Image (upload):
- Primary Button Label (40):            [default: Apply Now]
- Primary Button Link (300):            [default: #contact]
- Secondary Button Label (40):          [default: Explore Academics]
- Secondary Button Link (300):          [default: #programs]
- Stat 1: Value (30) / Label (60)
- Stat 2: Value (30) / Label (60)       [up to 4]

3. MISSION, VISION & VALUES  (block optional)
- Section Heading (80) *
- Mission Statement (1200):
- Vision Statement (1200):
- Value 1: Title (60) * / Description (200) * / Icon (emoji, 40):
- Value 2: …                            [1–12 values]

4. ABOUT OUR SCHOOL  (block optional)
- Section Heading (80) *
- About Text (1200, line breaks preserved) *
- About Image (upload):

5. ACADEMIC PROGRAMMES  (block optional)
- Section Heading (80) *
- Intro (1200):
- Programme 1: Name (60) * / Description (200) * / Badge (40): / Image (upload):
- Programme 2: …                        [1–12 programmes]

6. CAMPUS FACILITIES  (block optional)
- Section Heading (80) *
- Subheading (200):
- Facility 1: Title (60) * / Description (200) * / Image (upload):
- Facility 2: …                         [1–12 facilities]

7. PRINCIPAL'S WELCOME  (block optional)
- Section Heading (80) *
- Message Body (1200) *
- Author Name (80):                     [default: The School Leadership]
- Author Title (80):                    [default: Principal]
- Photo (upload):

8. WHY CHOOSE US  (block optional)
- Section Heading (80) *
- Subheading (200):
- Highlight 1: Title (60) * / Description (200) * / Icon (emoji, 40):
- Highlight 2: …                        [1–12 highlights]

9. COMMUNITY TESTIMONIALS  (block optional)
- Section Heading (80) *
- Subheading (200):
- Testimonial 1: Quote (1200) * / Author Name (80) * / Role (60) * / Avatar (upload):
- Testimonial 2: …                      [1–12 testimonials]

10. ADMISSIONS PROCESS  (block optional)
- Section Heading (80) *
- Subheading (200):
- Step 1: Step Number (10) * / Title (60) * / Description (200) *
- Step 2: …                             [1–6 steps]
- Prospectus URL (300):

11. SCHOOL EVENTS & CALENDAR  (block optional — typed by hand)
- Section Heading (80) *
- Subheading (200):
- Event 1: Title (60) * / Date (40, free text) * / Time (40): / Location (60): / Category (40):
- Event 2: …                            [1–8 events]

12. FREQUENTLY ASKED QUESTIONS  (block optional)
- Section Heading (80) *
- Subheading (200):
- Q1 (120) * / A1 (1200) *
- Q2 / A2:                              [1–12 questions]

13. CAMPUS LIFE & GALLERY  (block optional)
- Section Heading (80) *
- Subheading (200):
- Photo 1: Image (upload, 4:3) * / Caption (60): / Category (40):
- Photo 2: …                            [1–12 photos]

14. SCHOOL NEWS  [NOT EDITABLE — see §7]
- (heading 80 *; posts: title 120 *; excerpt 1200; date 40; author 80; category 40; image)

15. CONTACT & ADMISSIONS  (block optional)
- Section Heading (80) *
- Intro Text (1200) *
- [Automatic, nothing to write: phone, email, address, WhatsApp, Facebook,
  Instagram, X, YouTube — set in Website → Contact links / School Settings]

------------------------------------------------------
WEBSITE-WIDE SETTINGS (not per-section)
- Colour palette: Cobalt / Forest / Plum / Slate / Maroon
- Website logo: from the media library   [default: the school's own logo]
- Page title (80):                       [default: school name]
  This is the browser-tab / search title — e.g. "GS Apex Stars School"
- Description (200):                     [default: school motto]
- School name / motto / logo / phone / email / address come from School
  Settings and appear automatically — do not include them in section copy.
```

---

## Notes for the copy specialist

- The only places copy is truly free-form are the numbered blocks above. **Eyebrows, buttons and banner sentences are fixed by the template** (§2b) — do not draft them.
