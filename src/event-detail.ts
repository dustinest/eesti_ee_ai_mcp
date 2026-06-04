import { EventNotFoundError, InvalidEventUrlError, UpstreamError, type EventDetail } from "./types.js";
import { EESTI_BASE } from "./normalize.js";
import { CACHE_TTL_SECONDS } from "./upstream.js";

// 404s are cached briefly so a flood of junk urls can't hammer eesti.ai through us.
const NEGATIVE_TTL_SECONDS = 60;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// Collapse a raw HTML fragment to plain readable text: drop noise blocks, strip tags, tidy whitespace.
function stripToText(fragment: string): string {
  const cleaned = fragment
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<form[\s\S]*?<\/form>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(cleaned).replace(/\s+/g, " ").trim();
}

// Read an og:/meta tag's content, tolerating either attribute order.
function meta(html: string, prop: string): string {
  const p = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m =
    html.match(new RegExp(`<meta[^>]+(?:property|name)="${p}"[^>]*content="([^"]*)"`, "i")) ??
    html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]*(?:property|name)="${p}"`, "i"));
  return m ? decodeEntities(m[1]!) : "";
}

function firstGroup(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? stripToText(m[1]!) : "";
}

// Parse a fetched eesti.ai event page into structured detail. Pure — no network or Workers globals.
// Anchors on stable markers (og: meta, <main>/<article>) so theme/markup churn degrades gracefully.
export function parseEventHtml(html: string, url: string): EventDetail {
  const title = meta(html, "og:title") || firstGroup(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const summary = meta(html, "og:description");
  const ogImage = meta(html, "og:image");
  const imageUrl = ogImage ? (/^https?:\/\//i.test(ogImage) ? ogImage : EESTI_BASE + ogImage) : null;

  const region =
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ??
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ??
    html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const description = stripToText(region ? region[1]! : html);

  // Date/time/location sit in the event-details block; bounded before the add-to-calendar widget.
  let dateTime = "";
  let location = "";
  const start = html.indexOf("js-vp-event-details-source");
  if (start >= 0) {
    const after = html.slice(start);
    const block = after.slice(0, after.indexOf("js-vp-event-add-to-calendar") + 1 || after.length);
    const date = firstGroup(block, /<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const time = firstGroup(block, /sprite-icon_time[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
    dateTime = [date, time].filter(Boolean).join(" ");
    location = firstGroup(block, /sprite-icon_pin[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
  }

  // The registration notice (e.g. "Kohad on täitunud") is a webform alert inside the
  // form, which the description drops — pull it from the full HTML separately.
  const registration = firstGroup(
    html,
    /alert-container[^>]*>\s*<h2[^>]*visually-hidden[^>]*>[^<]*<\/h2>\s*<span>([^<]+)<\/span>/i,
  );

  return { title, summary, description, dateTime, location, registration, imageUrl, url };
}

// SSRF gate: only ever fetch public https://eesti.ai pages.
function assertEestiUrl(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new InvalidEventUrlError(url);
  }
  if (u.protocol !== "https:" || u.hostname !== "eesti.ai") throw new InvalidEventUrlError(url);
  return u;
}

// Fetch one event page (cached, with short-lived negative caching) and parse it.
export async function fetchEventDetail(url: string): Promise<EventDetail> {
  const u = assertEestiUrl(url);
  const canonical = u.toString();
  const cacheKey = new Request(canonical, { method: "GET" });
  const cache = caches.default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    if (cached.status === 404) throw new EventNotFoundError(canonical);
    return parseEventHtml(await cached.text(), canonical);
  }

  let res: Response;
  try {
    res = await fetch(
      new Request(canonical, {
        method: "GET",
        headers: { Origin: EESTI_BASE, Referer: `${EESTI_BASE}/`, Accept: "text/html" },
      }),
    );
  } catch (err) {
    throw new UpstreamError("Event page request failed", { cause: err });
  }

  if (res.status === 404) {
    await cache.put(cacheKey, new Response("", { status: 404, headers: { "Cache-Control": `max-age=${NEGATIVE_TTL_SECONDS}` } }));
    throw new EventNotFoundError(canonical);
  }
  if (!res.ok) throw new UpstreamError(`Event page returned HTTP ${res.status}`);

  const html = await res.text();
  await cache.put(
    cacheKey,
    new Response(html, { headers: { "Content-Type": "text/html", "Cache-Control": `max-age=${CACHE_TTL_SECONDS}` } }),
  );
  return parseEventHtml(html, canonical);
}
