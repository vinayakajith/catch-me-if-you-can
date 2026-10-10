# Catch Me If You Can

A very unserious hidden-object game. An old witch in violet is making a potion. Her idiot assistant wanders into the time machine, and laughing copies of him escape into the house. You play the furious witch: one enormous wooden hammer, one sack, two minutes.

## Current milestone

The local game includes personal character generation: upload and crop a photo, approve one recognizable face, generate five additional expressions, preview him in the wardrobe and Liberty pose, then take him into the intro and hunt. The game has five rooms, twenty hiding places, 12–20 randomized targets including one broom rider, editable names, touch navigation, comic captures, results, and replay. The total cast is deliberately kept out of the story and HUD. Balaji remains a fictional sample character you can play without an API key. Five-player rooms are now implemented locally. A creator shares one invite; each player explores their own shuffled house on their own two-minute timer. Best scores and friend catches update live. Every player can create a fresh invite from results, reusing the character or uploading someone else. Full serverless AWS adapters and infrastructure are implemented and tested locally; actual AWS deployment and domain setup are the next phase.

The spotlighted Liberty pose is a guaranteed easy catch. He is deadly serious, holding a flashlight and notebook in his lungi. A wall portrait is serious too. Other hiding dads laugh: tumbling in a washer, spinning in a microwave, cramped in a wardrobe, upside-down in a pickle jar, inside the commode, and elsewhere. Under the bed, only his lungi hem and legs show. Opening a container reveals its occupant without awarding a point.

Validation includes rule/backend/browser-transport tests, DynamoDB Local concurrency and recovery tests, infrastructure assertions, a Linux Lambda runtime check, desktop/mobile browser flows, five concurrent browser players, and a ten-minute HTTP load check. Network checks include lost creation/catch responses, reconnects, duplicate requests, refreshes, and deadlines. Actual-phone, real-person likeness, and friend playtests remain acceptance gates; automated checks do not establish whether the game is funny.

## Run locally

Use Node.js 24 or newer and npm 11 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Development binds to the local network, so a phone on the same Wi-Fi can open `http://YOUR_COMPUTER_LAN_IP:5173`. Keep the development process running while testing. Choose **Create hunt**, then copy the `/r/...` invite from the room page. The invite uses the computer’s LAN address when one is available. Up to five agents, including the creator, can join from that link without signing up. **Play solo** remains available.

These links work on the same Wi-Fi while the local servers run. They are not public internet links. If automatic address selection picks the wrong network adapter, set `FATHER_HUNTER_SHARE_ORIGIN=http://YOUR_COMPUTER_LAN_IP:5173` in `.env` and restart the API. Keep using the same hostname on each device so its private player cookie is preserved.

On macOS, your Wi-Fi address is shown in System Settings → Wi-Fi → Details → TCP/IP. Use that address on the phone; `localhost` on a phone refers to the phone itself.

