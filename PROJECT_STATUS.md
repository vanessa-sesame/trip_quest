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
- Every generated day follows one shared architecture: a short adult briefing,
  a queue activity, an in-place observation game, a second in-place game
  (optional; present on every freshly generated booklet, absent on editions
  generated before 2026-09-21), a sit-down page, and an optional three-fact
  card. The two in-place games render as two smaller games sharing one
  physical page rather than each getting a full page, in both the PDF and the
  web preview; this keeps the printable page count at 3 pages per day
  (unchanged) instead of adding a page. The pair always stacks top/bottom,
  full width (side-by-side columns were tried and removed, 2026-09-22 — the
  original ask was never to squeeze two games into narrow columns). Preview
  and PDF page order come from the same manifest, so the purchased file
  matches the edition shown on screen.
- A coloring/drawing activity's curated fallback picture is deduplicated
  within one booklet: if a second day's activity would land on the same
  scene as an earlier day's (matched by `app/lib/booklet/coloring.ts`'s keyword system),
  it does not embed that picture a second time — it falls back to the
  abstract vector scene instead, so no two days show the literal same
  image. This is deterministic (`app/lib/pdf/document.ts`'s `usedCuratedPaths`),
  not a retry/regeneration mechanism — see Known Gaps for why a QA-and-retry
  approach was considered and rejected for this specific problem.
- Word search clues (each word's meaning or the local fact that makes it the
  answer) are shown next to every word in the word bank, not just a couple on
  a separate strip.
- The parent guide page explains how to use the booklet — what to bring, the
  daily rhythm, and why it is worth the parent's time — alongside the
  existing local-word and etiquette cards and day-by-day overview.
- The queue page's family-relay/interest content (previously only visible on
  one summary page near the back of the booklet, where it could also get
  truncated) now also appears directly on the day's first activity page.
  Composition additionally asks Kimi to give the queue activity a real
  compact game instead of a plain counting instruction, but this is not
  reliable; see Known Gaps.
- The queue page can carry a two-page "secret target" mystery: a badge
  naming a specific spottable thing (a shape, colour, object, sound, or
  person) plus an optional bonus quest on the queue page itself, and — only
  once the family has arrived — a second "Found It!" page confirming what it
  really was, with two chat-about-it discussion prompts, a quest-complete
  badge, and a space to draw or stick a photo. One booklet-wide real photo
  (not the usual coloring-book line art) is generated for whichever day gets
  the reveal, when the AI provider has capacity; every other day's reveal
  page is text-only. This is fully optional/additive: the reveal page only
  appears on a day Kimi actually returns it for, so older editions and any
  generation Kimi doesn't comply on keep today's plain queue page and page
  count, unchanged. See Known Gaps for the live-tested compliance history —
  moving the target/bonus-quest fields to live alongside the reveal text,
  rather than on the queue object, measurably fixed compliance in same-day
  live testing (0/4 before, 2/2 after on those specific fields).
- Landmark content stores separate display, short, and place names. Display
  names are reserved for headers and cannot leak into awkward sentences.
- Composition prompts still ask for age-appropriate instruction and page
  length (short for ages 3-6, longer for older readers), but this is
  guidance, not an enforced ceiling; see Known Gaps for why the ceiling was
  removed (2026-09-21).
- Pre-export QA rejects missing required queue pages, fake in-place games,
  repeated facts or cut-out cards, family-role/roster mismatches, and
  surviving blank-name placeholders.
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

- `FULL_PREVIEW_FOR_TESTERS` is temporarily `true` in `app/lib/booklet/preview.ts`;
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
- Composition now returns landmark naming fields and the daily slots,
  including a second in-place activity (`inThePlaceSecond`) and, when Kimi
  complies, a real game on the queue slot instead of a plain counting
  instruction. Both are optional at the validation layer so older
  cached/purchased editions (generated before 2026-09-21) keep rendering with
  their original two-activity shape. Facts are kept only when there are
  exactly three concrete facts under 15 words; otherwise the fact card is
  omitted instead of inventing filler.
- The second in-place game and the queue game are restricted by two lists in
  `app/lib/booklet/booklet.ts`: `pairEligibleGameTypes` (everything except `map_puzzle`
  and `coloring`) for `inThePlaceSecond`, and `queueEligibleGameTypes`
  (everything except `map_puzzle`) for the queue slot's optional bonus game.
  `map_puzzle` stays excluded from both because it shares a once-per-booklet
  dedupe counter with `inThePlace`/`sitDown` that is already scarce.
  `inThePlace` itself is not restricted and can still be assigned coloring,
  which needs the full page for its illustration; when it is, the second
  in-place game is not shown that day rather than forcing it into a broken
  half-page layout.
- Superseded 2026-09-26: the booklet is now A5 and every game has its own
  page (queue game, both in-place games, sit-down), so games are never
  paired or stacked on one page.
