// Normalized event exposed through the MCP tools. Upstream field names never leak past this.
export type AiEvent = {
  title: string;
  summary: string; // from lead_text
  startsAt: string; // ds_start_date, UTC ISO 8601, source of truth
  endsAt: string; // ds_end_date, UTC ISO 8601
  location: string; // event_location
  url: string; // https://eesti.ai + uri
  imageUrl: string | null; // https://eesti.ai + image_uri, or null
  wholeDay: boolean; // whole_day
  langcode: "et" | "en";
};

// Full detail for a single event, scraped from its public eesti.ai page.
// Richer than AiEvent: carries the whole writeup, not just the listing lead.
export type EventDetail = {
  title: string;
  summary: string; // the lead (og:description)
  description: string; // the full body text, scripts/tags stripped
  dateTime: string; // displayed date + time, e.g. "04. juuni 2026 16.00-18.00" ("" if absent)
  location: string; // displayed venue ("" if absent)
  registration: string; // registration notice, e.g. "Kohad on täitunud" (full); "" when none shown
  imageUrl: string | null;
  url: string; // the page url it was fetched from
};

// One raw event record from upstream (only the fields we read).
export type UpstreamDoc = {
  id: string;
  title: string;
  lead_text?: string;
  ds_start_date: string;
  ds_end_date: string;
  event_location?: string;
  uri: string;
  image_uri?: string | null;
  whole_day?: boolean;
  langcode: "et" | "en";
};

// The "response" object inside the upstream payload.
export type UpstreamResponse = {
  numFound: number;
  start: number;
  docs: UpstreamDoc[];
};

// Thrown when upstream is unreachable, non-200, or returns the literal string "null".
export class UpstreamError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "UpstreamError";
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

// Thrown when an event url is not an https://eesti.ai page (the SSRF gate for get_event).
export class InvalidEventUrlError extends Error {
  constructor(url: string) {
    super(`Not an https://eesti.ai event url: ${url}`);
    this.name = "InvalidEventUrlError";
  }
}

// Thrown when the event page does not exist (HTTP 404).
export class EventNotFoundError extends Error {
  constructor(url: string) {
    super(`No event found at ${url}`);
    this.name = "EventNotFoundError";
  }
}