### Enable personal character generation

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` there. Keep it on the server; never use a `VITE_` secret. `npm run dev` starts both the local API on `127.0.0.1:8787` and Vite on port 5173. Vite proxies `/api`, so the same phone URL handles the upload, private previews, and game assets. `npm run dev:web` runs just the sample game; `npm run dev:server` runs just the API. Restart the API after changing `.env`.

The development key has a **$1 total allowance**, persisted in `.father-hunter/development-spend.sqlite`, anchored to the repository root independently of the launch directory. Each request reserves $0.20 before it starts, then settles to reported usage; this is a buffer, not the price per image. Eight measured requests cost $0.062117–$0.070414 each. The buffer applies to the enforced request profile: dated GPT Image 2.5 model, high/medium quality, one 1024-pixel output, at most two 1024-pixel references, and at most 4096 prompt bytes. [Official OpenAI documentation](https://developers.openai.com/api/docs/guides/image-generation#cost-and-latency) gives the token rates; actual response usage is recorded for settlement. Timeouts, missing usage, and crashed requests retain their original reservation amounts, including older $0.50 reservations. The guard can stop early when there is insufficient headroom; it never resets with a new room, job, day, or server restart. A budget pause preserves completed faces and redraw allowances; when headroom is available again, retry resumes only missing expressions. Do not delete or move the ledger while using this key. Inspect spending without making API calls:

```bash
npm run generation:cost
```

Generation uses the pinned `gpt-image-2.5-sunburst-2026-09-08` model, high quality, transparent 1024-pixel PNGs. One approved grin anchors five independent edits alongside the original photo: serious, laugh, giggle, bonked, and dizzy. Six calls normally produce a pack. Automatic correction is limited to two attempts per expression and eight attempts total; uncertain requests require an explicit retry. No image requests happen during the intro, gameplay, or replay. Prompts live in `apps/server/src/prompts.ts` and retain the person’s actual features instead of imposing the sample Balaji’s moustache or glasses.

JPG, PNG, WebP and supported HEIC/HEIF photos can be cropped, rotated, and zoomed on the phone. The browser strips metadata; the server validates and normalizes the upload again. Approval is required before the other expressions are generated. The final preview has adjustable body colour and reuses the actual game bodies. A durable receipt recovers progress after a dropped response or refresh without repeating the upload. Use the same browser/device for private job recovery.

Local source photos, generated assets, SQLite databases, and `.env` are ignored by Git. The source photo is removed when **Use [name]** finalizes the pack. Jobs and generated packs expire 24 hours after creation; access stops immediately at expiry, and cleanup removes files while the server is running or on next startup. The spending ledger persists independently. The local API uses a private browser cookie for ownership. Creating a room copies the approved atlas into room storage; joined players can access that copy through the additional 24-hour results window and reuse it for a new game. New rooms own independent copies. Original photos and private generation jobs are never shared.

## Playing

- Enter your player name and edit the assistant’s name. Watch the potion, forbidden entrance, duplication, escape and the witch’s response, or skip to the hunt. Loading and the intro consume no round time.
- Tap clear floor or a room on the map to walk through the house. Keyboard arrows/WASD and the optional touch joystick work too.
- Tap furniture to investigate. Open the commode lid, wardrobe and appliance doors. E and Check inspect nearby furniture.
- Tap an exposed copy. The witch walks over, extracts him, gives his head one comic bonk with a giant wooden hammer, and bags him. The visible count changes after he lands. A spotted peeker cannot duck away during the approach.
- Tap the broom rider once. He hovers in place while the witch approaches. There is no precision chase.
- The statue is an easy opening catch; other occupants shuffle among twenty places, with targets in all five rooms. Every hunt has one broom rider and 11–19 hidden dads.
- Room hints unlock after twenty seconds without a catch. The round ends at exactly two minutes or earlier if the whole cast is bagged. Time continues in background tabs and while help is open; the session also enforces a one-hour hard expiry.
- Results give your actual count and elapsed time. Replay preserves names, the personal character pack, and body colour while changing occupied hideouts. **Create your own game** makes a separate one-hour invite and empty leaderboard. Reuse the same artwork without an image call, or choose another photo.
- Friend catches appear as brief plain text. The desktop leaderboard sits beside the house; on mobile it appears only after the attempt finishes, including in landscape. Sound is optional; reduced motion uses still intro scenes and quieter capture transitions. Pause/resume preserves the exact intro clock, and results wait for the final sack animation.

## Multiplayer rules

- Five seats including the host, with a distinct agent name per seat. The same browser resumes the same player. Joining is atomic even when several people arrive together.
- Each agent has an independent house, catches, and two-minute attempt. Two friends can both catch their own statue. Everyone shares the chosen character, cast size, difficulty mix, and live board.
- Loading and the intro do not use attempt time. Each replay reshuffles occupied hideouts while keeping the same mix and all five rooms. The spotlight statue and broom rider are always present.
- Movement, catches, scores, and deadlines are checked by the server. Repeated commands cannot add points or duplicate notifications. During a connection failure, movement freezes while the timer continues. Refresh resumes the confirmed sack and original deadline; another tab must take control explicitly.
- The board stores each agent’s best score across replays. Ties share a rank. A lower replay score cannot erase a personal best.
- The invite closes one hour after creation. No new attempt can start with less than two minutes left. Scoring stops at closure; final scores and member-only artwork stay available for 24 more hours. Members can reuse that artwork for a fresh invite. Access then stops and cleanup deletes the room copies and records. The hour does not restart when someone joins, refreshes, or replays.


## Verification

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:characters
npm run test:multiplayer
npm run test:load
npm run test:aws       # Docker: local DynamoDB only
npm run test:load:aws  # ten minutes, five players on DynamoDB Local
npm run build:aws
npm run test:lambda    # Docker: official Lambda Node 24 runtime
npm run test:infra
npm run infra:synth    # no deployment
npm run security:check
npm audit --audit-level=high
```

