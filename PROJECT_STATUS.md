# TripQuest Project Status

Last updated: 2026-09-21

This is the handoff document for TripQuest. Read it before starting a new
development task, and update it after a major product, infrastructure, or launch
change. Do not put API keys, access tokens, customer information, or other
secrets in this file.

## Product

TripQuest creates destination-specific, age-adjusted printable travel activity
booklets for children. A parent enters a destination, the lead child's age, the
trip length, optional family profiles, interests, and an optional itinerary.

Live site: https://tripquestkids.com

Current public release: https://tripquestkids.com, source branch `main`.

## Current User Experience

- Ages 3 through 14 are supported.
- A trip can contain 1 through 14 days.
- New destinations are researched with Kimi before booklet composition.
- Parents can type daily plans or paste a trip outline.
- The first child is the protected lead explorer and shares the main age field.
- Up to five siblings can be added to the lead explorer.
- Profiles include age, reading level, interests, things to avoid, and preferred
  quest mechanics.
- Interests use an add-one-at-a-time tag editor and are assigned to visible
  interest lenses, missions, clues, and drawing prompts instead of being
  prompt-only data.
- Every generated day includes a concrete family relay; siblings get different
  roles, a role swap, and a shared result rather than appearing only in the
  final family pages. Repeated model copy is replaced by a rotating set of
  scout, sketcher, counter, route, question, and collector roles.
- Daily interest and family-role information appears once per day, on the
  first activity only. The browser preview uses a light briefing strip and
  the PDF uses a compact text cue so the actual game keeps its working space.
- Common branded interests are treated as generic inspiration in the
  deterministic fallback and the composer prompt; official characters, logos,
  slogans, and artwork are not generated.
- Game formats follow an age-safe schedule to reduce repetition.
- Every generated day follows one shared five-slot structure: a short adult
  briefing, a queue activity, an in-place observation game, a sit-down page,
  and an optional three-fact card. Preview and PDF page order come from the
  same manifest, so the purchased file matches the edition shown on screen.
- Landmark content stores separate display, short, and place names. Display
  names are reserved for headers and cannot leak into awkward sentences.
- Reader responsibility and page word budgets are enforced for ages 3-4, 5-6,
  7-9, and 10-14. Ages 3-6 receive especially short adult-led instructions.
- Pre-export QA rejects missing required queue pages, fake in-place games,
  repeated facts or cut-out cards, family-role/roster mismatches, over-budget
  child text, and surviving blank-name placeholders.
- A four-stop route-map puzzle is allowed at most once per booklet.
- The printable family pack includes the booklet, parent guide, family mission
  map, mission cards, badge tracker, memory page, and certificate.
- The web preview includes zoom controls for laptop and small-screen reading.
- Avoid preferences use the same reliable add-and-remove tags as interests,
  with a deliberately quieter visual treatment.
- Pasted itineraries recognize named dates such as 10 April, April 10, and
  numeric day/month dates, then group activities by date order.
- Generated JSON and PDFs are saved for reuse.
- Generation performance is instrumented by stage (`research`, `composition`,
  `illustrations`, `storage`, and `total`) in production Worker logs. Open-trip
  destination research is shared across trip lengths, custom illustrations are
  generated concurrently with a three-image ceiling and a 90-second timeout,
  and PDF artwork reads run concurrently before deterministic embedding.
- Paid return flow reuses the first successful PDF response for the automatic
  download instead of probing and downloading the same file twice.
- Drawing and coloring pages use landmark-aware printable line art. The day
  theme, activity title, labels, and clues select recognizable scenes such as
  the Merlion fountain, temple guardians, Peranakan-style tile patterns,
  Supertrees, mosques, trains, towers, castles, coasts, penguins, wildlife,
  dinosaurs, caves, markets, gardens, and shophouses. The activity title takes
  priority over generic words in the day context. Unknown subjects use a stable
  city-landmark scene instead of a random unrelated illustration.
- Drawing guidance sits in reserved space above the artwork, so it cannot cover
  a dome, sun, landmark, or other part of the printable scene.
- Coloring pages now use a polished `spot / color / trace` format: one large
  recognizable landmark illustration, a 3-by-3 observation game, a trace strip,
  a local clue, and a field-note area. Browser preview and PDF share the same
  semantic page specification so the activity and picture stay aligned.