- Word-search clues are now shown next to every word, not just the two
  surfaced in the fixed "LOCAL CLUES" strip: `drawWordSearch` (PDF) and
  `WordSearchBoard` (`app/components/activity-game.tsx`, web) both render a clue line
  under each word bank entry. The lookup is by normalized word, not array
  index, because `createWordSearch` (`app/lib/booklet/puzzles.ts`) dedupes/reorders
  labels and `puzzle.words[i]` is not guaranteed to match `activity.items[i]`
  positionally. The prompt now explicitly asks for the plain-English meaning
  when a word-search/crossword label is a transliterated local word.
- The queue instruction text has a hard floor independent of whether Kimi
  includes the optional bonus game (see the gap below): the prompt requires
  the `instruction` field alone to name a concrete physical thing to count
  ("Count the pointed rooftops...") rather than a vague placeholder. The
  offline fallback in `buildDaySlots` was updated to match this bar.
- The parent guide page (PDF page 2, and page 1 of the web preview) has an
  expanded "how to use this booklet" section: what to bring, the day
  structure in parent language, and one persuasive line — sized in the PDF
  against the 14-day worst case, since the day-overview list above it uses a
  fixed-height band regardless of trip length.
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
- `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` (Workers AI REST: images and
  spot-the-difference edits)
- `CLOUDFLARE_AI_EDIT_MODEL` (optional; defaults to
  `@cf/black-forest-labs/flux-2-klein-4b`, about 31 neurons per 512 px edit;
  klein-9b costs about 45x more)

Spot-the-difference pictures (`app/lib/generation/spot-difference.ts`): picture
A is generated line art; picture B is A plus three changes placed in A's
emptiest regions. FLUX.2 klein adds one object per region, and only the strokes
it added are copied into B, so B matches A everywhere else. A region the model
cannot change cleanly after two tries gets a drawn doodle (star, balloon, sun).
At most two games per booklet get pictures; the rest, and any game whose
pictures fail, play as look-and-find. Both pictures are cached in R2, with the
regions in picture B's metadata, and the answer notes name each change.

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
- Current cache versions are defined in `app/lib/storage/booklet-storage.ts`.
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
- `app/lib/family.ts`: family normalization, itinerary parsing, interest plans, and
  quest-mechanic planning.
- `app/lib/generation/booklet-ai.ts`: generated-data schema, age-safe game plans, and content
  validation.
- `app/lib/pdf/`: A5 booklet and family-pack PDF generation (see README "Project layout").
- `app/lib/generation/illustration-ai.ts`: exact-landmark image generation and R2 reuse.
- `app/api/illustration/route.ts`: immutable generated artwork delivery.
- `app/lib/booklet/puzzles.ts`: deterministic crossword, word-search, maze, and route logic.
- `app/lib/storage/booklet-storage.ts`: D1/R2 cache keys and persistence.
- `db/schema.ts`: D1 schema.
- `drizzle/`: deployment migrations.
- `scripts/benchmark-booklets.ts`: live destination and age UAT runner.
- `tests/`: automated test suite and saved booklet fixture.
- `.openai/hosting.json`: Sites project and logical D1/R2 bindings.

## Known Gaps

- Spot-the-difference edits run on Cloudflare Workers AI. On the free plan
  the daily allowance is 10,000 neurons; the 2026-09-26 spike (about 30
  FLUX.2 calls at 1024 px) used all of it. Production edits run at 512 px,
  but a busy day on the free plan will run out, after which new games fall
  back to look-and-find until the allowance resets (00:00 UTC). The OpenAI
  image account had no credits on the same day, so OpenAI edits are untested.

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
  - The batch correction budget was raised from one attempt to two (three
    Kimi tries total per batch), and the browser now retries once
    automatically on a hard content failure, not just a dropped connection,
    since a retry now only recomposes the batch that failed rather than the
    whole trip. A live two-day Rome, age-5 diagnostic (2026-09-21) still
    failed after all of it: the whole-booklet age-5 word budget was violated
    four separate times in a row (two client-level attempts, one server-side
    repair each) before giving up. Retrying more is not closing this
    specific gap; the budget itself is still the most likely lever.
  - The age-band page/instruction word budget (`readerBandForAge`,
    `assertAgeBudget`) is removed (2026-09-21) rather than raised, given the
    live evidence above: two different sub-checks (the per-instruction cap
    and the whole-page cap) each independently caused a full-batch failure
    on otherwise good, age-appropriate content, and more retries did not
    reliably clear it. Composition prompts still ask Kimi to keep
    instructions age-appropriately short; nothing now rejects the output if
    it runs a little long. If pages start reading as genuinely too dense for
    the youngest ages, reintroduce a budget sized around real generated
    content (the two live diagnostics ran ~60-65 words per activity) rather
    than the original estimate.
