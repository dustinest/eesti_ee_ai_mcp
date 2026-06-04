# eesti.ai events MCP server

A remote, read-only MCP server that exposes events from the Estonian eesti.ai
initiative (practical AI workshops and meetups) to MCP clients such as Claude
Desktop, Claude Code, Cursor and ChatGPT. It wraps the public vportal.ee search
API. Version 1 has no authentication.

It runs as a stateless Cloudflare Worker (free tier, no Durable Objects), and it
can also be self-hosted with Docker or Podman if you do not want to use
Cloudflare.

## Contents

- [Tools](#tools)
  - [search_events](#search_events)
  - [upcoming_events](#upcoming_events)
  - [get_event](#get_event)
- [Running locally](#running-locally)
  - [With Node](#with-node)
  - [With Docker (or Podman)](#with-docker-or-podman)
  - [Connecting a local MCP client](#connecting-a-local-mcp-client)
- [Deploy to Cloudflare](#deploy-to-cloudflare)
  - [Connecting an MCP client](#connecting-an-mcp-client)
- [Notes](#notes)
- [License](#license)

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
Full details of a single event, fetched live from its public eesti.ai page
(the full writeup, not just the listing lead).
Input: `{ url }` — the event `url` returned by `search_events` or
`upcoming_events` (must be an `https://eesti.ai/...` page).
Returns `{ title, summary, description, dateTime, location, registration, imageUrl, url }`
(`registration` carries a notice such as "Kohad on täitunud" when the event is full; empty otherwise).

Each tool returns both a structured JSON payload and a short text summary.

Note on `langcode`: the upstream eesti.ai endpoints only carry Estonian data.
`langcode: "en"` is accepted for forward compatibility but always returns an
empty result, so use the default `"et"`.

## Running locally

Run the server on your own machine with either Node or Docker. Both serve the
same MCP endpoint over streamable HTTP at the server root, normally
`http://localhost:8787/`.

### With Node

#### Requirements

- Node.js 20 or newer.

#### Step-by-step guide

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

### With Docker (or Podman)

#### Requirements

- Docker, or Podman (use `podman compose` in place of `docker compose`).
- You do not need Node or npm on the host — they run inside the container.

#### Step-by-step guide

1. Build and start the container.
   - **Docker**
      ```bash
      docker compose up --build -d
      ```
   - **Podman**
      ```bash
      podman compose up --build -d
      ```

2. The MCP endpoint is now at `http://localhost:8787/`. Test it with the same
   curl command as in the Node steps above.

3. View the logs with `docker compose logs -f`, and stop it with
   `docker compose down`.

   To change the host port, edit the `ports` mapping in `docker-compose.yml`, for
   example `"9000:8787"` to serve on port 9000.

Note: the container runs `wrangler dev`, which is a development server. It is
fine for personal and small-team self-hosting. For a hardened public deployment,
prefer the Cloudflare path below.

### Connecting a local MCP client

Point your client at the local server URL, `http://localhost:8787/`. A local
server generally needs a bit of manual configuration, shown per client below.

> **Note on ChatGPT:** ChatGPT cannot connect to a local server. It only accepts
> a public HTTPS URL, so `http://localhost:8787/` will not work. To use the
> server with ChatGPT, deploy it first (see [Deploy to Cloudflare](#deploy-to-cloudflare))
> and connect to the public `workers.dev` URL.

#### Claude Code

```bash
claude mcp add --transport http eesti-ai http://localhost:8787/
```

Then list tools with `/mcp` inside Claude Code.

#### Cursor

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

#### Claude Desktop

Claude Desktop reaches a local HTTP server through the `mcp-remote` bridge.
Open Settings → Developer → Edit Config to open `claude_desktop_config.json`.

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

#### MCP Inspector (for testing)

```bash
npx @modelcontextprotocol/inspector
```

In the Inspector, choose transport "Streamable HTTP", enter the server URL, and
exercise the three tools.

## Deploy to Cloudflare

### Step-by-step guide

1. Log in once.

   ```bash
   npx wrangler login
   ```

2. Deploy.

   ```bash
   npm run deploy
   ```

   Wrangler prints the public `https://eesti-ai-events-mcp.<your-subdomain>.workers.dev`
   URL. A custom domain is optional and can be added later in the Cloudflare
   dashboard.

### Connecting an MCP client

A deployed server has a public `https://...workers.dev/` URL, so most clients can
add it straight through their connector / integrations interface, without editing
config files:

- **Claude Desktop / Claude.ai**: Settings, Connectors, Add custom connector, and
  paste your `workers.dev` URL.
- **ChatGPT**: add it as a custom connector (on plans that support remote MCP
  connectors).

The CLI and config-file methods from
[Connecting a local MCP client](#connecting-a-local-mcp-client) also work — just
use your `workers.dev` URL instead of `http://localhost:8787/`.

## Notes

Version 1 is a stateless Worker on the Cloudflare free tier. It does not use
Durable Objects, so there is no Workers Paid plan cost. The eesti.ai endpoints
serve Estonian data only; `langcode: "en"` is accepted but always returns an
empty result.

## License

MIT — free to use, modify and distribute, with **no warranty; use it at your
own risk**. See [LICENSE](LICENSE).
