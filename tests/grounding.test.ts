import assert from "node:assert/strict";
import test from "node:test";
import {
  checkGroundedClaims,
  groundingCorrectionMessage,
  sanitizeUngroundedClaims,
  type GroundingResearch,
} from "../app/lib/generation/grounding.ts";
import { buildBooklet } from "../app/lib/booklet/booklet.ts";
import type { BookletDraft } from "../app/lib/generation/booklet-ai.ts";

function draftWithClaim(text: string): BookletDraft {
  const dayPlans = buildBooklet(7, "Singapore", 1);
  dayPlans[0].slots.questReveal = {
    ...dayPlans[0].slots.questReveal!,
    targetLabel: "SPIKY BALL",
    bonusQuest: "Count the spiky balls!",
    revealText: text,
  };
  return { profile: { style: "", intro: "", word: "", etiquette: "" }, dayPlans };
}

const research: GroundingResearch = {
  notes: "Gardens by the Bay's Supertree Grove features vertical gardens on tall concrete structures. Singapore's national flower is the orchid Vanda Miss Joaquim, a delicate purple and white hybrid.",
};

test("an ungrounded claim is returned as a finding", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              findings: [
                {
                  day: 1,
                  field: "questReveal.revealText",
                  issue: "the research describes the orchid as delicate, not spiky",
                },
              ],
            }),
          },
        },
      ],
    });
  try {
    const findings = await checkGroundedClaims(
      draftWithClaim("The purple spiky flower is Singapore's national orchid!"),
      research,
      "test-key",
      "kimi-k2.6",
      { thinking: { type: "disabled" } },
    );
    assert.equal(findings.length, 1);
    assert.equal(findings[0].field, "questReveal.revealText");
    assert.match(groundingCorrectionMessage(findings), /Day 1 questReveal\.revealText.*spiky/s);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a grounded claim returns no findings", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ choices: [{ message: { content: JSON.stringify({ findings: [] }) } }] });
  try {
    const findings = await checkGroundedClaims(
      draftWithClaim("The purple orchid is Singapore's national flower, Vanda Miss Joaquim!"),
      research,
      "test-key",
      "kimi-k2.6",
      { thinking: { type: "disabled" } },
    );
    assert.deepEqual(findings, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a failed grounding check fails open with no findings", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("service unavailable", { status: 503 });
  try {
    const findings = await checkGroundedClaims(
      draftWithClaim("Any claim at all."),
      research,
      "test-key",
      "kimi-k2.6",
      { thinking: { type: "disabled" } },
    );
    assert.deepEqual(findings, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no fetch call is made when there are no checkable claims", async () => {
  const dayPlans = buildBooklet(7, "Singapore", 1);
  delete dayPlans[0].slots.questReveal;
  dayPlans[0].slots.factCard = [];
  const draft: BookletDraft = { profile: { style: "", intro: "", word: "", etiquette: "" }, dayPlans };

  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ findings: [] }) } }] });
  };
  try {
    const findings = await checkGroundedClaims(draft, research, "test-key", "kimi-k2.6", { thinking: { type: "disabled" } });
    assert.deepEqual(findings, []);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sanitizing an ungrounded reveal keeps the reveal page but removes the specific claim", () => {
  const draft = draftWithClaim("The purple spiky flower is Singapore's national orchid!");
  const sanitized = sanitizeUngroundedClaims(draft, [
    { day: 1, field: "questReveal.targetLabel", issue: "not spiky" },
    { day: 1, field: "questReveal.revealText", issue: "not spiky" },
  ]);
  const reveal = sanitized.dayPlans[0].slots.questReveal!;
  assert.equal(reveal.targetLabel, "SOMETHING SPECIAL");
  assert.doesNotMatch(reveal.revealText, /spiky/i);
  // bonusQuest was not flagged, so it survives untouched.
  assert.equal(reveal.bonusQuest, "Count the spiky balls!");
});

test("sanitizing an ungrounded fact clears the whole factCard, not just one entry", () => {
  const dayPlans = buildBooklet(7, "Singapore", 1);
  dayPlans[0].slots.factCard = ["Fact one.", "Fact two.", "Fact three."];
  const draft: BookletDraft = { profile: { style: "", intro: "", word: "", etiquette: "" }, dayPlans };
  const sanitized = sanitizeUngroundedClaims(draft, [
    { day: 1, field: "factCard[1]", issue: "unsupported" },
  ]);
  assert.deepEqual(sanitized.dayPlans[0].slots.factCard, []);
});

test("sanitizing leaves other days untouched", () => {
  const dayPlans = buildBooklet(7, "Singapore", 2);
  const draft: BookletDraft = { profile: { style: "", intro: "", word: "", etiquette: "" }, dayPlans };
  const sanitized = sanitizeUngroundedClaims(draft, [
    { day: 1, field: "questReveal.revealText", issue: "unsupported" },
  ]);
  assert.deepEqual(sanitized.dayPlans[1], draft.dayPlans[1]);
});

test("a neutralized reveal still names the target when the target itself was fine", () => {
  const draft = draftWithClaim("The purple spiky flower is Singapore's national orchid!");
  const sanitized = sanitizeUngroundedClaims(draft, [
    { day: 1, field: "questReveal.revealText", issue: "not spiky" },
  ]);
  assert.equal(
    sanitized.dayPlans[0].slots.questReveal!.revealText,
    "You found the spiky ball! Look closely: what makes it special here?",
  );
});
