# API Reference

Complete reference for the `whatsmeow-api` REST surface.

- **Base URL** — `http://localhost:3000/api`
- **Format** — JSON in, JSON out (`Content-Type: application/json`)
- **Auth** — optional `X-API-Key` header (see [Authentication](#authentication))

---

## Response envelope

Every response — success or failure — uses the same three-field envelope. A client
can branch on `success` without looking at the HTTP status.

```json
{
  "success": true,
  "message": "Session created successfully",
  "data": { "id": "a3319c2e-…", "label": "Support line", "status": "pairing" }
}
```

On failure, `data` carries the error code (and details, when the service supplies
them):

```json
{
  "success": false,
  "message": "Session not found.",
  "data": { "code": "NOT_FOUND" }
}
```

### Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | A required field is missing or malformed |
| `UNAUTHORIZED` | 401 | Missing or wrong `X-API-Key` |
| `NOT_FOUND` | 404 | No such session, group, or message |
| `CONFLICT` | 409 | The session is already in the requested state |
| `GATEWAY_ERROR` | 502 | The underlying whatsmeow binary rejected the call |
| `INTERNAL_ERROR` | 500 | Unhandled server error (message is hidden in production) |

A request to an unmounted path returns `404` with
`"The requested endpoint does not exist."`

---

## Authentication

Auth is controlled by the `API_KEY` environment variable.

| `API_KEY` | Behaviour |
|---|---|
| empty / unset | **Auth disabled.** Every request is accepted |
| set | Requests must send `X-API-Key: <key>` |

```bash
curl -H 'X-API-Key: your-key' http://localhost:3000/api/sessions
```

The server **refuses to boot** when `NODE_ENV=production` and `API_KEY` is empty.

Three paths stay reachable without a key so uptime checks and the dashboard's
connection indicator work before auth is configured: `GET /name`, and health
probing. Everything else is behind the middleware.

---

## Endpoint index

### Server-level

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/name` | Service name |
| `GET` | `/sessions/health` | Health, uptime, session counts, Redis status |
| `GET` | `/pacing` | Send-pacing presets and throttled-chat count |
| `GET` | `/queue` | Queue depth and counters across all sessions |
| `GET` | `/events` | Server-Sent Events stream |

### Sessions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/sessions` | List all sessions |
| `POST` | `/sessions` | Create a session |
| `GET` | `/sessions/:id` | One session |
| `DELETE` | `/sessions/:id` | Delete a session and its store |
| `GET` | `/sessions/:id/status` | Live status detail |
| `GET` | `/sessions/:id/qr` | Pairing QR (deep link) |
| `POST` | `/sessions/:id/pair-code` | Pairing code by phone number |
| `POST` | `/sessions/:id/connect` | Connect |
| `POST` | `/sessions/:id/disconnect` | Disconnect, keep the session |
| `POST` | `/sessions/:id/logout` | Unlink the device (terminal) |

### Messages — `/sessions/:id/messages`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/` | Send a message (any type) |
| `GET` | `/` | Message log |
| `GET` | `/chats` | Chats with last-message time and counts |
| `POST` | `/read` | Mark messages read |
| `POST` | `/reactions` | React to a message |
| `POST` | `/edit` | Edit a sent message |
| `POST` | `/revoke` | Revoke (delete for everyone) |

### Chats — `/sessions/:id/chats`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/typing` | Typing indicator |
| `POST` | `/presence` | Presence ("available"/"unavailable") |
| `POST` | `/presence/subscribe` | Subscribe to a contact's presence |
| `GET` | `/privacy` | Read privacy settings |
| `PUT` | `/privacy` | Update privacy settings |
| `GET` | `/privacy/status` | Status-privacy settings |
| `GET` | `/blocklist` | Read the blocklist |
| `PUT` | `/blocklist` | Block / unblock |
| `PUT` | `/disappearing` | Default disappearing-message timer |
| `PUT` | `/disappearing/chat` | Per-chat disappearing timer |
| `PUT` | `/status-message` | Set the account status message |
| `GET` | `/qr` | The account's own contact QR |
| `POST` | `/qr/resolve` | Resolve someone else's contact QR |

### Contacts — `/sessions/:id/contacts`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/check` | `isOnWhatsApp` for a list of numbers |
| `POST` | `/info` | User info |
| `POST` | `/devices` | Linked devices |
| `GET` | `/picture` | Profile picture |
| `GET` | `/business` | Business profile |

### Groups — `/sessions/:id/groups`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Joined groups |
| `POST` | `/` | Create a group |
| `GET` | `/info` | Group metadata |
| `PUT` | `/` | Update name / topic |
| `GET` | `/invite-link` | Get the invite link |
| `GET` | `/preview` | Preview a group from an invite link |
| `POST` | `/join` | Join via invite link |
| `POST` | `/leave` | Leave |
| `PUT` | `/participants` | Add / remove / promote / demote |
| `GET` | `/requests` | Pending join requests |
| `POST` | `/requests` | Approve / reject join requests |

### Misc — `/sessions/:id/misc`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Per-session gateway health |
| `GET` | `/queue` | This session's queued messages (oldest first) |
| `POST` | `/queue/drain` | Drain this session's queue now |
| `POST` | `/call` | Invoke any raw whatsmeow IPC method |
| `POST` | `/message-id` | Generate a message id |
| `POST` | `/media/upload` | Encrypt and upload media, return the descriptor |
| `POST` | `/media/download` | Download and decrypt media |

---

## Sessions

### Create

`POST /sessions`

| Field | Type | Required | Notes |
|---|---|---|---|
| `label` | string | no | Shown in the dashboard. Defaults to `Session <id8>` |
| `phoneNumber` | string | no | Digits only; non-digits are stripped |

Creating a session **boots its gateway process and reads the on-disk store**. If
that store is already paired, the session connects immediately and comes back as
`connected`; otherwise it returns as `pairing` and you should fetch `/qr`.

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H 'Content-Type: application/json' \
  -d '{"label":"Support","phoneNumber":"628123456789"}'
```

### List / get / delete

```bash
curl http://localhost:3000/api/sessions
curl http://localhost:3000/api/sessions/<id>
curl -X DELETE http://localhost:3000/api/sessions/<id>
```

Deleting a session also purges its **queue**, its scheduler state, and its cache
entries — the store is live credentials, so removal is thorough.

### Session object

| Field | Type | Notes |
|---|---|---|
| `id` | string | UUID |
| `label` | string | Display name |
| `phoneNumber` | string \| null | As supplied |
| `jid` | string \| null | Assigned once paired |
| `pushName` | string \| null | The account's own display name |
| `status` | string | See the lifecycle table |
| `lastError` | string \| null | Most recent gateway error |
| `createdAt` / `updatedAt` | ISO string | |
| `connectedAt` | ISO string \| null | |

`GET /sessions/:id/status` adds runtime-only fields: `qr`, `qrReceivedAt`,
`pairCode`, `pairCodeIssuedAt`, `isConnected`, `hasClient`.

### Status values

| Status | Meaning |
|---|---|
| `creating` | Process booting, store being read |
| `pairing` | Waiting for a QR scan or pairing code |
| `connected` | Live and able to send |
| `disconnected` | Session valid, transport down (auto-reconnects) |
| `logged_out` | Device unlinked — **terminal**, re-pair required |
| `error` | Boot or runtime failure; see `lastError` |

### Pairing

Both flows are supported. **QR** asks WhatsApp to show a scannable code; the
**pairing code** flow is for when the phone cannot scan.

```bash
# 1. QR — returns a wa.me deep link rendered by the dashboard as a QR image
curl http://localhost:3000/api/sessions/<id>/qr

# 2. Pairing code — the phone enters this code under Linked devices
curl -X POST http://localhost:3000/api/sessions/<id>/pair-code \
  -H 'Content-Type: application/json' \
  -d '{"phoneNumber":"628123456789"}'
```

A QR is valid for a short window; fetch it again to refresh. A pairing code is
valid for `PAIR_CODE_TTL` seconds (default 60).

### Connection lifecycle

```bash
curl -X POST http://localhost:3000/api/sessions/<id>/connect
curl -X POST http://localhost:3000/api/sessions/<id>/disconnect
curl -X POST http://localhost:3000/api/sessions/<id>/logout
```

`disconnect` keeps the session and its store — whatsmeow reconnects. `logout`
unlinks the device; the store is invalidated and the session must be paired again
from scratch.

---

## Messages

### Send

`POST /sessions/:id/messages`

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | string | yes | Phone number (no `+`) or JID (`1234@g.us`) |
| `text` | string | conditional | Required for text and captions |
| `type` | string | no | `text` (default), `image`, `video`, `audio`, `document`, `sticker`, `location`, `contact`, `poll`, `raw` |
| `mediaUrl` | string | conditional | Public URL for media types |
| `mediaPath` | string | conditional | Local path alternative to `mediaUrl` |
| `caption` | string | no | Media caption |
| `replyTo` | string | no | Quoted message id |
| `replyToText` | string | no | Quoted text shown in the reply |
| `pacing` | object | no | Override send pacing (see below) |
| `immediate` | boolean | no | **Bypass the queue** and send inline |
| `latitude` / `longitude` / `locationName` | — | conditional | For `location` |

```bash
# Text
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Hello from the API"}'

# Image with a caption
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","type":"image","mediaUrl":"https://example.com/cat.jpg","caption":"Nice"}'

# Reply
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Agreed","replyTo":"3EB0…","replyToText":"original"}'

# Location
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","type":"location","latitude":-6.2,"longitude":106.8,"locationName":"Jakarta"}'
```

#### Queued vs immediate send

When Redis is reachable, a send is **enqueued** rather than dispatched inline.
This gives durability: an accepted message survives an API restart and is sent
once the session is connected.

```json
{ "success": true, "message": "Message queued", "data": { "queued": true, "queuePosition": 3 } }
```

Set `"immediate": true` to skip the queue and wait for the real send — use it when
you need the WhatsApp message id in the response.

> **Important:** a `queued: true` response means *accepted*, not *delivered*. The
> message id is only known after the real send. Watch `/events` or poll
> `/sessions/:id/misc/queue` if you need delivery confirmation.

When Redis is **not** configured or unreachable, the send falls back to sending
directly and returns `{ "waMessageId": "…" }`. The API never fails a send just
because Redis is down.

### Message log and chats

```bash
curl 'http://localhost:3000/api/sessions/<id>/messages?limit=50'
curl http://localhost:3000/api/sessions/<id>/messages/chats
```

### Read, react, edit, revoke

```bash
curl -X POST http://localhost:3000/api/sessions/<id>/messages/read \
  -H 'Content-Type: application/json' \
  -d '{"chat":"628123456789","messageIds":["3EB0…"]}'

curl -X POST http://localhost:3000/api/sessions/<id>/messages/reactions \
  -H 'Content-Type: application/json' \
  -d '{"chat":"628123456789","messageId":"3EB0…","reaction":"👍"}'

curl -X POST http://localhost:3000/api/sessions/<id>/messages/edit \
  -H 'Content-Type: application/json' \
  -d '{"chat":"628123456789","messageId":"3EB0…","text":"corrected"}'

curl -X POST http://localhost:3000/api/sessions/<id>/messages/revoke \
  -H 'Content-Type: application/json' \
  -d '{"chat":"628123456789","messageId":"3EB0…"}'
```

Sending an empty `reaction` removes an existing one.

---

## Send pacing (anti-ban)

Every outgoing message is paced by default. Before sending, the session shows a
**typing…** indicator, waits an amount of time proportional to how long a person
would need to type the text, then sends. Messages to the same chat are spaced
apart by a cooldown.

Timing is random within a band — uniform intervals are themselves a bot signal.

| Preset | Typing | Base pause | Per character | Cap | Chat cooldown |
|---|---|---|---|---|---|
| `off` | no | — | — | — | — |
| `fast` | yes | 400 ms | 12 ms | 2.5 s | 250 ms |
| `natural` *(default)* | yes | 900 ms | 45 ms | 8 s | 1.2 s |
| `cautious` | yes | 2.5 s | 80 ms | 18 s | 4 s |

```bash
# Preset
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Hello","pacing":{"preset":"cautious"}}'

# No typing indicator, no delay
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Hello","pacing":{"preset":"off"}}'

# Fine-grained
curl -X POST http://localhost:3000/api/sessions/<id>/messages \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Hello","pacing":{"preset":"fast","maxDelayMs":1500,"chatCooldownMs":0}}'
```

Omit `pacing` to accept the `natural` default. `GET /pacing` returns the presets
the server actually uses, which is what the dashboard renders — so its controls
cannot drift from the timing model:

```json
{
  "defaultPreset": "natural",
  "activeChats": 2,
  "presets": [{ "name": "natural", "typing": true, "minDelayMs": 900, "maxDelayMs": 8000, "msPerChar": 45, "jitterRatio": 0.35, "chatCooldownMs": 1200 }]
}
```

Two implementation notes:

- **Pacing runs inside a per-chat queue.** Concurrent requests to the same chat
  are serialised, so the cooldown is genuinely enforced rather than measured
  independently by each request — which would defeat the point.
- **The typing indicator is best-effort.** If the presence receipt fails, the
  message is still sent. The indicator is a courtesy; the message is the point.

---

## Outbound queue (Redis)

When Redis is configured, sends are accepted into a durable queue and delivered by
a worker. This decouples "the API accepted your message" from "WhatsApp got it",
which is what makes bursts survive restarts and lets a disconnected session catch
up on reconnect.

### Semantics

| Property | Behaviour |
|---|---|
| **Ordering** | FIFO per session |
| **Durability** | Survives an API restart; in-flight entries are recovered on boot |
| **Retries** | Up to 3 attempts on transient errors, then marked failed |
| **Backoff** | A retried message goes to the **back** of the line, not the front |
| **Refusal** | An unpaired session is left untouched, not consumed |
| **Fail-open** | Redis down ⇒ sends go straight through; the API stays up |

Transient errors that trigger a retry: `not connected`, `disconnected`,
`timeout`, `ECONNRESET`, `socket`, `reconnect`. A permanent failure (e.g. an
invalid JID) is not retried 3 times for nothing — it settles as `failed`.

### Server-level stats

`GET /queue`

```json
{
  "enabled": true,
  "available": true,
  "sessions": [{ "sessionId": "a3319c2e-…", "pending": 3, "processing": 0, "total": 3 }],
  "pending": 3,
  "processing": 0,
  "counters": { "enqueued": 12, "sent": 9, "failed": 0, "retried": 1 },
  "lastEnqueuedAt": "2026-09-28T07:32:01.783Z",
  "draining": []
}
```

`enabled` means Redis was configured; `available` means it is also reachable.
**`enabled: true, available: false` is a degraded state, not a broken one** — read
it as "running without the queue right now".

### Per-session queue

```bash
curl 'http://localhost:3000/api/sessions/<id>/misc/queue?limit=50'
```

```json
{
  "sessionId": "a3319c2e-…",
  "depth": 3,
  "entries": [
    { "id": "…", "sessionId": "…", "jid": "628123456789@s.whatsapp.net", "type": "text", "preview": "Halo…", "status": "queued", "attempts": 0, "enqueuedAt": "2026-09-28T07:31:49.000Z" }
  ]
}
```

Entries are returned **oldest first** — the order they will be sent.

### Drain now

`POST /sessions/:id/misc/queue/drain`

```bash
curl -X POST http://localhost:3000/api/sessions/<id>/misc/queue/drain
```

```json
{ "sent": 3, "failed": 0, "retried": 0 }
```

The queue also drains automatically: on `session:connected`, and on a 5-second
sweep for any session that has work and a live client. Draining is guarded against
concurrent runs, so a manual drain and the sweep cannot double-send.

---

## Caching (Redis)

Read-heavy endpoints are served through a read-through cache to keep dashboard
polling off SQLite.

| Cache | Invalidated by |
|---|---|
| `chats` (per session, per limit) | Any send, or a new inbound message |
| `health` | TTL only |

- **TTL** — `REDIS_CACHE_TTL` seconds (default 30).
- **Keys** are namespaced: `<REDIS_PREFIX>:cache:<name>:<id>`.
- **Fail-open** — an unreachable Redis means a cache miss and a database read,
  never an error.

Deleting a session clears its cache entries outright.

---

## Live events (SSE)

`GET /events` streams every gateway event as it happens.

```bash
curl -N http://localhost:3000/api/events
curl -N 'http://localhost:3000/api/events?sessionId=<id>&events=message,session:status'
```

Filter with `sessionId` and/or a comma-separated `events` list.

| Event | Fires when |
|---|---|
| `session:qr` | A new QR code is available |
| `session:pair-code` | A pairing code was issued |
| `session:status` | Status changed |
| `session:connected` | Pairing completed / reconnected |
| `session:disconnected` | Transport dropped |
| `session:logged-out` | Device unlinked (terminal) |
| `session:error` | Gateway error |
| `message` | Inbound message received |
| `message:receipt` | Delivery / read receipt |
| `presence` | Contact presence update |
| `call` | Incoming call |

Events are also what drives the queue: `session:connected` triggers a drain.

---

## Escape hatch

Any whatsmeow IPC method can be called directly when no REST endpoint exists:

```bash
curl -X POST http://localhost:3000/api/sessions/<id>/misc/call \
  -H 'Content-Type: application/json' \
  -d '{"method":"getNewsletterInfo","args":{"jid":"123@newsletter"}}'
```

`method` is the exact whatsmeow-node method name; `args` is passed through
untouched. Useful for covering gaps without waiting for a typed endpoint — but
prefer a real endpoint when one exists, since the REST routes add validation and
persistence.

---

## Health

```bash
curl http://localhost:3000/api/sessions/health
```

```json
{
  "status": "ok",
  "uptimeSeconds": 412,
  "nodeVersion": "v22.22.2",
  "platform": "win32-x64",
  "sessions": { "total": 1, "live": 1, "connected": 0 },
  "redis": { "enabled": true, "available": true }
}
```

> Health is mounted at **`/api/sessions/health`**, not `/api/health`. It is
> registered before the `/sessions/:id` router so the literal path is not
> captured as a session id.

---

## Operational notes

- **Auth is off by default.** Set `API_KEY` before exposing this beyond localhost.
- **Session stores are live credentials.** Anyone with `data/sessions/*.db` can
  act as the linked account. Treat like a password; pair a spare number.
- **`logged_out` is terminal.** Re-pairing from scratch is the only recovery.
- **Anti-ban.** WhatsApp rate-limits unofficial clients and accounts *can* be
  banned. Pacing reduces the risk but does not remove it — avoid bulk blasts on a
  freshly paired number, and watch for `stream_error` / `keep_alive_timeout` /
  `temporary_ban` on the event stream.
- **Not affiliated with WhatsApp.** This uses an unofficial client library, which
  may violate WhatsApp's Terms of Service.
