// Normalized event exposed through the MCP tools. Upstream field names never leak past this.
export type AiEvent = {
  id: string; // upstream id, canonical key
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
