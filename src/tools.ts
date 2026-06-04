import { z } from "zod";
import type { AiEvent, UpstreamDoc } from "./types.js";
import { fetchEvents, type FetchEventsParams } from "./upstream.js";
import { fetchEventDetail } from "./event-detail.js";
import { toAiEvent } from "./normalize.js";

const DEFAULT_PAGE_SIZE = 10; // verified live; used only as a pagination guard

export type ToolResult = { structured: unknown; text: string; isError?: boolean };

export type ToolDef = {
  name: string;
  description: string;
  schema: z.ZodTypeAny;
  inputSchema: Record<string, unknown>;
  handler: (rawInput: unknown) => Promise<ToolResult>;
};

function eventsText(events: AiEvent[]): string {
  if (events.length === 0) return "No events found.";
  // The url is the handle a model passes to get_event for the full writeup.
  return events.map((e) => `- ${e.title} (${e.startsAt}) | ${e.location} | ${e.url}`).join("\n");
}

function sortByStart(events: AiEvent[]): AiEvent[] {
  return [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// Collect normalized events across pages, stopping at maxPages or when no more remain.
async function collectEvents(
  params: Omit<FetchEventsParams, "page">,
  maxPages: number,
): Promise<AiEvent[]> {
  const out: UpstreamDoc[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await fetchEvents({ ...params, page });
    out.push(...r.docs);
    if (r.docs.length === 0 || r.start + r.docs.length >= r.numFound) break;
  }
  return out.map(toAiEvent);
}

// --- search_events ---
const SearchInput = z.object({
  keyword: z.string().optional(),
  dateRelative: z.enum(["upcoming", "past"]).default("upcoming"),
  page: z.number().int().positive().default(1),
  langcode: z.enum(["et", "en"]).default("et"),
});

async function searchEvents(raw: unknown): Promise<ToolResult> {
  const input = SearchInput.parse(raw);
  const r = await fetchEvents({
    langcode: input.langcode,
    page: input.page,
    dateRelative: input.dateRelative,
    keyword: input.keyword,
  });
  const events = r.docs.map(toAiEvent);
  const structured = {
    events,
    total: r.numFound,
    page: input.page,
    pageSize: events.length, // count returned on this page
    hasMore: r.start + r.docs.length < r.numFound,
  };
  return { structured, text: eventsText(events) };
}

// --- upcoming_events ---
const UpcomingInput = z.object({
  limit: z.number().int().positive().default(10),
  langcode: z.enum(["et", "en"]).default("et"),
});

async function upcomingEvents(raw: unknown): Promise<ToolResult> {
  const input = UpcomingInput.parse(raw);
  const maxPages = Math.ceil(input.limit / DEFAULT_PAGE_SIZE) + 1; // guard against runaway
  const all = await collectEvents({ langcode: input.langcode, dateRelative: "upcoming" }, maxPages);
  const events = sortByStart(all).slice(0, input.limit);
  return { structured: { events, count: events.length }, text: eventsText(events) };
}

// --- get_event ---
// url must be a real https://eesti.ai page; the same gate is re-asserted at the fetch boundary.
const GetInput = z.object({
  url: z.string().refine((u) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && x.hostname === "eesti.ai";
    } catch {
      return false;
    }
  }, "url must be an https://eesti.ai event page"),
});

async function getEvent(raw: unknown): Promise<ToolResult> {
  const input = GetInput.parse(raw);
  try {
    const event = await fetchEventDetail(input.url);
    const header = [event.dateTime, event.location, event.registration].filter(Boolean).join(" | ");
    const lines = [event.title];
    if (header) lines.push(header);
    lines.push("", event.description, "", event.url);
    return { structured: { event, found: true }, text: lines.join("\n") };
  } catch (err) {
    // Discriminate by name, not instanceof: these errors can cross a module/bundle/realm boundary.
    const e = err as { name?: unknown; message?: unknown };
    if (e?.name === "EventNotFoundError" || e?.name === "InvalidEventUrlError") {
      const text = typeof e.message === "string" ? e.message : String(e.name);
      return { structured: { event: null, found: false }, text, isError: true };
    }
    throw err;
  }
}

function define(name: string, description: string, schema: z.ZodTypeAny, handler: ToolDef["handler"]): ToolDef {
  return { name, description, schema, inputSchema: z.toJSONSchema(schema) as Record<string, unknown>, handler };
}

export const TOOLS: ToolDef[] = [
  define("search_events", "Search eesti.ai AI events by keyword and time window with pagination.", SearchInput, searchEvents),
  define("upcoming_events", "List the next upcoming eesti.ai AI events sorted by start time.", UpcomingInput, upcomingEvents),
  define("get_event", "Fetch the full details of a single eesti.ai event from its url (the url returned by search_events or upcoming_events).", GetInput, getEvent),
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
