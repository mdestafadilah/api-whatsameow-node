# whatsmeow-api

A RESTful WhatsApp API built on **Hono**, powered by
[`whatsmeow-node`](https://github.com/nicastelo/whatsmeow-node), with a React dashboard.
The architecture follows the [BHVR template](https://github.com/ZulfiFazhar/BHVR-Template)
(Bun · Hono · Vite · React) — N-layered backend with routes → controllers → services →
repositories, and a typed React client.

![stack](https://img.shields.io/badge/Hono-4.x-black) ![stack](https://img.shields.io/badge/React-19-blue) ![stack](https://img.shields.io/badge/whatsmeow--node-0.7.x-green)

---

## What this is

`whatsmeow-node` binds the Go [`whatsmeow`](https://github.com/tulir/whatsmeow) library
over stdin/stdout IPC. It spawns one native Go binary per client, which means:

> **This API runs as a Node/Bun process, not a Cloudflare Worker.**
> Workers have no child processes and cannot ship native binaries, so the WhatsApp
> side of this project is deliberately a long-lived server process. The BHVR
> template's layered structure and its React client are kept as-is; the runtime
> target is not.

## Features

| Area | Endpoints |
|---|---|
| **Sessions** | create, list, get, delete, status |
| **Pairing** | QR code **and** pairing code (phone number) |
| **Connection** | connect, disconnect, logout/unlink |
| **Messages** | text, media (image/video/audio/document), location, contact, poll, raw, reply, react, edit, revoke, mark read |
| **Send pacing** | human-like typing indicator + delay, four presets, per-chat cooldown |
| **Chats** | typing indicator, presence, privacy settings, blocklist, disappearing messages, status message, contact QR |
| **Contacts** | `isOnWhatsApp` check, profile picture, user info, devices, business profile |
| **Groups** | list, create, info, invite links, join/leave, settings, add/remove/promote/demote, join requests |
| **Misc** | health, pacing presets, generic IPC escape hatch, message ids, media upload/download |
| **Events** | live Server-Sent Events stream of every gateway event |

---

## Requirements

- **Node.js 20+** (the API runs under Node — see the note below)
- A WhatsApp account (a spare number is strongly advised)
- The `whatsmeow-node` native binary ships automatically via `optionalDependencies` —
  supported on Windows, macOS and Linux (x64 and arm64)

### Why the server runs under Node, not Bun

The client (`vite build`) and `bun install` work fine with Bun, but **the API server
must run under Node**. Bun 1.3.6 crashes with an internal N-API assertion failure
when loading `better-sqlite3`, and the same crash occurs during `bun install` on this
platform. `npm run dev:server` therefore uses `node scripts/run-server.mjs`, which
bundles the server with esbuild (resolving the `@/*` path alias and keeping
`better-sqlite3` external) and runs the output under Node.

You can still use Bun for everything that does not touch the native SQLite driver:

```bash
bun install          # fine
bun run dev:client   # fine
bun run test         # fine
npm run dev:server   # use this, not `bun run`
```

## Quick start

```bash
# 1. Install
npm install          # or: bun install

# 2. Configure
cp .env.example .env

# 3. Run both the API and the dashboard
npm run dev
```

- Dashboard → http://localhost:5173
- API → http://localhost:3000/api

Then click **Create**, open the session, and pair it by scanning the QR code with
*WhatsApp → Linked devices*, or use the pairing code flow with your phone number.

### Running the two processes separately

```bash
npm run dev:server   # Hono API on :3000 (esbuild watch + Node)
npm run dev:client   # Vite dev server on :5173, proxies /api → :3000
```

---

## Configuration

All settings live in `.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | API listen port |
| `HOST` | `127.0.0.1` | API bind address |
| `API_KEY` | _(empty)_ | Sent as `X-API-Key`. **Empty disables auth**; required in production |
| `DATABASE_PATH` | `./data/whatsmeow.db` | SQLite file for sessions, message log, webhooks |
| `SESSION_DIR` | `./data/sessions` | One whatsmeow store per session |
| `WHATSMEOW_COMMAND_TIMEOUT` | `30000` | IPC timeout (ms) against the Go binary |
| `PAIR_CODE_TTL` | `60` | Pairing code validity window (seconds) |

The server **refuses to boot in production without `API_KEY`** — an unauthenticated
WhatsApp account control panel is not something to expose by accident.

### Client-side API key

If you set `API_KEY`, the dashboard needs it too. Create `.env.local`:

```
VITE_API_KEY=your-key-here
```

---

## API reference

Every response uses the same envelope:

```json
{ "success": true, "message": "…", "data": { } }
```

Errors carry `success: false` and put the error code in `data.code`.

### Sessions

```bash
# Create
curl -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"label":"Support","phoneNumber":"628123456789"}'

# Pair — QR code
curl http://localhost:3000/api/sessions/<id>/qr

# Pair — pairing code
curl -X POST http://localhost:3000/api/sessions/<id>/pair-code \
  -H 'Content-Type: application/json' \
  -d '{"phoneNumber":"628123456789"}'

# Status / lifecycle
curl http://localhost:3000/api/sessions/<id>/status
curl -X POST http://localhost:3000/api/sessions/<id>/disconnect
curl -X POST http://localhost:3000/api/sessions/<id>/logout   # unlink device
```

### Messages

```bash
# Text
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Hello from the API"}'

# Image from a URL
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","type":"image","mediaUrl":"https://example.com/cat.jpg","caption":"Nice"}'

# Reply to a message
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Agreed","replyTo":"3EB0...","replyToText":"original"}'

# Location
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","type":"location","latitude":-6.2,"longitude":106.8,"locationName":"Jakarta"}'
```

`to` accepts a bare phone number (country code, no `+`) or a full JID
(`1234@g.us` for groups).

#### Send pacing (anti-ban)

Every outgoing message is paced by default. Before the message is sent the
session shows a **typing…** indicator, waits an amount of time proportional to
how long a person would need to type the text, and only then sends. Messages to
the same chat are also spaced apart by a cooldown.

Timing is deliberately random within a band — uniform intervals are themselves a
bot signal.

| Preset | Typing | Base pause | Per character | Cap | Chat cooldown |
|---|---|---|---|---|---|
| `off` | no | — | — | — | — |
| `fast` | yes | 400 ms | 12 ms | 2.5 s | 250 ms |
| `natural` *(default)* | yes | 900 ms | 45 ms | 8 s | 1.2 s |
| `cautious` | yes | 2.5 s | 80 ms | 18 s | 4 s |

Pass a preset, or override individual knobs, per request:

```bash
# Use a preset
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Hello","pacing":{"preset":"cautious"}}'

# Send immediately — no typing indicator, no delay
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Hello","pacing":{"preset":"off"}}'

# Fine-grained control
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Hello","pacing":{"preset":"fast","maxDelayMs":1500,"chatCooldownMs":0}}'
```

Omit `pacing` entirely to accept the `natural` default. The available presets are
also readable at `GET /api/pacing`, which is what the dashboard's composer uses
so its controls cannot drift from the server's timing model.

Two implementation notes worth knowing:

- **Pacing runs inside a per-chat queue.** Concurrent requests to the same chat
  are serialised, so the cooldown is actually enforced rather than measured
  independently by each request — which would defeat the point.
- **The typing indicator is best-effort.** If the presence receipt fails, the
  message is still sent. The indicator is a courtesy; the message is the point.

### Groups, contacts, chats

```bash
curl http://localhost:3000/api/sessions/<id>/groups
curl -X POST http://localhost:3000/api/sessions/<id>/groups \
  -H 'Content-Type: application/json' \
  -d '{"name":"Team","participants":["628111","628222"]}'

curl -X POST http://localhost:3000/api/sessions/<id>/contacts/check \
  -H 'Content-Type: application/json' \
  -d '{"phones":["628123456789"]}'

# Typing indicator
curl -X POST http://localhost:3000/api/sessions/<id>/chats/typing \
  -H 'Content-Type: application/json' \
  -d '{"chat":"628123456789","state":"composing"}'
```

### Live events (SSE)

```bash
curl -N http://localhost:3000/api/events
curl -N 'http://localhost:3000/api/events?sessionId=<id>&events=message,session:status'
```

Events: `session:qr`, `session:pair-code`, `session:status`, `session:connected`,
`session:disconnected`, `session:logged-out`, `session:error`, `message`,
`message:receipt`, `presence`, `call`.

### Escape hatch

Any whatsmeow IPC method can be invoked directly when no REST endpoint exists:

```bash
curl -X POST http://localhost:3000/api/sessions/<id>/misc/call \
  -H 'Content-Type: application/json' \
  -d '{"method":"getNewsletterInfo","args":{"jid":"123@newsletter"}}'
```

---

## Architecture

```
src/
├── api/                    # Hono backend
│   ├── index.ts            # app assembly, middleware, error handler
│   ├── sessions/           # route → controller → service
│   ├── messages/
│   ├── chats/
│   ├── contacts/
│   ├── groups/
│   ├── misc/
│   ├── middlewares/        # apiKeyAuth
│   └── utils/response.ts   # response envelope
├── lib/whatsapp/           # the gateway
│   ├── clientManager.ts    # one Go subprocess per session
│   ├── eventBus.ts         # in-process event fan-out
│   ├── messages.ts         # proto payload building
│   └── messageLogger.ts    # inbound persistence
├── database/               # Drizzle + SQLite
│   ├── db.ts
│   ├── schema.ts
│   └── repositories/
├── routes/                 # React pages (TanStack Router, file-based)
├── services/               # client-side API layer
├── components/
├── types/
└── server.ts               # bootstrap
```

**Request flow:** route → controller (parse/shape) → service (business logic) →
repository (data) → response envelope.

### Session lifecycle

```
create → clientManager.ensure()
       → init()                    # reads the on-disk store
       → already paired ?  connect() → "connected"
       → not paired      ? getQRChannel() → connect() → "pairing"
                         → qr / pairCode events
                         → "connected"
```

One `createClient()` call = one Go subprocess. `disconnect()` keeps the process
alive (whatsmeow auto-reconnects); `destroy()` and `removeStore()` free it.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | API + dashboard together |
| `npm run dev:server` | Hono API with esbuild watch (Node) |
| `npm run dev:client` | Vite dev server |
| `npm run build` | Type-check + build client + bundle server |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | `tsc -b` across both projects |
| `npm run db:push` | Push the Drizzle schema to SQLite |
| `npm run db:studio` | Drizzle Studio |

---

## Verification

Verified end to end on Windows 11 (Node 22.22.2):

- `npm test` — 51 unit tests pass
- `npm run typecheck` — clean across both TS projects
- `npm run build` — client and server bundles emit
- Server boots, `/api/sessions/health` returns `ok`
- Creating a session spawns the Go binary; `/qr` returns a real 277-character
  `wa.me/settings/linked_devices#…` pairing string
- Dashboard driven in a real browser (Edge over CDP): session created through the
  form, QR rendered at 240×240 from the live server, both pairing flows visible,
  console clean, session deleted through the UI
- Send pacing measured, not just asserted: `off` makes zero presence calls and
  returns in 0 ms, while `natural` sends `composing → paused` around a ~0.7 s pause
  for a short message and a ~4.4 s pause for a 120-character one. The dashboard's
  preset chips were driven in a real browser and the description updates when a
  preset is selected

---

## Security & operational notes

- **Auth is off by default.** Set `API_KEY` before exposing this beyond localhost.
  The server enforces this in production.
- **Session stores are live credentials.** `data/` is gitignored. Anyone with
  `data/sessions/*.db` can act as the linked account — treat it like a password,
  and pair a spare number rather than a personal one.
- **Anti-ban guidance.** WhatsApp rate-limits unofficial clients; accounts *can* be
  banned. Every send is paced by default (see
  [Send pacing](#send-pacing-anti-ban)): a typing indicator, a proportional pause,
  and a per-chat cooldown. That reduces the risk but does not remove it — avoid bulk
  blasts on a freshly paired number, and watch for `stream_error` /
  `keep_alive_timeout` / `temporary_ban` events. The API surfaces these on the event
  stream but does not stop sending on your behalf.
- **`logged_out` is terminal.** When a user unlinks the device from their phone, the
  store is invalidated and the session must be re-paired from scratch.
- **Not affiliated with WhatsApp.** This uses an unofficial client library, which may
  violate WhatsApp's Terms of Service. Use at your own risk.

---

## License

MIT for this project. `whatsmeow-node` is MIT; `whatsmeow` is MPL-2.0.
