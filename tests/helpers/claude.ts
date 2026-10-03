// Fakes for the Claude Messages API in tests that replace global fetch.

// Which booklet call a request is, from its system prompt (or an image).
export function claudeKind(init?: RequestInit) {
  const body = JSON.parse(String(init?.body ?? "{}")) as { system?: string; messages?: Array<{ content: unknown }> };
  const system = body.system ?? "";
  if (JSON.stringify(body.messages ?? []).includes('"type":"image"')) return "picture_check";
  if (system.includes("fact-checker")) return "grounding_check";
  if (system.includes("You repair single games")) return "tripquest_repair";
  if (system.includes("You fix facts")) return "tripquest_reveal_fix";
  if (system.includes("photo captions")) return "tripquest_photo_shortlist";
  if (system.includes("You plan children's travel booklets")) return "tripquest_day_plan";
  if (system.includes("travel-book editor")) return "tripquest_booklet";
  return "unknown";
}

// The user prompt of a request (a plain string in every booklet call).
export function claudeUserText(init?: RequestInit) {
  const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ content: unknown }> };
  const content = body.messages?.[0]?.content;
  return typeof content === "string" ? content : JSON.stringify(content);
}

// A finished message whose text is `content` (JSON-encoded unless a string).
export function claudeResponse(content: unknown) {
  return Response.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content) }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  });
}
