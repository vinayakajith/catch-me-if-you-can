# Father Hunter

A very unserious hidden-object game. A desi witch-scientist puts a broom engine in a time machine. Laughing copies escape. You are the government detective with one stick, one sack, and three minutes.

## Current milestone

The local solo game now includes personal Dad generation: upload and crop a photo, approve one recognizable face, generate five additional expressions, preview him in the wardrobe and Liberty pose, then take him into the intro and hunt. The game has five rooms, twenty hiding places, 12–20 randomized targets including one broom rider, editable names, touch navigation, comic captures, results, and replay. The total cast is deliberately kept out of the story and HUD. Balaji remains a fictional sample character you can play without an API key. Multiplayer, revenge links, and AWS deployment remain later phases.

The spotlighted Liberty pose is a guaranteed easy catch. He is deadly serious, holding a flashlight and notebook in his lungi. A wall portrait is serious too. Other hiding dads laugh: tumbling in a washer, spinning in a microwave, cramped in a wardrobe, upside-down in a pickle jar, inside the commode, and elsewhere. Under the bed, only his lungi hem and legs show. Opening a container reveals its occupant without awarding a point.

Validation includes 18 core tests and 10 backend/budget tests, the production build, desktop/mobile photo-to-hunt checks, and gameplay browser checks. Upload tests use fixture images and simulate lost upload/finalization responses, refreshes, and duplicate approval. Gameplay checks cover a 320 × 568 phone, immediate spotlight discovery, background timeout, slow/missing art and keyboard focus. Actual-phone, real-person likeness, and friend playtests remain acceptance gates; automated checks do not establish whether the game is funny.

## Run locally

Use Node.js 24 or newer and npm 11 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Development binds to the local network, so a phone on the same Wi-Fi can open `http://YOUR_COMPUTER_LAN_IP:5173`. Keep the development process running while testing. These are independent solo hunts; a local network URL is not a multiplayer invite.

On macOS, your Wi-Fi address is shown in System Settings → Wi-Fi → Details → TCP/IP. Use that address on the phone; `localhost` on a phone refers to the phone itself.

### Enable personal Dad generation

Copy `.env.example` to `.env` and set `OPENAI_API_KEY` there. Keep it on the server; never use a `VITE_` secret. `npm run dev` starts both the local API on `127.0.0.1:8787` and Vite on port 5173. Vite proxies `/api`, so the same phone URL handles the upload, private previews, and game assets. `npm run dev:web` runs just the sample game; `npm run dev:server` runs just the API. Restart the API after changing `.env`.

The development key has a **$1 total allowance**, persisted in `.father-hunter/development-spend.sqlite`. Each request reserves $0.50 before it starts, then settles to reported usage. Timeouts, missing usage, and crashed requests retain the reservation. The guard can stop early when there is insufficient headroom; it never resets with a new room, job, day, or server restart. Do not delete or move the ledger while using this key. Inspect spending without making API calls:

```bash
npm run generation:cost
```

Generation uses the pinned `gpt-image-2.5-sunburst-2026-09-08` model, high quality, transparent 1024-pixel PNGs. One approved grin anchors five independent edits alongside the original photo: serious, laugh, giggle, bonked, and dizzy. Six calls normally produce a pack. Automatic correction is limited to two attempts per expression and eight attempts total; uncertain requests require an explicit retry. No image requests happen during the intro, gameplay, or replay. Prompts live in `apps/server/src/prompts.ts` and retain the person’s actual features instead of imposing the sample Balaji’s moustache or glasses.

JPG, PNG, WebP and supported HEIC/HEIF photos can be cropped, rotated, and zoomed on the phone. The browser strips metadata; the server validates and normalizes the upload again. Approval is required before the other expressions are generated. The final preview has adjustable body colour and reuses the actual game bodies. A durable receipt recovers progress after a dropped response or refresh without repeating the upload. Use the same browser/device for private job recovery.

Local source photos, generated assets, SQLite databases, and `.env` are ignored by Git. The source photo is removed when **Use this Dad** finalizes the pack. Jobs and generated packs expire 24 hours after creation; access stops immediately at expiry, and cleanup removes files while the server is running or on next startup. The spending ledger persists independently. The local API uses a private browser cookie for ownership; shared multiplayer access comes in a later phase.

## Playing

- Enter your detective name and edit the scientist’s name. Watch the invention, entrance, duplication, escape and assignment, or skip to the hunt. Loading and the intro consume no round time.
- Tap clear floor or a room on the map to walk through the house. Keyboard arrows/WASD and the optional touch joystick work too.
- Tap furniture to investigate. Open the commode lid, wardrobe and appliance doors. E and Check inspect nearby furniture.
- Tap an exposed dad. The detective walks over, extracts him, gives his covered backside one comic whack, and bags him. The visible count changes after he lands. A spotted peeker cannot duck away during the approach.
- Tap the broom rider once. He hovers in place while the detective approaches. There is no precision chase.
- The statue is an easy opening catch; other occupants shuffle among twenty places, with targets in all five rooms. Every hunt has one broom rider and 11–19 hidden dads.
- Room hints unlock after twenty seconds without a catch. The round ends at exactly three minutes or earlier if the whole cast is bagged. Time continues in background tabs and while help is open; the session also enforces a one-hour hard expiry.
- Results give your actual count and elapsed time. Replay preserves names, the personal Dad pack, and body colour while changing occupied hideouts. Return to the start page to rename the father.
- Gameplay has no dialogue bubbles or gossip feed. Sound is optional; reduced motion uses still intro scenes and quieter capture transitions. Pause/resume preserves the exact intro clock, and results wait for the final sack animation.

