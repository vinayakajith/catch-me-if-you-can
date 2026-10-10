# Room architecture

The local API runs behind Vite’s same-origin `/api` proxy. A room contains at most five players, including its creator. Each player has an independent house and two-minute attempt. The leaderboard compares best scores across attempts during the room’s one-hour lifetime.

## Identity and storage

An HTTP-only, same-site cookie identifies a browser. Only its SHA-256 digest is stored with players. Names are display labels, not authentication. Clearing the cookie loses that player’s seat; changing hostname creates a different browser identity. The five-seat cap applies for the invite’s lifetime.

`Rooms` owns the application rules and accepts a `RoomStore`, `AssetStore`, and clock. The local room adapter uses SQLite with WAL, a busy timeout, private file permissions, and versioned conditional writes. A change reloads and retries on a revision conflict. Membership, a confirmed catch, the best score, and its event are saved together. The interface permits asynchronous storage so a future DynamoDB adapter need not change the game or renderer.

The aggregate stores a bounded recent event list and action receipts, plus each player’s latest attempt checkpoint. Checkpoints include target layout, reveals, sightings, movement, claims, timestamps, and hint cooldown. Restart restores deadlines and confirmed scores. A replay replaces only that player’s attempt and keeps their best score.

Creating a room from a ready character copies its atlas into room storage. The creator’s source photo and generation job remain private. Joined players can read the room atlas; anonymous visitors can only read the invite’s public metadata while the room is open.

## HTTP contract

Mutations require the same-origin action header. Creation and starting an attempt also require an idempotency key, so retrying a lost response reuses the original operation.

| Endpoint | Purpose |
| --- | --- |
| `POST /api/rooms` | Create an invite and reserve the host’s seat. |
| `GET /api/rooms/config` | Select the LAN invite origin; environment override supported. |
| `GET /api/rooms/:id` | Read room metadata and the caller’s permitted view. |
| `POST /api/rooms/:id/join` | Atomically reserve a seat with a distinct name. |
| `GET /api/rooms/:id/state?after=cursor` | Poll state and catch events newer than the cursor. |
| `POST /api/rooms/:id/attempts` | Start the caller’s two-minute attempt after intro/loading. |
| `POST /api/rooms/:id/attempts/:attemptId/resume` | Rotate the controller token and resume the same deadline. |
| `POST /api/rooms/:id/attempts/:attemptId/commands` | Apply an ordered batch of movement and interaction commands. |
| `GET /api/rooms/:id/assets/atlas.png` | Read the shared character as a room member. |

`NetworkHuntSession` predicts local movement, sends batches every 100 ms or immediately for an interaction, then reconciles server state. The server accepts directions and bounded time deltas, never supplied positions or scores. Movement credit accrues with server wall time and caps at 300 ms. Sequence numbers and saved action receipts prevent duplicate catches after a lost reply. A short, bounded visibility allowance lets a peeking face duck during the network trip; scoring deadlines remain strict.

Visible clients poll every 500 ms; hidden tabs poll less frequently. Stale revisions are ignored. Scores animate into the sack only after confirmation. An outstanding catch receipt and the final capture animation settle before results appear. Disconnects freeze controls while time continues; reconnect retries pending commands. Resuming in another tab invalidates the previous controller token.

## Time and cleanup

The room’s hour starts after its character copy is ready. Each player starts independently and has at most 120 seconds. Every replay retains the room’s selected target count and visible/search/peek mix, includes all five rooms, a spotlight statue, and a broom rider, and changes its placement signature.

No attempt starts with less than two minutes remaining in the room. At one hour, mutation and asset routes deny access even before cleanup. Cleanup removes room art and active checkpoints; final best scores remain readable through the invite for 24 additional hours. After that, requests deny access and cleanup deletes the record. Startup and the running cleanup interval both enforce retention. The separate development image-spending ledger is never removed by room or job cleanup.

## AWS handoff

The frontend uses relative API and asset paths, and shared game rules have no Phaser dependency. AWS work can replace room conditional writes with a durable adapter, files with private S3 objects, and the image worker with an asynchronous queue. Static hosting, routing, scheduled cleanup, server adapter, deployment configuration, and cloud performance validation still need implementation. This phase deploys no AWS resources.

Run `npm run test:multiplayer` for five real browser contexts and fault injection. Run `npm run test:load` for ten minutes of five concurrent HTTP agents; the measured report stays in ignored `artifacts/`. Both use fixture images and temporary storage, with no paid image requests.
