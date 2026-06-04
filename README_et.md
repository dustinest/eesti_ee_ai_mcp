# eesti.ai sündmuste MCP-server

Kaugjuurdepääsuga, ainult lugemiseks mõeldud MCP-server, mis pakub Eesti
eesti.ai algatuse (praktilised AI töötoad ja kokkusaamised) sündmusi
MCP-klientidele nagu Claude Desktop, Claude Code, Cursor ja ChatGPT. Server
katab avaliku vportal.ee otsingu-API. Versioonil 1 autentimist ei ole.

See töötab olekuvaba Cloudflare Workerina (tasuta tasandil, ilma Durable
Objectiteta) ning seda saab soovi korral ka ise Dockeri või Podmaniga majutada,
kui sa ei taha Cloudflare'i kasutada.

_**NB!** kogu see dokumentatsioon on masintõlge inglise keelsest materjalist._


## Sisukord

- [Tööriistad](#tööriistad)
  - [search_events](#search_events)
  - [upcoming_events](#upcoming_events)
  - [get_event](#get_event)
- [Kohalik käivitamine](#kohalik-käivitamine)
  - [Node'iga](#nodeiga)
  - [Dockeriga (või Podmaniga)](#dockeriga-või-podmaniga)
  - [Kohaliku MCP-kliendi ühendamine](#kohaliku-mcp-kliendi-ühendamine)
- [Juuruta Cloudflare'i](#juuruta-cloudflarei)
  - [MCP-kliendi ühendamine](#mcp-kliendi-ühendamine)
- [Märkused](#märkused)
- [Litsents](#litsents)

## Tööriistad

### search_events
Otsi sündmusi märksõna ja ajavahemiku järgi.
Sisend: `{ keyword?, dateRelative?: "upcoming" | "past", page?, langcode?: "et" | "en" }`
Vaikeväärtused: dateRelative upcoming, page 1, langcode et.
Tagastab `{ events, total, page, pageSize, hasMore }`.

### upcoming_events
Järgmised tulevased sündmused, sorteeritud algusaja järgi.
Sisend: `{ limit?, langcode?: "et" | "en" }` (limit vaikimisi 10).

### get_event
Üksiku sündmuse täisinfo, mis tõmmatakse otse selle avalikult eesti.ai lehelt
(kogu kirjeldus, mitte ainult nimekirja sissejuhatus).
Sisend: `{ url }` — sündmuse `url`, mille tagastavad `search_events` või
`upcoming_events` (peab olema `https://eesti.ai/...` leht).
Tagastab `{ title, summary, description, dateTime, location, registration, imageUrl, url }`
(`registration` sisaldab teadet nagu "Kohad on täitunud", kui üritus on täis; muidu tühi).

Iga tööriist tagastab nii struktureeritud JSON-andmed kui ka lühikese
tekstilise kokkuvõtte.

Märkus `langcode` kohta: eesti.ai lõpp-punktid sisaldavad ainult eestikeelseid
andmeid. `langcode: "en"` on lubatud edasise ühilduvuse jaoks, kuid tagastab
alati tühja tulemuse, seega kasuta vaikeväärtust `"et"`.

## Kohalik käivitamine

Käivita server oma masinas kas Node'i või Dockeriga. Mõlemad pakuvad sama MCP
lõpp-punkti striimitava HTTP kaudu serveri juurest, tavaliselt
`http://localhost:8787/`.

### Node'iga

#### Eeldused

- Node.js 20 või uuem.

#### Samm-sammuline juhend

1. Klooni repositoorium ja liigu sinna.

   ```bash
   git clone <repo-url> eesti-ai-events-mcp
   cd eesti-ai-events-mcp
   ```

2. Paigalda sõltuvused.

   ```bash
   npm install
   ```

3. Käivita ühiktestid, et veenduda kõige toimimises.

   ```bash
   npm test
   ```

4. Käivita server. See käivitab Workeri kohalikult workerd abil, Cloudflare'i
   kontot pole vaja.

   ```bash
   npm run dev
   ```

   Wrangler trükib kohaliku URL-i, tavaliselt `http://localhost:8787`.

5. Tee kiire kontroll curl'iga.

   ```bash
   curl -s -X POST http://localhost:8787/ \
     -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools[].name'
   ```

   Peaksid nägema `search_events`, `upcoming_events`, `get_event`.

### Dockeriga (või Podmaniga)

#### Eeldused

- Docker või Podman (kasuta `docker compose` asemel `podman compose`).
- Hostis pole Node'i ega npm-i vaja — need töötavad konteineri sees.

#### Samm-sammuline juhend

1. Ehita ja käivita konteiner.
   - **Docker**
      ```bash
      docker compose up --build -d
      ```
   - **Podman**
      ```bash
      podman compose up --build -d
      ```

2. MCP lõpp-punkt on nüüd aadressil `http://localhost:8787/`. Testi seda sama
   curl-käsuga nagu Node'i sammudes eespool.

3. Vaata logisid käsuga `docker compose logs -f` ja peata see käsuga
   `docker compose down`.

   Hosti pordi muutmiseks redigeeri `docker-compose.yml` failis `ports`
   vastendust, näiteks `"9000:8787"`, et teenindada pordil 9000.

Märkus: konteiner käivitab `wrangler dev`, mis on arendusserver. See sobib
isiklikuks ja väikese tiimi ise majutamiseks. Avalikuks ja turvalisemaks
juurutuseks eelista allpool kirjeldatud Cloudflare'i teed.

### Kohaliku MCP-kliendi ühendamine

Suuna oma klient kohalikule serveri URL-ile `http://localhost:8787/`. Kohalik
server vajab tavaliselt veidi käsitsi seadistamist, mis on iga kliendi kohta
allpool näidatud.

> **Märkus ChatGPT kohta:** ChatGPT ei saa ühenduda kohaliku serveriga. See
> aktsepteerib ainult avalikku HTTPS-URL-i, seega `http://localhost:8787/` ei
> tööta. Serveri kasutamiseks ChatGPT-ga juuruta see esmalt (vt
> [Juuruta Cloudflare'i](#juuruta-cloudflarei)) ja ühenda avaliku `workers.dev`
> URL-i kaudu.

#### Claude Code

```bash
claude mcp add --transport http eesti-ai http://localhost:8787/
```

Seejärel kuva tööriistad käsuga `/mcp` Claude Code'i sees.

#### Cursor

Lisa see faili `.cursor/mcp.json` (projekt) või `~/.cursor/mcp.json` (globaalne):

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

Claude Desktop jõuab kohaliku HTTP-serverini `mcp-remote` silla kaudu. Ava
Settings → Developer → Edit Config, et avada `claude_desktop_config.json`.

Selles failis on tavaliselt juba muud seaded. Ära kirjuta kogu faili üle. Lisa
ainult `mcpServers` plokk. Kui sul on juba `mcpServers` plokk, lisa `eesti-ai`
kirje selle sisse ja jäta ülejäänu puutumata.

Lisatav osa:

```json
"mcpServers": {
  "eesti-ai": {
    "command": "npx",
    "args": ["mcp-remote", "http://localhost:8787/"]
  }
}
```

> **Hoiatus: ära kopeeri allolevat näidet.** See on ainult illustratsiooniks,
> näitamaks, kus `mcpServers` plokk teiste võtmete seas asub. `preferences`,
> `coworkUserFilesPath` ja muud väärtused on kohatäited. Selle kopeerimine
> kirjutab sinu päris seaded üle. Lisa oma olemasolevasse faili ainult eespool
> näidatud `mcpServers` plokk.

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

Salvesta fail ja taaskäivita Claude Desktop. eesti.ai tööriistad ilmuvad
tööriistade menüüsse.

#### MCP Inspector (testimiseks)

```bash
npx @modelcontextprotocol/inspector
```

Inspectoris vali transport "Streamable HTTP", sisesta serveri URL ja proovi
kolme tööriista.

## Juuruta Cloudflare'i

### Samm-sammuline juhend

1. Logi üks kord sisse.

   ```bash
   npx wrangler login
   ```

2. Juuruta.

   ```bash
   npm run deploy
   ```

   Wrangler näitab avaliku
   `https://eesti-ai-events-mcp.<sinu-alamdomeen>.workers.dev` URL-i. Kohandatud
   domeen on valikuline ja selle saab hiljem Cloudflare'i töölaual lisada.

### MCP-kliendi ühendamine

Juurutatud serveril on avalik `https://...workers.dev/` URL, seega enamik
kliente saab selle lisada otse oma konnektorite / integratsioonide liidese
kaudu, ilma konfiguratsioonifaile redigeerimata:

- **Claude Desktop / Claude.ai**: Settings, Connectors, Add custom connector ja
  kleebi oma `workers.dev` URL.
- **ChatGPT**: lisa kohandatud konnektorina (plaanidel, mis toetavad kaug-MCP
  konnektoreid).

Jaotise [Kohaliku MCP-kliendi ühendamine](#kohaliku-mcp-kliendi-ühendamine)
CLI- ja konfiguratsioonimeetodid töötavad samuti — kasuta lihtsalt oma
`workers.dev` URL-i `http://localhost:8787/` asemel.

## Märkused

Versioon 1 on olekuvaba Worker Cloudflare'i tasuta tasandil. See ei kasuta
Durable Objecte, seega Workers Paid plaani kulu ei teki. eesti.ai lõpp-punktid
sisaldavad ainult eestikeelseid andmeid; `langcode: "en"` on lubatud, kuid
tagastab alati tühja tulemuse.

## Litsents

MIT — vaba kasutada, muuta ja levitada, **ilma igasuguse garantiita; kasuta
omal vastutusel**. Vaata [LICENSE](LICENSE).
