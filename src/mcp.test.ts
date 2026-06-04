import { describe, it, expect, vi } from "vitest";

vi.mock("./upstream.js", () => ({ fetchEvents: vi.fn(async () => ({ numFound: 0, start: 0, docs: [] })) }));
import { handleRpc } from "./mcp.js";

describe("handleRpc", () => {
  it("responds to initialize with protocol version, capabilities and serverInfo", async () => {
    const res = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    expect(res).toMatchObject({ jsonrpc: "2.0", id: 1 });
    const result = (res as { result: any }).result;
    expect(result.protocolVersion).toBe("2025-06-18");
    expect(result.capabilities).toHaveProperty("tools");
    expect(result.serverInfo.name).toBe("eesti-ai-events");
  });

  it("returns null for the initialized notification (no id)", async () => {
    const res = await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res).toBeNull();
  });

  it("lists the three tools", async () => {
    const res = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = (res as { result: { tools: Array<{ name: string }> } }).result.tools;
    expect(tools.map((t) => t.name).sort()).toEqual(["get_event", "search_events", "upcoming_events"]);
  });

  it("calls a tool and returns content plus structuredContent", async () => {
    const res = await handleRpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "upcoming_events", arguments: { limit: 5 } } });
    const result = (res as { result: any }).result;
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0].type).toBe("text");
    expect(result).toHaveProperty("structuredContent");
  });

  it("returns a JSON-RPC error for an unknown method", async () => {
    const res = await handleRpc({ jsonrpc: "2.0", id: 4, method: "does/not/exist" });
    expect((res as { error: { code: number } }).error.code).toBe(-32601);
  });

  it("returns an isError tool result when the tool input is invalid", async () => {
    const res = await handleRpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_event", arguments: {} } });
    const result = (res as { result: { isError: boolean } }).result;
    expect(result.isError).toBe(true);
  });
});