## Important Launch State

The paid flow is connected in Stripe sandbox mode and must be moved to live
Stripe credentials before charging customers:

- `FULL_PREVIEW_FOR_TESTERS` is temporarily `true` in `app/booklet-preview.ts`;
  testers can inspect the complete generated edition before purchase. Restore
  the three-page paywall before a public paid launch.
- Hosted `TRIPQUEST_PDF_TEST_MODE` is `false`; the customer PDF button no longer
  falls back to a free download when checkout is unavailable.
- Stripe Checkout, signed webhooks, D1 purchase entitlements, and paid PDF
  delivery are connected with test credentials. Test transactions do not move
  real money.
- Going live still requires a live Stripe product/price, live restricted secret
  key, and live webhook signing secret in production.
- There is no native iOS application yet. The current product is a responsive
  web application that can later support an iOS client.

## Architecture

- UI: React 19, Next 16 APIs, vinext, Vite, and Cloudflare Workers-compatible
  output.
- Styling: `app/globals.css`.
- Icons: Lucide React.
- PDF engine: `pdf-lib`; PDFs are built deterministically without another LLM
  request. Illustration selection uses semantic landmark matching plus the day
  theme, not random scene assignment.
- Database: Cloudflare D1, exposed to the app as `DB`.
- Object storage: Cloudflare R2, exposed as `BOOKLET_FILES`.
- Hosting: OpenAI Sites with the custom domain `tripquestkids.com`.
- Node requirement: 22.13 or later.

## AI Generation

- API provider: Moonshot/Kimi at `https://api.moonshot.ai/v1`.
- Destination research model: `kimi-k3` by default.
- Booklet composer model: `kimi-k2.6` by default.
- Research uses web search and asks for source-backed landmarks, culture,
  transport, food, nature, etiquette, and itinerary verification.
- Composition returns structured JSON and is validated before storage.
- Composition now returns landmark naming fields and the five daily slots.
  Facts are kept only when there are exactly three concrete facts under 15
  words; otherwise the fact card is omitted instead of inventing filler.
- Composition returns an `interestHook` only on scheduled interest days and a
  `siblingMission` for each day. Both appear in the web preview and on the
  first printable activity page of each day.
- The application, not the model, renders puzzles and PDF layouts.
- Coloring and drawing activities use curated landmark PNGs when available.
  Other exact landmarks are generated once with the OpenAI image API, stored
  in R2, and referenced by both preview and PDF so the artwork cannot drift.
- Booklets over three days are composed in three-day batches, each checkpointed
  to R2 independently so a retry can reuse already-valid batches.
- Exact age rules, interest assignments, allowed game types, title uniqueness,
  and crossword connectivity are validated. A specific game type is still
  pre-assigned per activity and sent to Kimi as guidance for variety and
  pacing, but is no longer enforced exactly: Kimi frequently substituted an
  equally age-appropriate type (for example bingo for coloring), which failed
  the whole batch outright. Day-to-day variety is now a hint, not a guarantee.

Relevant environment variable names are documented in `.env.example`:

- `MOONSHOT_API_KEY`
- `KIMI_RESEARCH_MODEL`
- `KIMI_COMPOSER_MODEL`
- `OPENAI_API_KEY`
- `OPENAI_IMAGE_MODEL`
- `TRIPQUEST_OWNER_EMAIL`

Never add real values to this document or commit `.env.local`.

## Storage And Caching

D1 tables:

- `destination_research_cache`
- `booklet_cache`
- `generation_locks`
- `generation_rate_limits`
- `family_workspaces`

R2 stores generated booklet JSON, PDF files, and immutable landmark artwork.
D1 stores metadata and R2 object keys.

- Destination research is retained for 30 days.
- Generated booklets are retained for 180 days.
- The exact booklet cache key includes destination, age, days, itinerary,
  models, the complete normalized family snapshot, and normalized itinerary
  events. Names affect the frozen edition identity but remain excluded from the
  Kimi prompt.
- Every generated edition has a stable content fingerprint and an immutable R2
  JSON snapshot. Checkout pins that artifact key and fingerprint in both D1 and
  Stripe metadata, and paid PDF reuse verifies the fingerprint. A later cache
  refresh therefore cannot change the edition a customer purchased. Legacy
  mutable booklet objects are promoted to immutable snapshots when first read.
