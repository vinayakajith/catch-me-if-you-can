# Catch Me If You Can rooms

A room has five seats including its creator, one named character and a one-hour lifetime. Each player has an independent house and two-minute attempts. The leaderboard compares best scores across replays. Any participant can create a separate game with a fresh invite and an empty board.

## Identity and storage

An HTTP-only, same-site browser cookie owns a seat. Only its SHA-256 digest is stored. Public hosting requires HTTPS and sets Secure cookies. Names are display labels; clearing cookies loses the seat. Reopening the same invite on the same hostname resumes the same identity. There is no account signup or recovery from another device.

`Rooms` accepts asynchronous `RoomStore`, `AssetStore` and `CharacterService` implementations. Local storage uses SQLite and private files. AWS uses DynamoDB transactions and private S3 objects. The shared rules validate movement, catches and deadlines in both environments.

DynamoDB stores separate `META`, `PLAYER`, `ATTEMPT` and `EVENT` items under each room partition. Movement updates only the caller’s attempt. Joining updates membership atomically; catches update the attempt, best score, cursor and event together. Conditional writes and bounded conflict retries prevent duplicate scores and sixth seats. A detached original snapshot makes nested checkpoint changes visible to the adapter. The recent event list is capped at 80 so expiry cleanup fits within a transaction.

The browser merges shared revisions separately from the current attempt’s start time and acknowledged command number. A delayed poll cannot replace a newer movement acknowledgement or roll a replay back into its previous attempt. Lost responses retry the same command sequence and recover saved receipts.

## HTTP contract

Mutations require `X-FH-Request: 1` and the exact configured HTTPS origin on public hosting. Room creation and attempt starts also require an idempotency key. Reusing one key with different room data returns a conflict.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/rooms` | Create a room from `characterId` or a member-owned `sourceRoomId`. |
| `GET /api/rooms/config` | Canonical public origin, or LAN address for local development. |
| `GET /api/rooms/:id` | Public invite metadata and the caller’s permitted view. |
| `POST /api/rooms/:id/join` | Reserve one of five seats with a distinct name. |
| `GET /api/rooms/:id/state?after=cursor` | State, best scores and recent catch events. |
| `POST /api/rooms/:id/attempts` | Start the caller’s two-minute attempt after intro/loading. |
| `POST /api/rooms/:id/attempts/:attemptId/resume` | Rotate the controlling-tab token; preserve the deadline. |
| `POST /api/rooms/:id/attempts/:attemptId/commands` | Ordered movement, search, spot, catch and hint commands. |
| `GET /api/rooms/:id/assets/atlas.png` | Authorize membership, then serve or briefly sign the private atlas. |

`NetworkHuntSession` predicts movement and sends pending commands every 100 ms, or immediately for an interaction. Clients supply directions and bounded time deltas, never positions or scores. Movement credit accrues using server time and caps at 300 ms. Visible clients poll every 500 ms; hidden tabs poll less often. Rate limiting and temporary conflicts cause bounded backoff. The timer keeps running during disconnections and background tabs.

## Fresh games and retention

The room’s hour starts after its character copy is ready. No attempt starts with less than two minutes remaining. Replay preserves the room’s target count and exposure mix, includes all five rooms, reshuffles occupied hideouts, and keeps the best score.

At closure, scoring and joining stop immediately. Cleanup removes active attempts and events. Final scores and member-only character artwork remain for 24 additional hours. **Create your own game** can reuse that artwork without an image call or choose another photo. Each new room owns a separate copy, one-hour window and board; deleting its parent does not delete the child.

At the end of retention, API access stops even if physical cleanup has not run yet. Local cleanup runs each minute and at startup. AWS EventBridge invokes cleanup each minute. DynamoDB TTL is a delayed fallback; the S3 three-day lifecycle bounds orphan retention during failures. A signed image URL lasts at most 60 seconds and is bounded by the room’s retention deadline. Source photos and private generation jobs are never shared with the room.

Financial records have no TTL. Neither room expiry nor job cleanup resets the image allowance.

## Verification

`test:multiplayer` covers five browser contexts, personal art, lost responses, independent catches, deadlines and fresh-game chains. `test:load` runs five HTTP players for ten minutes with SQLite. `test:aws` covers the real DynamoDB Local engine, concurrency, durable jobs, budget races and HTTP API v2 contracts. `test:load:aws` runs the same ten-minute game load through the DynamoDB adapter. All use fixtures, never paid image calls. See [AWS setup](AWS.md) and [security findings](SECURITY.md).
