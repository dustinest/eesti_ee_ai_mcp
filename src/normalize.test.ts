import { describe, it, expect } from "vitest";
import { toAiEvent } from "./normalize.js";
import type { UpstreamDoc } from "./types.js";

const base: UpstreamDoc = {
  id: "abc:et:0:2026-06-03",
  title: "Praktiline tehisaru töötuba",
  lead_text: "Töötuba keskendub sellele...",
  ds_start_date: "2026-06-03T10:00:00Z",
  ds_end_date: "2026-06-03T14:00:00Z",
  event_location: "Tartu mnt 2, Tallinn",
  uri: "/tallinn-tootuba",
  image_uri: "/sites/default/files/styles/x.jpg?itok=abc",
  whole_day: false,
  langcode: "et",
};

describe("toAiEvent", () => {
  it("resolves relative uri and image_uri against eesti.ai", () => {
    const e = toAiEvent(base);
    expect(e.url).toBe("https://eesti.ai/tallinn-tootuba");
    expect(e.imageUrl).toBe("https://eesti.ai/sites/default/files/styles/x.jpg?itok=abc");
  });

  it("uses the UTC ds_ fields as the time source of truth", () => {
    const e = toAiEvent(base);
    expect(e.startsAt).toBe("2026-06-03T10:00:00Z");
    expect(e.endsAt).toBe("2026-06-03T14:00:00Z");
  });

  it("maps lead_text to summary and event_location to location", () => {
    const e = toAiEvent(base);
    expect(e.summary).toBe("Töötuba keskendub sellele...");
    expect(e.location).toBe("Tartu mnt 2, Tallinn");
  });

  it("returns null imageUrl when image_uri is missing or null", () => {
    expect(toAiEvent({ ...base, image_uri: null }).imageUrl).toBeNull();
    expect(toAiEvent({ ...base, image_uri: undefined }).imageUrl).toBeNull();
  });

  it("defaults missing summary and location to empty strings", () => {
    const e = toAiEvent({ ...base, lead_text: undefined, event_location: undefined });
    expect(e.summary).toBe("");
    expect(e.location).toBe("");
  });

  it("coerces whole_day to a boolean", () => {
    expect(toAiEvent({ ...base, whole_day: undefined }).wholeDay).toBe(false);
    expect(toAiEvent({ ...base, whole_day: true }).wholeDay).toBe(true);
  });
});
