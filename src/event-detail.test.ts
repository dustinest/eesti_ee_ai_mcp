import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseEventHtml, fetchEventDetail } from "./event-detail.js";
import { EventNotFoundError, InvalidEventUrlError } from "./types.js";
import FIXTURE from "./fixtures/event.html?raw";
import SOLDOUT from "./fixtures/event-soldout.html?raw";
const URL_OK = "https://eesti.ai/tallinn-kogukonna-kohtumine-tehisaru-kogemus-ja-inspiratsioonilood-0";

describe("parseEventHtml", () => {
  it("pulls title, lead summary and image from the og: meta tags", () => {
    const e = parseEventHtml(FIXTURE, URL_OK);
    expect(e.title).toBe("TALLINN: Kogukonna kohtumine - tehisaru kogemus- ja inspiratsioonilood");
    expect(e.summary).toMatch(/^Inspiratsiooniseminari eesmärk/);
    expect(e.imageUrl).toMatch(/^https:\/\/eesti\.ai\/.*Eesti%20Puuetega/);
    expect(e.url).toBe(URL_OK);
  });

  it("extracts the full body, not just the lead", () => {
    const e = parseEventHtml(FIXTURE, URL_OK);
    // These phrases live deep in the body (speaker bio, audience), never in the lead/meta.
    expect(e.description).toContain("Kairi Rondo");
    expect(e.description).toContain("ettevõtjad, kes kaaluvad");
  });

  it("strips scripts, styles and tags from the body", () => {
    const e = parseEventHtml(FIXTURE, URL_OK);
    expect(e.description).not.toContain("<");
    expect(e.description).not.toContain("function(");
  });

  it("extracts the displayed date-time and location", () => {
    const e = parseEventHtml(FIXTURE, URL_OK);
    expect(e.dateTime).toContain("04. juuni 2026");
    expect(e.dateTime).toContain("16.00-18.00");
    expect(e.location).toBe("Eesti Puuetega Inimeste Koda");
  });

  it("captures the registration status notice when the event is full", () => {
    // The sold-out notice lives inside the registration form, which the description strips.
    const e = parseEventHtml(SOLDOUT, URL_OK);
    expect(e.registration).toBe("Kohad on täitunud");
  });

  it("leaves registration empty when there is no such notice (open event)", () => {
    const e = parseEventHtml(FIXTURE, URL_OK);
    expect(e.registration).toBe("");
  });
});

// Minimal Workers Cache API stub: always miss, record puts.
function stubCaches() {
  const puts: Array<[Request, Response]> = [];
  vi.stubGlobal("caches", {
    default: {
      match: vi.fn(async () => undefined),
      put: vi.fn(async (req: Request, res: Response) => {
        puts.push([req, res]);
      }),
    },
  });
  return puts;
}

describe("fetchEventDetail", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("rejects a non-eesti.ai url without fetching (SSRF gate)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchEventDetail("https://evil.com/x")).rejects.toBeInstanceOf(InvalidEventUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a non-https scheme without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchEventDetail("http://eesti.ai/x")).rejects.toBeInstanceOf(InvalidEventUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects the at-sign host-spoof trick", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchEventDetail("https://eesti.ai@evil.com/x")).rejects.toBeInstanceOf(InvalidEventUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches, parses and caches a valid event page", async () => {
    const puts = stubCaches();
    const fetchMock = vi.fn(async () => new Response(FIXTURE, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const e = await fetchEventDetail(URL_OK);
    expect(e.title).toBe("TALLINN: Kogukonna kohtumine - tehisaru kogemus- ja inspiratsioonilood");

    const req = (fetchMock.mock.calls as unknown as Array<[Request]>)[0]![0];
    expect(req.headers.get("Origin")).toBe("https://eesti.ai");
    expect(puts).toHaveLength(1);
  });

  it("throws EventNotFoundError on a 404 and caches the negative result", async () => {
    const puts = stubCaches();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    await expect(fetchEventDetail(URL_OK)).rejects.toBeInstanceOf(EventNotFoundError);
    expect(puts).toHaveLength(1);
    expect(puts[0]![1].status).toBe(404);
  });

  it("treats a cached 404 as not found without refetching", async () => {
    vi.stubGlobal("caches", { default: { match: vi.fn(async () => new Response("", { status: 404 })), put: vi.fn() } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchEventDetail(URL_OK)).rejects.toBeInstanceOf(EventNotFoundError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