Tests use Node's built-in test runner. Core tests check all twenty interaction anchors and every pair of routes between them, 500 randomized placements, personalized story/catch names and character metadata, peek timing, remembered sightings, search/reveal/catch ordering, duplicate scoring, the exact two-minute boundary, collision-safe broom routes with 6–10 second rests, locking a moving rider, hints, and a complete hunt. Backend tests cover generation approval, idempotency, private ownership, interrupted uploads, retry limits, expiry, image normalization, source deletion, and the persistent budget cap. Room tests cover concurrent seat limits, independent catches, action receipts, movement limits, tab takeover, database restart, personal asset sharing, preserved best scores, and one-hour/24-hour expiry boundaries.

The browser check starts a development server if necessary, exercises desktop and mobile interactions, and saves screenshots to ignored `artifacts/`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium installation. Set `FATHER_HUNTER_URL` to test an already-running development server. Run `FATHER_HUNTER_EDGES=1 npm run test:browser` for short-phone, spotlight approach, timeout, loading and recovery checks. For an additional art and interaction sweep, run `FATHER_HUNTER_CATALOGUE=1 npm run test:browser`: it finds deterministic seeds covering all twenty hideouts, walks to each one, inspects it, saves its rendered pose, and taps it into the sack.

`npm run test:characters` starts isolated Vite and API servers, exercising the actual HTTP proxy, cookies, and job/storage code with a fixture provider. It covers desktop and phone crop, approval, six-face preview, body colour, interrupted responses, personalized intro, hunt, and replay. It never calls OpenAI. Live image trials are separate and consume the same development allowance; they must go through the budgeted backend. A ten-photo quality trial is deferred under the $1 cap and until suitable reference portraits are available.

Live development trial, 11 October 2026: the bundled fictional Balaji reference produced all six high-quality expressions in six calls, with **$0.414157** recorded usage and no uncertain charges. The generated pack passed a phone-sized Chromium preview, finalization, intro, hunt, and source-deletion check. Expression identity and transparency were visually inspected. This validates the integration; it does not validate resemblance across real people or performance on a physical phone.

`npm run test:multiplayer` starts five isolated Chromium browser contexts (including two emulated iPhones) against a fixture API. It exercises a personalized invite, a sixth-player rejection, simultaneous catches, live scores and notices, lost responses, offline recovery, refresh, mobile landscape, real two-minute rounds, a final catch whose reply arrives after the deadline, replay, and room closure. Set `FATHER_HUNTER_MULTIPLAYER_SMOKE=1` to skip the full deadline wait and exercise leaving a timed-out hunt while an action remains unconfirmed offline.

`npm run test:load` runs five HTTP agents for ten minutes with movement/catch batches every 100 ms and room polling every 500 ms. It validates accepted catch totals, persistent best scores, replay, and notification delivery; saves local latency measurements to ignored `artifacts/multiplayer-load-sqlite.json`; and requires API p95 below 250 ms and peer update p95 below one second. Use `FATHER_HUNTER_LOAD_SECONDS=15` for a short smoke check. Both multiplayer scripts use temporary databases and fixture images, without loading the development key or paid image provider. Local measurements are not an AWS capacity claim.

