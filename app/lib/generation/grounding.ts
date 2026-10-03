// A second, independent model call that checks the composer's own output
// against the research it was supposed to be grounded in. The composer
// prompt already asks for research-backed claims, but it can still invent a
// specific physical/sensory detail (a shape, a color, a texture) to satisfy
// a "name the exact thing" instruction when the research doesn't actually
// support one — for example inventing that Singapore's national orchid is
// "spiky" because a whileYouWait target needed some countable physical
// feature. This only flags concrete factual/physical claims, never
// open-ended prompts or drawing invitations.
//
// A live test run (Penang, age 7) confirmed the checker works — it caught
// two real unsupported claims — but also showed a real risk: if the checker
// is wired as a hard retry-or-fail gate, the model can genuinely exhaust the
// retry budget without ever fully satisfying it, failing the whole booklet
// generation. That is a worse outcome than one imperfect claim, so the
// caller (composeBookletBatch in app/api/generate/route.ts) retries with a
// targeted correction for its earlier attempts, then on the final attempt
// calls sanitizeUngroundedClaims to locally neutralize just the flagged
// fields instead of failing — the same "never let a quality nice-to-have
// block a booklet" philosophy already used for whileYouWait's gameType/items.
//
// Kept in its own module, separate from app/api/generate/route.ts, so it can
// be imported by tests under Node's --experimental-strip-types runner —
// route.ts itself uses a TypeScript parameter-property constructor
// elsewhere, which that strip-only mode cannot parse. Only type-only imports
// are taken from booklet-ai.ts/booklet.ts, which are erased at strip time.

import type { BookletDraft } from "./booklet-ai.ts";
import { claudeJson, type ClaudeOptions } from "./claude.ts";

export type GroundingResearch = { notes: string };

export type GroundingFinding = { day: number; field: string; issue: string };

// Returns the claims that are not supported by the research, or an empty
// array when everything checks out or the checker itself could not run
// (fails open — a broken checker must never block a booklet on its own).
export async function checkGroundedClaims(
  draft: BookletDraft,
  research: GroundingResearch,
  claude: ClaudeOptions,
  // Days compose one request at a time, each numbered from 1; the offset
  // restores the trip's real day numbers so the checker does not match a
  // day-3 claim against the research for day 1. Findings come back
  // renumbered the same way the draft is.
  dayOffset = 0,
): Promise<GroundingFinding[]> {
  const claims = draft.dayPlans.flatMap((day) => {
    const reveal = day.slots.questReveal;
    const tripDay = day.day + dayOffset;
    const place = day.landmark?.place || day.theme;
    const entries: { day: number; place: string; field: string; text: string }[] = [];
    if (reveal?.targetLabel) entries.push({ day: tripDay, place, field: "questReveal.targetLabel", text: reveal.targetLabel });
    if (reveal?.bonusQuest) entries.push({ day: tripDay, place, field: "questReveal.bonusQuest", text: reveal.bonusQuest });
    if (reveal?.revealText) entries.push({ day: tripDay, place, field: "questReveal.revealText", text: reveal.revealText });
    day.slots.factCard.forEach((fact, index) => {
      if (fact) entries.push({ day: tripDay, place, field: `factCard[${index}]`, text: fact });
    });
    return entries;
  });
  if (!claims.length) return [];

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            day: { type: "integer" },
            field: { type: "string" },
            issue: { type: "string" },
          },
          required: ["day", "field", "issue"],
        },
      },
    },
    required: ["findings"],
  };

  try {
    const parsed = await claudeJson<{ findings?: GroundingFinding[] }>({
      ...claude,
      label: "the fact check",
      maxTokens: 6_000,
      timeoutMs: 60_000,
      system:
        "You are a careful fact-checker for a children's travel booklet. Only flag a claim that asserts a specific, checkable fact or physical/sensory detail (an appearance, a name, a count, a species, a material, a location) that the research text does not support or directly contradicts. Never flag generic description, a drawing or imagination prompt, an open-ended question, or a claim the research is simply silent about in a way that doesn't contradict it.",
      user: `RESEARCH:\n${research.notes}\n\nCLAIMS TO CHECK (JSON array of {day, place, field, text}; each claim is about its own place):\n${JSON.stringify(claims)}\n\nReturn only the claims that are NOT grounded in the research above, each with a short reason. Return an empty findings array if every claim is fine.`,
      schema,
    });
    return Array.isArray(parsed.findings)
      ? parsed.findings.map((finding) => ({ ...finding, day: finding.day - dayOffset }))
      : [];
  } catch (error) {
    console.error("[TripQuest grounding check]", error instanceof Error ? error.message : error);
    return [];
  }
}

export function groundingCorrectionMessage(findings: GroundingFinding[]) {
  return `These claims are not supported by the research: ${findings
    .map((finding) => `Day ${finding.day} ${finding.field} ("${finding.issue}")`)
    .join("; ")}. Rewrite them using only details stated in the research, or with a generic description that makes no unsupported specific claim.`;
}

// A last-resort, purely local fix (no further model calls) for whichever
// claims are still ungrounded after the correction attempts are exhausted:
// generalize each flagged field just enough that it no longer asserts
// anything unsupported, without dropping the reveal page's structure (the
// PDF and web preview only show the mystery/reveal pages at all when
// targetLabel is present) or leaving factCard at an odd 1-or-2-fact count
// (the composer prompt's own rule is "exactly three facts or zero").
export function sanitizeUngroundedClaims(
  draft: BookletDraft,
  findings: GroundingFinding[],
): BookletDraft {
  const fieldsByDay = new Map<number, Set<string>>();
  for (const finding of findings) {
    const fields = fieldsByDay.get(finding.day) ?? new Set<string>();
    fields.add(finding.field);
    fieldsByDay.set(finding.day, fields);
  }

  return {
    ...draft,
    dayPlans: draft.dayPlans.map((day) => {
      const fields = fieldsByDay.get(day.day);
      if (!fields) return day;

      const reveal = day.slots.questReveal;
      const clearFactCard = [...fields].some((field) => field.startsWith("factCard["));
      const trustedTarget = !fields.has("questReveal.targetLabel") && reveal?.targetLabel?.trim()
        ? reveal.targetLabel.trim().toLocaleLowerCase()
        : undefined;

      return {
        ...day,
        slots: {
          ...day.slots,
          factCard: clearFactCard ? [] : day.slots.factCard,
          ...(reveal
            ? {
                questReveal: {
                  ...reveal,
                  ...(fields.has("questReveal.targetLabel") ? { targetLabel: "SOMETHING SPECIAL" } : {}),
                  ...(fields.has("questReveal.bonusQuest")
                    ? { bonusQuest: "Take a closer look and describe what you notice!" }
                    : {}),
                  ...(fields.has("questReveal.revealText")
                    ? {
                        revealText: trustedTarget
                          ? `You found the ${trustedTarget}! Look closely: what makes it special here?`
                          : "Great spotting! Tell a grown-up what you noticed and where you found it.",
                      }
                    : {}),
                },
              }
            : {}),
        },
      };
    }),
  };
}
