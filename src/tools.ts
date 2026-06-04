import { z } from "zod";
import type { AiEvent, UpstreamDoc } from "./types.js";
import { fetchEvents, type FetchEventsParams } from "./upstream.js";
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
const GetInput = z.object({ id: z.string().min(1) });

async function getEvent(raw: unknown): Promise<ToolResult> {
  const input = GetInput.parse(raw);
  const MAX_PAGES = 5; // upcoming+past are small (verified <= 16 each window)
  for (const dateRelative of ["upcoming", "past"] as const) {
    const events = await collectEvents({ langcode: "et", dateRelative }, MAX_PAGES);
    const found = events.find((e) => e.id === input.id);
    if (found) return { structured: { event: found, found: true }, text: `${found.title} | ${found.startsAt} | ${found.url}` };
  }
  return { structured: { event: null, found: false }, text: `No event found with id ${input.id}`, isError: true };
}

function define(name: string, description: string, schema: z.ZodTypeAny, handler: ToolDef["handler"]): ToolDef {
  return { name, description, schema, inputSchema: z.toJSONSchema(schema) as Record<string, unknown>, handler };
}

export const TOOLS: ToolDef[] = [
  define("search_events", "Search eesti.ai AI events by keyword and time window with pagination.", SearchInput, searchEvents),
  define("upcoming_events", "List the next upcoming eesti.ai AI events sorted by start time.", UpcomingInput, upcomingEvents),
  define("get_event", "Fetch a single eesti.ai event by its canonical id.", GetInput, getEvent),
];

export function getTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
