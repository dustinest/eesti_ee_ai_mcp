import type { AiEvent, UpstreamDoc } from "./types.js";

export const EESTI_BASE = "https://eesti.ai";

// Map one raw upstream doc to the normalized AiEvent.
// Rules: ds_ fields are the UTC source of truth; uri/image_uri are relative and
// resolved against eesti.ai; the pre-rendered Estonian display strings are dropped.
export function toAiEvent(doc: UpstreamDoc): AiEvent {
  return {
    id: doc.id,
    title: doc.title,
    summary: doc.lead_text ?? "",
    startsAt: doc.ds_start_date,
    endsAt: doc.ds_end_date,
    location: doc.event_location ?? "",
    url: EESTI_BASE + doc.uri,
    imageUrl: doc.image_uri ? EESTI_BASE + doc.image_uri : null,
    wholeDay: Boolean(doc.whole_day),
    langcode: doc.langcode,
  };
}