## Verification

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run test:characters
```

Tests use Node's built-in test runner. Core tests check all twenty interaction anchors and every pair of routes between them, 500 randomized placements, personalized story/catch names and character metadata, peek timing, remembered sightings, search/reveal/catch ordering, duplicate scoring, the exact three-minute boundary, collision-safe broom routes with 6–10 second rests, locking a moving rider, hints, and a complete hunt. Backend tests cover generation approval, idempotency, private ownership, interrupted uploads, retry limits, expiry, image normalization, source deletion, and the persistent budget cap.

The browser check starts a development server if necessary, exercises desktop and mobile interactions, and saves screenshots to ignored `artifacts/`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium installation. Set `FATHER_HUNTER_URL` to test an already-running development server. Run `FATHER_HUNTER_EDGES=1 npm run test:browser` for short-phone, spotlight approach, timeout, loading and recovery checks. For an additional art and interaction sweep, run `FATHER_HUNTER_CATALOGUE=1 npm run test:browser`: it finds deterministic seeds covering all twenty hideouts, walks to each one, inspects it, saves its rendered pose, and taps it into the sack.

`npm run test:characters` starts isolated Vite and API servers, exercising the actual HTTP proxy, cookies, and job/storage code with a fixture provider. It covers desktop and phone crop, approval, six-face preview, body colour, interrupted responses, personalized intro, hunt, and replay. It never calls OpenAI. Live image trials are separate and consume the same development allowance; they must go through the budgeted backend. A ten-photo quality trial is deferred under the $1 cap and until suitable reference portraits are available.

Live development trial, 11 October 2026: the bundled fictional Balaji reference produced all six high-quality expressions in six calls, with **$0.414157** recorded usage and no uncertain charges. The generated pack passed a phone-sized Chromium preview, finalization, intro, hunt, and source-deletion check. Expression identity and transparency were visually inspected. This validates the integration; it does not validate resemblance across real people or performance on a physical phone.

`npm run build` typechecks the application and builds the static frontend into `apps/web/dist`. `npm run preview` serves that build locally.

## Architecture

- `apps/web`: React screens, responsive HUD, Phaser house renderer, sound, and touch controls.
- `apps/server`: Fastify API, private uploads/assets, durable SQLite jobs, a serial image worker, OpenAI provider, atlas assembly, and the persistent budget ledger.
- `packages/game-core`: renderer-independent house definitions, pathfinding, deterministic placements, session state, scoring, and timing.
- `Target`: hidden-slot and broom-rider variants. Search actions take slot IDs; spot and catch actions take target IDs. Broom routes, wall-clock positions and locks live in game-core.
- `HuntSession`: session boundary for snapshots, subscriptions, movement, searches, remembered sightings, catches, and hints. The local implementation owns Phase 1. An HTTP implementation will own server-authoritative multiplayer actions later.
- `HouseDefinition`: collision geometry, doorways, decorative props, twenty hiding slots, interaction anchors, pose/crop/occlusion metadata, and seeded peek schedules.
- `CharacterPack`: name, atlas, grid dimensions, expression mapping, optional body palette, and expiry shared by the intro and hunt. A 3 × 2 atlas has six 512-pixel cells in serious/grin/laugh/giggle/bonked/dizzy order. The sample contract remains compatible.
- `JobStore`, `AssetStore`, and `ImageProvider`: boundaries for replacing SQLite/files with DynamoDB/S3 and a queued AWS worker. Durable states include upload, generation, creator approval, preview, ready, interrupted, and expired. AWS adapters and deployment infrastructure are still future work.

The sample game requires no secrets, image API, or backend. Personal generation requires the local API and a key; approved packs require that API for private assets until expiry. No AWS account is required for local development. The sample expression sheet is bundled. See [current lungi character art and exact prompt](docs/DESI-ART.md), [original Balaji reference](docs/ART.md), [detective atlas and prompt](docs/DETECTIVE-ART.md), and [intro art, exact prompt, and personalization contract](docs/INTRO-ART.md).

## Next phases

See [the roadmap and playtest gates](docs/ROADMAP.md). The next step after the prototype is a real friend playtest. Difficulty and humour require people to try the game; passing automated tests cannot establish that it is funny.

## Git workflow

Repository: https://github.com/vinayakajith/father-hunter

Make small, coherent commits and push immediately after every commit. If the environment blocks GitHub, preserve local history and report the failed push. Do not claim a checkpoint is published until the push succeeds.