Local five-agent load result, 11 October 2026: **35,642 requests, zero failures, 425 accepted catches, and 20 completed attempts** in ten minutes. API latency was **8.32 ms p95 / 12.31 ms p99**; other agents observed catches within **460 ms p95**. Gameplay and photo browser checks were also running on the same computer. This measures the local service, not physical-phone networking or AWS.

DynamoDB Local five-player load, 11 October 2026: **34,804 requests, zero failures, 300 catches and 20 completed attempts** in ten minutes. API latency was **85.11 ms p95 / 139.44 ms p99**; peer notices were **516 ms p95**. See [the security review](docs/SECURITY.md) for scope and [the AWS guide](docs/AWS.md) for deployment and live checks.

`npm run build` typechecks the application and builds the static frontend into `apps/web/dist`. `npm run preview` serves that build locally.

## Architecture

- `apps/web`: React screens, responsive HUD, Phaser house renderer, sound, and touch controls.
- `apps/server`: Fastify API, private uploads/assets, durable SQLite rooms and jobs, a serial image worker, OpenAI provider, atlas assembly, and the persistent budget ledger.
- `packages/game-core`: renderer-independent house definitions, pathfinding, deterministic placements, session state, scoring, and timing.
- `Target`: hidden-slot and broom-rider variants. Search actions take slot IDs; spot and catch actions take target IDs. Broom routes, wall-clock positions and locks live in game-core.
- `HuntSession`: session boundary for snapshots, subscriptions, movement, searches, remembered sightings, catches, and hints. The local implementation powers solo play. `NetworkHuntSession` predicts movement, batches ordered commands, and reconciles against authoritative room snapshots and catch receipts.
- `HouseDefinition`: collision geometry, doorways, decorative props, twenty hiding slots, interaction anchors, pose/crop/occlusion metadata, and seeded peek schedules.
- `CharacterPack`: name, atlas, grid dimensions, expression mapping, optional body palette, and expiry shared by the intro and hunt. A 3 × 2 atlas has six 512-pixel cells in serious/grin/laugh/giggle/bonked/dizzy order. The sample contract remains compatible.
- `RoomStore`, `CharacterService`, `JobStore`, `AssetStore`, and `ImageProvider`: boundaries with local SQLite/files and AWS DynamoDB/S3/SQS implementations. Room storage accepts asynchronous adapters and uses versioned conditional writes to keep membership, catches, best scores, and events atomic. See [room architecture](docs/ROOMS.md). Durable states include upload, generation, creator approval, preview, ready, interrupted, and expired. Cloud jobs use transactional outboxes, revision-fenced workers, lease recovery, and an atomic lifetime image budget. AWS setup is in [the deployment guide](docs/AWS.md); audit scope and remaining limits are in [the security report](docs/SECURITY.md).

Solo play with sample artwork requires no secrets, image API, or backend. Multiplayer requires the local room API. Personal generation requires the local API and a key; approved packs require that API for private assets until expiry. No AWS account is required for local development. The sample expression sheet is bundled. See [current lungi character art and exact prompt](docs/DESI-ART.md), [original Balaji reference](docs/ART.md), [witch and hammer art](docs/WITCH-ART.md), and [intro art, exact prompt, and personalization contract](docs/INTRO-ART.md).

The application and GitHub repository are named **Catch Me If You Can**. Existing `FATHER_HUNTER_*` environment variables, `fh-*` browser keys and `.father-hunter/` private storage remain compatible. In particular, renaming the app never moves or resets the development spending ledger.

## Next phases

See [the roadmap and playtest gates](docs/ROADMAP.md). The next step after the prototype is a real friend playtest. Difficulty and humour require people to try the game; passing automated tests cannot establish that it is funny.

## Git workflow

Repository: https://github.com/vinayakajith/catch-me-if-you-can

Make small, coherent commits and push immediately after every commit. If the environment blocks GitHub, preserve local history and report the failed push. Do not claim a checkpoint is published until the push succeeds.
