# Catch Me If You Can rooms

New invites use protocol 2: five seats including the host, one shared house, twenty targets, a three-second countdown and a two-minute round. Everyone marks Ready; the host starts with 2–5 connected players. First server-valid catch wins the point. A late arrival waits for the next round. The host can open another lobby while a full round still fits inside the original one-hour room.

## Controls and presentation

A lobby practice lets a newcomer tap the spotlight statue and automatically walk, catch and bag it. In the hunt, tap furniture to approach and open it, tap a visible face to approach and catch, or use the contextual Open/Catch button. The map walks through doors automatically. Keyboard and a touch joystick are optional.

Gameplay fills the viewport. Five compact witches have distinct violet, teal, orange, blue and pink outfits, short names and a YOU marker. They do not collide with each other or intercept furniture taps. Other players interpolate between movement updates. Desktop shows a compact live board; mobile shows full scores after the round. Landscape is preferred with a playable portrait fallback. Fullscreen/orientation requests happen from the local Ready gesture and may be declined by the browser. Selection, image dragging and the context menu are suppressed inside the game, while forms and invite copying remain usable.

## Identity, state and transport

An HTTP-only, SameSite=Strict cookie owns the seat. Public hosting adds Secure and exact-Origin mutation checks. Names are display labels, not accounts. Clearing cookies loses the seat.

Local development uses SQLite, private disk assets and a WebSocket server behind Vite’s `/api` proxy. AWS uses DynamoDB, private S3 and a dedicated API Gateway WebSocket Lambda. A same-origin POST issues a random single-use ticket valid for 30 seconds. Only its hash is stored. The upgrade binds the ticket to its origin, room and owner. Tickets and connections have TTLs. The current connection ID fences an old tab or delayed disconnect.

The client batches movement every 200 ms and sends interactions immediately after earlier movement is acknowledged. It predicts at most one second of unacknowledged movement; positions, reach, collision, scores and deadlines remain server-controlled. Sequence receipts make lost-response retries idempotent. Full WebSocket snapshots on hello/heartbeat repair missed events; there is no shared-game HTTP polling loop. Silent clients become unready after ten seconds; a host silent for thirty seconds transfers to the earliest connected member. A round keeps running while anyone reconnects.

DynamoDB stores `META`, `SHARED` and one `PLAYER#id` row per member. Movement changes the caller’s player row, not the shared target list. A catch transaction conditionally changes shared targets/events and that player’s score. Competing claims retry against the winning state. Events retain the latest thirty entries. Round IDs, per-player revisions and acknowledgements prevent old frames from restoring a caught target or old movement. New rounds reset scores and keep the most recent final ranking; equal scores share the win.

## HTTP and WebSocket contracts

| Endpoint or message | Purpose |
| --- | --- |
| `POST /api/rooms` with `mode: shared` | Create a new shared invite. |
| `POST /api/rooms/:id/join` | Atomically reserve a seat with a distinct name. |
| `GET /api/rooms/:id/shared` | Public invite metadata; member-only roster, artwork and round. |
| `POST /api/rooms/:id/ticket` | Issue a one-use connection ticket and endpoint. |
| WebSocket `hello`, `ping` | Recover state and maintain presence. |
| WebSocket `ready`, `start`, `rematch`, `leave` | Lobby and host controls. |
| WebSocket `input` | Ordered movement, search, spot, catch and hint commands. |
| `GET/POST /api/rooms/:id/portrait` | Check or select the caller’s room-bound game face/preset. |
| `GET /api/rooms/:id/players/:player/face` | Member-only, unexpired generated face. |

Frames are bounded to 24 KB and owner rate limits apply across sockets. The realtime Lambda has no image-provider secret or S3 privileges. Its DynamoDB privileges cover room, connection, ticket and rate-limit keys; only it can post to the game’s WebSocket connections.

## Player photos and retention

Before selecting a player portrait, the lobby says: **“We delete your original photo after processing. Your game face stays only for this room, which closes after one hour.”** Uploading is optional and never blocks Ready. One laughing head is generated and reused on all body poses and rematches. Pending or failed jobs keep the preset. Successful jobs publish the face even after the player has entered the round.

Player jobs use the existing budgeted provider and the same lifetime production allowance. They have no automatic redraw loop and cannot become reusable father packs. Raw originals are deleted after processing, including failure; abandoned uploads are cleaned up. Their expiry is the room’s original deadline, with no 24-hour extension. API access stops at that deadline, signed reads are bounded by it, and minute-based cleanup removes files. Late worker output is discarded and deleted. During outages physical deletion can lag; S3 lifecycle is the orphan fallback. Downloaded copies cannot be revoked.

Final scores and the **father’s** room artwork remain for 24 hours after closure, allowing a fresh game chain without another father-generation call. Player portraits are excluded from that reuse. Financial records never expire or reset with game cleanup.

## Compatibility and verification

Solo and old invites without `mode: shared` retain independent two-minute attempts and best scores. Their HTTP command and polling endpoints remain available. New web creations request shared mode.

`npm test` covers shared rules, five-way races, ticket replay, ownership and photo deletion. `test:aws` exercises DynamoDB Local contention, connection replacement, one-image jobs and late-output cleanup. `test:shared` uses five browsers, phone landscape/portrait, practice, 150 ms and 800 ms simulated round trips, shared catches and rematches. `test:load:shared` runs five real sockets for three minutes against DynamoDB Local with 150 ms simulated round trips; peer-update p95 must stay below 500 ms. Legacy `test:multiplayer`, `test:browser` and HTTP load checks remain. All automated generation uses fixtures. Local performance is not proof of deployed AWS capacity.