- Checkout requires the generated edition fingerprint. PDF delivery rejects a
  missing or mismatched modern artifact instead of silently substituting a
  newly cached booklet; failed entitlement webhook matches return a retryable
  response to Stripe.
- Current cache versions are defined in `app/booklet-storage.ts`.
- PDF requests reuse the stored booklet and reuse a stored PDF when available.
- Family profiles use an anonymous browser-scoped family identifier and D1; a
  child name is not sent in the Kimi family prompt.
- The current family workspace is one D1 JSON record keyed by the secure
  `tripquest_family_id` cookie. It stores child profile fields only; it does
  not yet store child photos or a persistent trip roadmap.
- The planned photo/roadmap model is: D1 rows for family, children, trips, and
  normalized itinerary events; private R2 objects for original photos and
  generated PDFs; D1 stores only object keys, metadata, hashes, and retention
  timestamps. Photos must be served through short-lived signed access, never a
  public R2 URL, and excluded from shared booklet cache keys except for a photo
  version/hash. Without email, the family can be recovered only on the same
  browser/device unless a parent downloads an optional recovery code.

## Reliability And Safety

- Same-origin checks protect write APIs.
- JSON size, type, destination, age, and trip-length validation are enforced.
- Generation rate limits are 8 new generations per client per hour and 120
  globally per hour.
- At most four generation jobs run concurrently in one worker instance.
- D1 locks prevent duplicate work for the same cache key.
- Generation progress is streamed to the browser, and interrupted clients can
  reconnect to in-progress or saved work.
- Composition is checkpointed per day-batch to R2 (`booklet-batches/`), and the
  browser persists the in-flight request to `localStorage`. A suspended tab,
  a dropped connection, or a full page reload automatically resumes the same
  request instead of restarting generation from scratch; the server rejoins
  the existing job/lock or replays only the batches that were not yet saved.
- A whole-booklet QA failure that survives per-batch validation (for example a
  word-budget or duplicate-card rule that only makes sense once all days are
  assembled) invalidates and recomposes only the implicated day's batch
  instead of failing the entire edition.
- Destination and itinerary corrections are surfaced to the parent instead of
  silently inventing a place.
- Child names are used for the local family pack but excluded from AI prompts.

## Tests And Development Commands

Run before publishing:

```bash
npm test
npm run lint
git diff --check
```

`npm test` performs a production build and runs the automated test suite. At
this checkpoint there are 58 passing tests covering age behavior, destination
variation, game validation, puzzles, landmark-aware illustration selection,
family profiles, streaming, exact paid-edition delivery, legacy storage
migration, payments, security, D1/R2 storage, and PDF generation.

Other useful commands:

```bash
npm run dev
npm run pdf:sample
npm run benchmark:20
npm run uat:parent-50
npm run uat:aggregate
npm run db:generate
```

Use saved fixtures for routine UI and PDF development. Use live Kimi calls only
for prompt-quality checks, selected destination smoke tests, and release UAT.

## Key Files

- `app/page.tsx`: primary parent workflow and booklet preview.
- `app/globals.css`: responsive application and printable-preview styling.
- `app/api/generate/route.ts`: Kimi research, composition, streaming, caching,
  locking, and rate limits.
- `app/api/pdf/route.ts`: stored booklet lookup and PDF delivery.
- `app/api/family/route.ts`: anonymous family profile API.
- `app/family.ts`: family normalization, itinerary parsing, interest plans, and
  quest-mechanic planning.
- `app/booklet-ai.ts`: generated-data schema, age-safe game plans, and content
  validation.
- `app/booklet-pdf.ts`: A4 family-pack PDF generation.
- `app/illustration-ai.ts`: exact-landmark image generation and R2 reuse.
- `app/api/illustration/route.ts`: immutable generated artwork delivery.
- `app/puzzles.ts`: deterministic crossword, word-search, maze, and route logic.
- `app/booklet-storage.ts`: D1/R2 cache keys and persistence.
- `db/schema.ts`: D1 schema.
- `drizzle/`: deployment migrations.
- `scripts/benchmark-booklets.ts`: live destination and age UAT runner.
- `tests/`: automated test suite and saved booklet fixture.
- `.openai/hosting.json`: Sites project and logical D1/R2 bindings.

