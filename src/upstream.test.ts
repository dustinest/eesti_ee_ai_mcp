import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchEvents } from "./upstream.js";
import { UpstreamError } from "./types.js";

// Minimal stub of the Workers Cache API: always miss, record puts.
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

const okBody = JSON.stringify({
  response: { numFound: 6, start: 0, docs: [{ id: "x", title: "t", ds_start_date: "2026-06-03T10:00:00Z", ds_end_date: "2026-06-03T11:00:00Z", uri: "/x", langcode: "et" }] },
  code: 200,
});

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchEvents", () => {
  it("sends the required Origin, Referer and Accept headers", async () => {
    stubCaches();
    const fetchMock = vi.fn(async () => new Response(okBody, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchEvents({ langcode: "et", page: 1, dateRelative: "upcoming" });

    const req = (fetchMock.mock.calls as unknown as Array<[Request]>)[0]![0];
    expect(req.headers.get("Origin")).toBe("https://eesti.ai");
    expect(req.headers.get("Referer")).toBe("https://eesti.ai/");
    expect(req.headers.get("Accept")).toBe("application/json");
  });

  it("builds the URL with langcode, page and filters", async () => {
    stubCaches();
    const fetchMock = vi.fn(async () => new Response(okBody, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchEvents({ langcode: "en", page: 2, dateRelative: "past", keyword: "AI" });

    const url = (fetchMock.mock.calls as unknown as Array<[Request]>)[0]![0].url;
    expect(url).toContain("langcode=en");
    expect(url).toContain("page=2");
    expect(url).toContain("filters%5Bdate_relative%5D=past");
    expect(url).toContain("filters%5Bkeyword%5D=AI");
  });

  it("returns the parsed response object on success", async () => {
    stubCaches();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(okBody, { status: 200 })));

    const r = await fetchEvents({ langcode: "et", page: 1, dateRelative: "upcoming" });
    expect(r.numFound).toBe(6);
    expect(r.docs).toHaveLength(1);
    expect(r.docs[0].id).toBe("x");
  });

  it("throws UpstreamError when the body is the literal string null", async () => {
    stubCaches();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("null", { status: 200 })));

    await expect(fetchEvents({ langcode: "et", page: 1, dateRelative: "upcoming" })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("throws UpstreamError on a non-200 response", async () => {
    stubCaches();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("oops", { status: 503 })));

    await expect(fetchEvents({ langcode: "et", page: 1, dateRelative: "upcoming" })).rejects.toBeInstanceOf(UpstreamError);
  });

  it("returns a cached response without calling fetch on a cache hit", async () => {
    vi.stubGlobal("caches", {
      default: {
        match: vi.fn(async () => new Response(okBody, { status: 200 })),
        put: vi.fn(async () => {}),
      },
    });
    const fetchMock = vi.fn(async () => new Response(okBody, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await fetchEvents({ langcode: "et", page: 1, dateRelative: "upcoming" });
    expect(r.numFound).toBe(6);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
