export class HttpRequestError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "HttpRequestError";
    this.status = status;
  }
}

export function assertSameOriginRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site")?.toLocaleLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new HttpRequestError("Cross-site requests are not allowed.", 403);
  }

  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    if (new URL(origin).origin !== new URL(request.url).origin) {
      throw new HttpRequestError("Cross-site requests are not allowed.", 403);
    }
  } catch (error) {
    if (error instanceof HttpRequestError) throw error;
    throw new HttpRequestError("The request origin is invalid.", 403);
  }
}

export async function readJsonObject(
  request: Request,
  maximumBytes = 16_384,
): Promise<Record<string, unknown>> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLocaleLowerCase();
  if (contentType !== "application/json") {
    throw new HttpRequestError("Send this request as JSON.", 415);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isInteger(declaredLength) || declaredLength < 0) {
      throw new HttpRequestError("The request length is invalid.", 400);
    }
    if (declaredLength > maximumBytes) {
      throw new HttpRequestError("The request is too large.", 413);
    }
  }
  if (!request.body) {
    throw new HttpRequestError("The request body is missing.", 400);
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw new HttpRequestError("The request is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof HttpRequestError) throw error;
    throw new HttpRequestError("The request body is not valid UTF-8.", 400);
  } finally {
    reader.releaseLock();
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new HttpRequestError("That request could not be read.", 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpRequestError("The JSON request must be an object.", 400);
  }
  return value as Record<string, unknown>;
}

export function requireInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new HttpRequestError(
      `${label} must be between ${minimum} and ${maximum}.`,
      400,
    );
  }
  return number;
}

export async function createClientRateLimitKey(
  request: Request,
  secret: string,
) {
  const address = request.headers.get("cf-connecting-ip")?.trim();
  const authenticatedEmail = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLocaleLowerCase();
  const identity = address && /^[0-9a-f:.]{2,64}$/i.test(address)
    ? `ip:${address}`
    : authenticatedEmail && authenticatedEmail.length <= 254
      ? `user:${authenticatedEmail}`
      : "anonymous";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(identity),
  );
  return Array.from(
    new Uint8Array(signature),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
