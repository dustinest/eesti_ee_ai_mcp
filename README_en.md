# eesti.ai events MCP server

A remote, read-only MCP server that exposes events from the Estonian eesti.ai
initiative (practical AI workshops and meetups) to MCP clients such as Claude
Desktop, Claude Code, Cursor and ChatGPT. It wraps the public vportal.ee search
API. Version 1 has no authentication.

It runs as a stateless Cloudflare Worker (free tier, no Durable Objects), and it
can also be self-hosted in Docker if you do not want to use Cloudflare.

## Tools

### search_events
Search events by keyword and time window.
Input: `{ keyword?, dateRelative?: "upcoming" | "past", page?, langcode?: "et" | "en" }`
Defaults: dateRelative upcoming, page 1, langcode et.
Returns `{ events, total, page, pageSize, hasMore }`.

### upcoming_events
The next upcoming events, sorted by start time.
Input: `{ limit?, langcode?: "et" | "en" }` (limit default 10).

### get_event
A single event by its canonical id.
Input: `{ id }`. Searches the upcoming then past windows and matches by id.

Each tool returns both a structured JSON payload and a short text summary.

Note on `langcode`: the upstream eesti.ai endpoints only carry Estonian data.
`langcode: "en"` is accepted for forward compatibility but always returns an
empty result, so use the default `"et"`.

## Requirements

- Node.js 20 or newer (for local development), or
- Docker (for the self-hosted container path).

The endpoint speaks MCP over streamable HTTP. The URL is the server root, for
example `http://localhost:8787/`.

## Setup: run it locally with Node

Step by step:

1. Clone the repository and enter it.

   ```bash
   git clone <repo-url> eesti-ai-events-mcp
   cd eesti-ai-events-mcp
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. Run the unit tests to confirm everything works.

   ```bash
   npm test
   ```

4. Start the server. This runs the Worker locally with workerd, no Cloudflare
   account needed.

   ```bash
   npm run dev
   ```

   Wrangler prints the local URL, normally `http://localhost:8787`.

5. Smoke-test it with curl.

   ```bash
   curl -s -X POST http://localhost:8787/ \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
   ```

   You should see `search_events`, `upcoming_events`, `get_event`.

## Setup: run it in Docker (self-hosted)

This path needs only Docker. It runs the same Worker locally inside the
container, so there is no Cloudflare account and no monthly cost.

1. Build and start the container.

   ```bash
   docker compose up --build
   ```

2. The MCP endpoint is now at `http://localhost:8787/`. Test it with the same
   curl command as above.

3. Stop it with Ctrl-C, or run it in the background with `docker compose up -d`
   and stop it later with `docker compose down`.

To change the host port, edit the `ports` mapping in `docker-compose.yml`, for
example `"9000:8787"` to serve on port 9000.

Note: the container runs `wrangler dev`, which is a development server. It is
fine for personal and small-team self-hosting. For a hardened public deployment,
prefer the Cloudflare deploy path below.

## Connect an MCP client

Point your client at the server URL. Use `http://localhost:8787/` for local or
Docker, or your deployed `https://...workers.dev/` URL for the Cloudflare path.

### Claude Code

```bash
claude mcp add --transport http eesti-ai http://localhost:8787/
```

Then list tools with `/mcp` inside Claude Code.

### Cursor

Add this to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):

```json
{
  "mcpServers": {
    "eesti-ai": {
      "url": "http://localhost:8787/"
    }
  }
}
```

### Claude Desktop

Claude Desktop connects to remote HTTP servers through the `mcp-remote` bridge.
Open Settings, Developer, Edit Config to open `claude_desktop_config.json`.

This file usually already has other settings in it. Do not paste over the whole
file. Add only the `mcpServers` block. If you already have an `mcpServers` block,
add the `eesti-ai` entry inside it and leave the rest alone.

The part to add:

```json
"mcpServers": {
  "eesti-ai": {
    "command": "npx",
    "args": ["mcp-remote", "http://localhost:8787/"]
  }
}
```

For context, a full config file with that block merged in looks something like
this. Your other keys will differ, so keep yours and only add `mcpServers`:

> **Warning: do not copy the example below.** It is for illustration only, to
> show where the `mcpServers` block sits among other keys. The `preferences`,
> `coworkUserFilesPath`, and other values are placeholders. Copying it will
> overwrite your real settings. Only add the `mcpServers` block shown above to
> your own existing file.

```json
{
  "preferences": {
    "remoteToolsDeviceName": "your-device-name",
    "coworkWebSearchEnabled": true,
    "coworkScheduledTasksEnabled": true,
    "ccdScheduledTasksEnabled": true
  },
  "coworkUserFilesPath": "/Users/you/Documents/Claude",
  "mcpServers": {
    "eesti-ai": {
      "command": "npx",
      "args": ["mcp-remote", "http://localhost:8787/"]
    }
  }
}
```

Save the file and restart Claude Desktop. The eesti.ai tools appear in the tools
menu.

### MCP Inspector (for testing)

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector, choose transport "Streamable HTTP", enter the server URL, and
exercise the three tools.

## Deploy to Cloudflare (optional)

1. Log in once.

   ```bash
   npx wrangler login
   ```

2. Deploy.

   ```bash
   npm run deploy
   ```

   Wrangler prints the public `https://eesti-ai-events-mcp.<your-subdomain>.workers.dev`
   URL. Use that URL in the client configuration above. A custom domain is
   optional and can be added later in the Cloudflare dashboard.

## Notes

Version 1 is a stateless Worker on the Cloudflare free tier. It does not use
Durable Objects, so there is no Workers Paid plan cost. The eesti.ai endpoints
serve Estonian data only; `langcode: "en"` is accepted but always returns an
empty result.
