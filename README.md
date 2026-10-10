# Father Hunter

A very unserious hidden-object game. Walk through a cluttered Desi house, check suspicious furniture, and find twelve copies of Balaji before the tea gets cold.

## Current milestone

Phase 1 is a local solo prototype: one five-room house, twelve seeded targets, tap-to-walk, keyboard and touch joystick controls, timed furniture searches, cartoon reactions, ten-minute rounds, results, and replay. Balaji is a fictional sample character. Multiplayer, photo uploads, generated personal fathers, revenge links, and AWS deployment belong to later phases.

The bathroom includes the signature reveal: open the commode lid, find Balaji inside the bowl, and tap him to score. Opening a hiding place does not automatically award a point.

## Run locally

Use Node.js 24 or newer and npm 11 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Development binds to the local network, so a phone on the same Wi-Fi can open `http://YOUR_COMPUTER_LAN_IP:5173`. Keep the development process running while testing. These are independent solo hunts; a local network URL is not a multiplayer invite.

On macOS, your Wi-Fi address is shown in System Settings → Wi-Fi → Details → TCP/IP. Use that address on the phone; `localhost` on a phone refers to the phone itself.

## Playing

- Enter your name and start. No account or prior gaming experience is needed.
- Tap clear floor to walk there. Tap a room on the map for automatic navigation through its doorways.
- Tap furniture to walk over and investigate. Opened containers reveal their contents.
- Tap a visible Balaji to catch him. The hunter walks closer if needed.
- WASD/arrow keys or the optional joystick also move the hunter. E and the Check button inspect nearby furniture.
- There are seven partially visible fathers and five fathers behind searchable furniture. Every room has at least two.
- A room-level hint becomes available after sixty seconds without a catch.
- Find all twelve or play until ten minutes elapse. Time continues in background tabs and while help is open.
- Replay changes hiding places. The commode always contains a father in this first house.

## Verification

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Core tests use Node's built-in test runner and need no downloaded dependencies. They check physical reachability, search/reveal/catch ordering, scoring, deadlines, collision-safe navigation, hints, and a complete hunt.

The browser check starts a development server if necessary, exercises desktop and mobile interactions, and saves screenshots to ignored `artifacts/`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium installation. Set `FATHER_HUNTER_URL` to test an already-running development server.

`npm run build` typechecks the application and builds the static frontend into `apps/web/dist`. `npm run preview` serves that build locally.

## Architecture

- `apps/web`: React screens, responsive HUD, Phaser house renderer, sound, and touch controls.
- `packages/game-core`: renderer-independent house definitions, pathfinding, deterministic placements, session state, scoring, and timing.
- `HuntSession`: session boundary for snapshots, subscriptions, movement, searches, catches, and hints. The local implementation owns Phase 1. An HTTP implementation will own server-authoritative multiplayer actions later.
- `HouseDefinition`: collision geometry, doorways, furniture, hiding slots, interaction anchors, clues, and contextual jokes.
- `CharacterPack`: a six-expression sprite atlas that can later be replaced by a generated personal father.

No secrets, external fonts, image API, AWS account, or backend service are required at runtime. The generated sample expression sheet is bundled in the project. See [art provenance and prompt](docs/ART.md).

## Next phases

See [the roadmap and playtest gates](docs/ROADMAP.md). The next step after the prototype is a real friend playtest. Difficulty and humour require people to try the game; passing automated tests cannot establish that it is funny.

## Git workflow

Repository: https://github.com/vinayakajith/father-hunter

Make small, coherent commits and push immediately after every commit. If the environment blocks GitHub, preserve local history and report the failed push. Do not claim a checkpoint is published until the push succeeds.
