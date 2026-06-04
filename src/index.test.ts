import { describe, it, expect, vi } from "vitest";

vi.mock("./upstream.js", () => ({ fetchEvents: vi.fn(async () => ({ numFound: 0, start: 0, docs: [] })) }));
import worker from "./index.js";

const env = {} as Record<string, never>;
const ctx = {} as ExecutionContext;

function post(body: unknown): Request {
  return new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("worker fetch", () => {
  it("answers OPTIONS preflight with CORS headers", async () => {
    const res = await worker.fetch(new Request("https://example.com/mcp", { method: "OPTIONS" }), env, ctx);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("handles a single JSON-RPC request and returns JSON", async () => {
    const res = await worker.fetch(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), env, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const json = (await res.json()) as { result: { tools: unknown[] } };
    expect(json.result.tools).toHaveLength(3);
  });

  it("returns 202 with empty body for a notification", async () => {
    const res = await worker.fetch(post({ jsonrpc: "2.0", method: "notifications/initialized" }), env, ctx);
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("handles a batch of requests", async () => {
    const res = await worker.fetch(
      post([
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ]),
      env,
      ctx,
    );
    const json = (await res.json()) as unknown[];
    expect(json).toHaveLength(2);
  });

  it("rejects non-POST methods on the MCP route with 405", async () => {
    const res = await worker.fetch(new Request("https://example.com/mcp", { method: "GET" }), env, ctx);
    expect(res.status).toBe(405);
  });
});