- The queue page's real game (`whileYouWait.gameType`/`.items`, added
  2026-09-21) is requested in both the JSON schema (marked required, nested
  under a `game` sub-object specifically to rule out a schema naming
  collision as the cause) and the prompt, but Kimi does not reliably return
  it — confirmed live, 4/4 fresh generations, including one where composition
  explicitly retried after a targeted correction message and still omitted
  it. Enforcing it as a hard requirement was tried and reverted: it burned
  the full correction budget and then failed the whole request, which is
  worse than the soft fallback. It stays optional at validation; when absent
  the queue page shows its original plain counting instruction. The second
  in-place game (`inThePlaceSecond`) does not have this problem — Kimi
  included it in every live test (6/6) — the difference appears to be
  specific to adding fields to an existing nested schema object rather than
  a new one, though this is not fully confirmed. Since the bonus game stays
  unreliable, the prompt (2026-09-22) now splits it from a second,
  always-required ask: the plain `instruction` text alone must name a
  concrete physical thing to count, independent of whether the bonus game
  ever shows up, so the common (gameless) case still reads as a real prompt
  rather than a vague placeholder.
- The queue mystery/reveal pair (`questReveal`, added 2026-09-22) went
  through two live-tested schema shapes in one day, and the difference
  between them is now good evidence for the flat-field/new-top-level-object
  compliance theory first raised by the earlier queue-game gap above. First
  shape: `targetLabel`/`targetKind`/`bonusQuest` as flat fields added to the
  existing `whileYouWait` object, alongside a new top-level `questReveal`
  (`revealText`/`chatPrompts` only). Live result: `questReveal` came through
  in every successful generation tested (Cairo age 6, Seoul age 10 — 2/2),
  while the three fields added to `whileYouWait` never did (0/4, also Rome
  age 7 and Kyoto age 7). Second shape (still 2026-09-22, same day): moved
  `targetLabel`/`targetKind`/`bonusQuest` into `questReveal` itself, so they
  live in the object that was actually complying rather than the one that
  wasn't. Live result after the move: 2/2 (Lisbon age 8: "STONE RHINO";
  Vancouver age 9: "RAVEN BEAK") — all five fields present with good
  content, including `bonusQuest`. Small sample, but a clean before/after
  on the same object shape is stronger evidence than either round alone.
  The reveal page itself no longer requires `targetLabel` to render (only
  `questReveal`, which reliably carries `revealText`/`chatPrompts`) — the
  queue page's target badge is a separate, independent enhancement gated on
  `targetLabel` specifically. The whole pair stays optional at validation;
  editions where Kimi drops it still render today's plain queue page. The
  one-photo-per-booklet reveal image (`app/lib/generation/illustration-ai.ts`'s
  `addRevealPhoto`) is gated on `questReveal.targetLabel` (needs a concrete
  subject to depict) and never attempts generation without it, so it adds
  no cost/latency when absent.
- Curated coloring/drawing fallback art (`app/lib/booklet/coloring.ts`'s ~28 scenes) had
  a recurring bug class, found live three times in one session (2026-09-22):
  a scene's curated image depicts one specific real place or culture
  (Marina Bay Sands for "skyline"; a Southeast/East Asian temple-guardian
  lion for "guardian"; a Peranakan tile motif for "tile"), but its keyword
  match list included bare generic category words ("city"/"building",
  "statue"/"sculpture", "mosaic"/"ceramic"/"tile") that fire for unrelated
  content from anywhere in the world. Fixed for these three (skyline lost
  its curated image entirely — the abstract vector fallback is honestly
  generic where no real generic-city photo exists; guardian/tile were
  narrowed to their actually-specific keywords). Not exhaustively re-audited
  across all ~28 scenes; the pattern to watch for is documented in a
  comment above `coloringSceneFor` in `app/lib/booklet/coloring.ts`. A *dynamic*
  "ask Kimi if this image is relevant" check was considered and rejected —
  it would need a new AI call and reintroduces the same retry-failure risk
  as the item below, for a problem that is 100% a consequence of our own
  keyword list and has nothing to do with Kimi's output.
- A "repeated activity instructions" QA check (flag two days sharing
  near-identical activity body text) was built, tested, and reverted the
  same day (2026-09-22): it false-positived on `buildBooklet`'s own offline
  fallback generator, which intentionally reuses fixed template body text
  ("Draw one real shape from this place...") across multiple open days at
  young ages when no specific landmark is available — a legitimate,
  by-design pattern, not a defect. Distinguishing "the same landmark
  reasonably produces similar instructions" from "a real accidental repeat"
  would need more than a text-equality check, and shipping the naive
  version risked failing real generations for content that was actually
  fine — the same class of mistake as the `whileYouWait.gameType` hard-
  enforcement above. Repeated *pictures* did ship (see above) because that
  one is fully deterministic and never risks failing a generation; repeated
  *text* would need a smarter check before it's safe to add.
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