## Known Gaps

- A live one-day diagnostic on 2026-09-21 measured about 96 seconds for fresh
  Kimi web research. Fresh destinations can still exceed a minute; connection
  survival across that wait is now handled (see Reliability And Safety), but
  the wait itself is not shortened.
- Live diagnostics (London and Barcelona, age 5, 2026-09-21) surfaced a real
  reliability gap beyond connection loss: composition can still fail outright
  when Kimi's output repeatedly violates a rule inside one 3-day batch. Each
  batch already gets one correction attempt inside `composeBookletBatch`, but
  when both attempts fail the whole request fails, even though the other
  batch(es) already composed validly. Restoring a checkpointed batch also
  re-runs its per-batch validation, so a batch that was valid when saved but
  fails re-validation falls through to a full (costly) fresh recompose rather
  than a targeted fix. Single-activity repair instead of whole-batch retry
  would reduce both the cost and the odds of a full failure.
  - The exact pre-assigned game type per activity was the most common trigger
    and is fixed (2026-09-21): only age-appropriateness is enforced now, not
    an exact match to the pre-built schedule.
  - A whole-booklet QA failure (word budget, duplicate card, etc.) after every
    batch validates on its own terms is now repaired by recomposing just the
    implicated day's batch, but only once; the same live Barcelona diagnostic
    still failed outright when the repaired batch exceeded the age-5 word
    budget again on its one retry.
  - Investigated with the actual failing content (2026-09-21): the ages-3-6
    word budget (60 words for 5-6, 40 for 3-4, in `readerBandForAge`) sums
    body + prompt + all 4 required game items, which leaves little headroom
    once 4 genuine item clues are included. `wordCount` also counted a
    standalone em dash as its own word; that is now fixed. The fix alone did
    not close the live Barcelona failure — the same page was still 3 real
    words over budget after removing the inflated count. Raising the 3-6
    page-word ceilings, or excluding item text from the page total, was
    proposed and intentionally not done yet.
- Stripe remains in sandbox mode. Live product/price, live credentials, account
  activation, payouts, receipts, refunds, and purchase restoration still need a
  launch pass.
- Kimi token usage and cost are not yet written to D1 per request.
- Destination research cache keys include the itinerary, limiting reuse when
  two families visit the same city with different plans.
- Family profiles are browser-scoped rather than account-synced.
- Child photo uploads and photo-in-booklet placement are intentionally not
  implemented yet; see the product plan in the development handoff for the
  required consent, private storage, moderation, deletion, and PDF design work.
- `scripts/create-photo-sample.py` creates a one-page sample cover with a
  fictional illustrated child; it is a design proof, not a production upload
  path.
- Daily feedback and next-day adaptation are not implemented.
- A native iOS shell, App Store purchase flow, privacy disclosures, and App
  Store submission assets are not implemented.

## Recommended Next Priorities

1. Repair a single invalid activity instead of retrying a whole 3-day
   composition batch, and skip re-validating a checkpointed batch that was
   already accepted once (see Known Gaps: London/age-5 diagnostic).
2. Record Kimi input tokens, output tokens, retries, duration, model, and
   estimated cost in D1.
3. Generate a limited high-quality preview before purchase and generate the
   remaining days only after entitlement verification.
4. Complete Stripe live-mode activation and run one real low-value purchase,
   webhook, PDF-delivery, refund, and payout verification.
5. Separate reusable destination research from custom-itinerary research.
6. Run a smaller live release matrix before the full 20- or 50-scenario UAT.
7. Plan the iOS client after the paid web flow, profiles, and privacy model are
   stable.

## Source Control And Recovery

- Primary branch: `main`.
- Rollback tag before the family-pack work:
  `tripquest-v1-before-family-pack`.
- Do not commit secrets, generated credentials, or customer data.
- Preserve existing user changes in a dirty worktree.
- Build and test before publishing through Sites.

## Starting A Fresh Codex Task

Use this prompt:

> Read `PROJECT_STATUS.md` and inspect the relevant current files. Continue
> TripQuest with this objective: [one focused objective]. Preserve existing
> behavior, run the relevant tests, and publish only after validation.

Keep one major objective per task. Update this file when the completed work
changes architecture, launch state, models, storage, tests, or priorities.
