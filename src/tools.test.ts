import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the upstream + event-detail modules so tool tests never hit the network.
vi.mock("./upstream.js", () => ({ fetchEvents: vi.fn() }));
vi.mock("./event-detail.js", () => ({ fetchEventDetail: vi.fn() }));
import { fetchEvents } from "./upstream.js";
import { fetchEventDetail } from "./event-detail.js";
import { EventNotFoundError } from "./types.js";
import { TOOLS, getTool } from "./tools.js";

const fetchEventsMock = fetchEvents as unknown as ReturnType<typeof vi.fn>;
const fetchDetailMock = fetchEventDetail as unknown as ReturnType<typeof vi.fn>;

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
  it("includes each event url in the text output so it can be passed to get_event", async () => {
    fetchEventsMock.mockResolvedValue({ numFound: 1, start: 0, docs: [doc("a", "2026-06-03T10:00:00Z")] });
    const result = await getTool("search_events")!.handler({});
    expect(result.text).toContain("https://eesti.ai/a");
  });
});

describe("upcoming_events", () => {
  it("sorts ascending by startsAt and slices to the limit", async () => {
    fetchEventsMock.mockResolvedValue({ numFound: 3, start: 0, docs: [doc("late", "2026-06-10T10:00:00Z"), doc("early", "2026-06-01T10:00:00Z"), doc("mid", "2026-06-05T10:00:00Z")] });
    const result = await getTool("upcoming_events")!.handler({ limit: 2 });
    const events = (result.structured as { events: Array<{ startsAt: string }> }).events;
    expect(events.map((e) => e.startsAt)).toEqual(["2026-06-01T10:00:00Z", "2026-06-05T10:00:00Z"]);
  });
});

describe("get_event", () => {
  const detail = {
    title: "Tehisaru töötuba",
    summary: "lead",
    description: "Full body writeup with all the details.",
    dateTime: "04. juuni 2026 16.00-18.00",
    location: "Tallinn",
    registration: "Kohad on täitunud",
    imageUrl: null,
    url: "https://eesti.ai/tehisaru-tootuba",
  };

  // Block body matters: an arrow returning mockReset()'s value (the mock) would be
  // registered by vitest as a teardown and invoked after the test.
  beforeEach(() => {
    fetchDetailMock.mockReset();
  });

  it("fetches and returns the full event detail for a valid url", async () => {
    fetchDetailMock.mockResolvedValue(detail);
    const result = await getTool("get_event")!.handler({ url: "https://eesti.ai/tehisaru-tootuba" });
    expect(fetchDetailMock).toHaveBeenCalledWith("https://eesti.ai/tehisaru-tootuba");
    expect((result.structured as { event: { title: string }; found: boolean }).event.title).toBe("Tehisaru töötuba");
    expect(result.text).toContain("Full body writeup");
    expect(result.text).toContain("Kohad on täitunud"); // registration notice surfaced
    expect(result.isError).toBeUndefined();
  });

  it("returns a null event and isError flag when the page is not found", async () => {
    fetchDetailMock.mockRejectedValue(new EventNotFoundError("https://eesti.ai/missing"));
    const result = await getTool("get_event")!.handler({ url: "https://eesti.ai/missing" });
    expect((result.structured as { event: null; found: boolean }).found).toBe(false);
    expect(result.isError).toBe(true);
  });

  it("rejects a non-eesti.ai url before fetching", async () => {
    await expect(getTool("get_event")!.handler({ url: "https://evil.com/x" })).rejects.toBeTruthy();
    expect(fetchDetailMock).not.toHaveBeenCalled();
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
