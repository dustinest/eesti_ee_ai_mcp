import { UpstreamError, type UpstreamResponse } from "./types.js";

const UPSTREAM_URL = "https://search.service.eu-live.vportal.ee/v1/events/eestiai";
// Events change infrequently. Bump this one constant to change cache lifetime.
export const CACHE_TTL_SECONDS = 600;

export type FetchEventsParams = {
  langcode: "et" | "en";
  page: number;
  dateRelative: "upcoming" | "past";
  keyword?: string;
};

function buildUrl(params: FetchEventsParams): string {
  const u = new URL(UPSTREAM_URL);
  u.searchParams.set("langcode", params.langcode);
  u.searchParams.set("page", String(params.page));
  u.searchParams.set("filters[date_relative]", params.dateRelative);
  if (params.keyword) u.searchParams.set("filters[keyword]", params.keyword);
  return u.toString();
}

function parseResponse(text: string): UpstreamResponse {
  // The upstream returns the literal string "null" on a header-less or malformed request.
  if (text.trim() === "null") {
    throw new UpstreamError("Upstream returned null (likely a rejected request)");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new UpstreamError("Upstream returned invalid JSON", { cause: err });
  }
  const response = (parsed as { response?: UpstreamResponse }).response;
  if (!response || !Array.isArray(response.docs)) {
    throw new UpstreamError("Upstream response missing the expected 'response.docs' shape");
  }
  return response;
}

// Single entry point for all upstream calls. Owns the required headers, URL building,
// null handling, typed errors, and a short-lived Workers Cache API wrapper.
export async function fetchEvents(params: FetchEventsParams): Promise<UpstreamResponse> {
  const url = buildUrl(params);
  const cacheKey = new Request(url, { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    return parseResponse(await cached.text());
  }

  let res: Response;
  try {
    res = await fetch(
      new Request(url, {
        method: "GET",
        headers: {
          Origin: "https://eesti.ai",
          Referer: "https://eesti.ai/",
          Accept: "application/json",
        },
      }),
    );
  } catch (err) {
    throw new UpstreamError("Upstream request failed", { cause: err });
  }

  if (!res.ok) {
    throw new UpstreamError(`Upstream returned HTTP ${res.status}`);
  }

  const text = await res.text();
  const response = parseResponse(text); // throws on "null" or bad shape before caching

  await cache.put(
    cacheKey,
    new Response(text, {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_TTL_SECONDS}` },
    }),
  );

  return response;
}
