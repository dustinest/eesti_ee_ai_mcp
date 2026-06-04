import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the upstream module so tool tests never hit the network.
vi.mock("./upstream.js", () => ({ fetchEvents: vi.fn() }));
import { fetchEvents } from "./upstream.js";
import { TOOLS, getTool } from "./tools.js";

const fetchEventsMock = fetchEvents as unknown as ReturnType<typeof vi.fn>;

function doc(id: string, startsAt: string) {
  return { id, title: `Event ${id}`, lead_text: "lead", ds_start_date: startsAt, ds_end_date: startsAt, event_location: "Tallinn", uri: `/${id}`, image_uri: null, whole_day: false, langcode: "et" };
}

beforeEach(() => {
  fetchEventsMock.mockReset();
});

describe("search_events", () => {
  it("applies defaults and returns pagination metadata", async () => {
    fetchEventsMock.mockResolvedValue({ numFound: 16, start: 0, docs: [doc("a", "2026-06-03T10:00:00Z"), doc("b", "2026-06-04T10:00:00Z")] });
    const tool = getTool("search_events")!;
    const result = await tool.handler({});

    expect(fetchEventsMock).toHaveBeenCalledWith({ langcode: "et", page: 1, dateRelative: "upcoming", keyword: undefined });
    const s = result.structured as { total: number; page: number; pageSize: number; hasMore: boolean; events: unknown[] };
    expect(s.total).toBe(16);
    expect(s.page).toBe(1);
    expect(s.pageSize).toBe(2);
    expect(s.hasMore).toBe(true); // 0 + 2 < 16
    expect(s.events).toHaveLength(2);
    expect(typeof result.text).toBe("string");
  });

  it("reports hasMore false on the last page", async () => {
    fetchEventsMock.mockResolvedValue({ numFound: 2, start: 0, docs: [doc("a", "2026-06-03T10:00:00Z"), doc("b", "2026-06-04T10:00:00Z")] });
    const result = await getTool("search_events")!.handler({ page: 1 });
    expect((result.structured as { hasMore: boolean }).hasMore).toBe(false);
  });

  it("rejects an invalid dateRelative via the Zod schema", async () => {
    await expect(getTool("search_events")!.handler({ dateRelative: "sideways" })).rejects.toBeTruthy();
  });
});

describe("upcoming_events", () => {
  it("sorts ascending by startsAt and slices to the limit", async () => {
    fetchEventsMock.mockResolvedValue({ numFound: 3, start: 0, docs: [doc("late", "2026-06-10T10:00:00Z"), doc("early", "2026-06-01T10:00:00Z"), doc("mid", "2026-06-05T10:00:00Z")] });
    const result = await getTool("upcoming_events")!.handler({ limit: 2 });
    const events = (result.structured as { events: Array<{ id: string }> }).events;
    expect(events.map((e) => e.id)).toEqual(["early", "mid"]);
  });
});

describe("get_event", () => {
  it("finds an event by id in the upcoming window", async () => {
    fetchEventsMock.mockResolvedValue({ numFound: 1, start: 0, docs: [doc("target", "2026-06-03T10:00:00Z")] });
    const result = await getTool("get_event")!.handler({ id: "target" });
    expect((result.structured as { event: { id: string } | null }).event?.id).toBe("target");
  });

  it("returns a null event and isError flag when not found in any window", async () => {
    fetchEventsMock.mockResolvedValue({ numFound: 0, start: 0, docs: [] });
    const result = await getTool("get_event")!.handler({ id: "missing" });
    expect((result.structured as { event: null; found: boolean }).found).toBe(false);
    expect(result.isError).toBe(true);
  });
});

describe("TOOLS registry", () => {
  it("advertises three tools each with a JSON Schema inputSchema", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(["get_event", "search_events", "upcoming_events"]);
    for (const t of TOOLS) {
      expect(t.inputSchema).toHaveProperty("type", "object");
    }
  });
});
