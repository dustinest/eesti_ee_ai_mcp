# eesti.ai sündmuste MCP-server

Kaugjuurdepääsuga, ainult lugemiseks mõeldud MCP-server, mis pakub Eesti
eesti.ai algatuse (praktilised AI töötoad ja kokkusaamised) sündmusi
MCP-klientidele nagu Claude Desktop, Claude Code, Cursor ja ChatGPT. Server
katab avaliku vportal.ee otsingu-API. Versioonil 1 autentimist ei ole.

See töötab olekuvaba Cloudflare Workerina (tasuta tasandil, ilma Durable
Objectiteta) ning seda saab soovi korral ka ise Dockeris majutada, kui sa ei
taha Cloudflare'i kasutada.

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
Üksik sündmus tema kanoonilise id järgi.
Sisend: `{ id }`. Otsib esmalt tulevaste ja seejärel möödunud sündmuste seast
ning leiab vaste id järgi.

Iga tööriist tagastab nii struktureeritud JSON-andmed kui ka lühikese
tekstilise kokkuvõtte.

Märkus `langcode` kohta: eesti.ai lõpp-punktid sisaldavad ainult eestikeelseid
andmeid. `langcode: "en"` on lubatud edasise ühilduvuse jaoks, kuid tagastab
alati tühja tulemuse, seega kasuta vaikeväärtust `"et"`.

## Eeldused

- Node.js 20 või uuem (kohalikuks arenduseks), või
- Docker (ise majutatava konteineri jaoks).

Lõpp-punkt suhtleb MCP protokolli kaudu üle striimitava HTTP. URL on serveri
juur, näiteks `http://localhost:8787/`.

## Seadistus: käivita kohalikult Node'iga

Samm-sammult:

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

## Seadistus: käivita Dockeris (ise majutatud)

See variant vajab ainult Dockerit. See käivitab konteineris sama Workeri
kohalikult, nii et Cloudflare'i kontot ega kuutasu pole vaja.

1. Ehita ja käivita konteiner.

   ```bash
   docker compose up --build
   ```

2. MCP lõpp-punkt on nüüd aadressil `http://localhost:8787/`. Testi seda sama
   curl-käsuga nagu eespool.

3. Peata see Ctrl-C-ga või käivita taustal `docker compose up -d` ning peata
   hiljem `docker compose down`.

Hosti pordi muutmiseks redigeeri `docker-compose.yml` failis `ports`
vastendust, näiteks `"9000:8787"`, et teenindada pordil 9000.

Märkus: konteiner käivitab `wrangler dev`, mis on arendusserver. See sobib
isiklikuks ja väikese tiimi ise majutamiseks. Avalikuks ja turvalisemaks
juurutuseks eelista allpool kirjeldatud Cloudflare'i juurutusteed.

## Ühenda MCP-klient

Suuna oma klient serveri URL-ile. Kasuta `http://localhost:8787/` kohaliku või
Dockeri jaoks või oma juurutatud `https://...workers.dev/` URL-i Cloudflare'i
variandi jaoks.

### Claude Code

```bash
claude mcp add --transport http eesti-ai http://localhost:8787/
```

Seejärel kuva tööriistad käsuga `/mcp` Claude Code'i sees.

### Cursor

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

### Claude Desktop

Claude Desktop ühendub kaugjuurdepääsuga HTTP-serveritega `mcp-remote` silla
kaudu. Ava Settings, Developer, Edit Config, et avada
`claude_desktop_config.json`.

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

Konteksti mõttes näeb terve konfiguratsioonifail koos selle plokiga umbes nii
välja. Sinu teised võtmed erinevad, seega jäta enda omad alles ja lisa ainult
`mcpServers`:

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

### MCP Inspector (testimiseks)

```bash
npx @modelcontextprotocol/inspector
```

Inspectoris vali transport "Streamable HTTP", sisesta serveri URL ja proovi
kolme tööriista.

## Juuruta Cloudflare'i (valikuline)

1. Logi üks kord sisse.

   ```bash
   npx wrangler login
   ```

2. Juuruta.

   ```bash
   npm run deploy
   ```

   Wrangler trükib avaliku
   `https://eesti-ai-events-mcp.<sinu-alamdomeen>.workers.dev` URL-i. Kasuta
   seda URL-i ülaltoodud kliendi konfiguratsioonis. Kohandatud domeen on
   valikuline ja selle saab hiljem Cloudflare'i töölaual lisada.

## Märkused

Versioon 1 on olekuvaba Worker Cloudflare'i tasuta tasandil. See ei kasuta
Durable Objecte, seega Workers Paid plaani kulu ei teki. eesti.ai lõpp-punktid
sisaldavad ainult eestikeelseid andmeid; `langcode: "en"` on lubatud, kuid
tagastab alati tühja tulemuse.

PS! Tegu on masintõlkega esialgsest skoobist.