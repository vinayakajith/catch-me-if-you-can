# Father Hunter

A very unserious hidden-object game. Walk through a cluttered Desi house, check suspicious furniture, and bag six hyperactive copies of a dad who should never have built a time machine.

## Current milestone

Phase 1 is a local solo prototype: one five-room house, six targets selected from twenty hideouts, an illustrated detective, automatic sack captures, a skippable three-scene time-machine intro, editable scientist name, tap-to-walk, keyboard and touch controls, ten-minute rounds, results, and replay. Balaji is a fictional sample character. Multiplayer, photo uploads, generated personal fathers, revenge links, and AWS deployment belong to later phases.

Hideouts include an upside-down dad in a pickle jar, a giant flower vase, a zipped sofa cushion, a washing machine, and the commode bowl behind its lid. Each hunt contains a different selection; the commode is no longer guaranteed. Opening a hiding place does not automatically award a point.

Validation status: twenty core tests, the production build, and complete desktop/mobile-emulation playthroughs pass. Browser checks cover personalized intro names, pause, replay, reduced motion, intro timing, six catches, sack completion before results, replay resets, the touch joystick, map, help, and portrait/landscape rotation. The additional catalogue sweep also reaches, reveals, and bags a dad in every one of the twenty hideouts. Physical-phone and friend playtests remain the next gate.

## Run locally

Use Node.js 24 or newer and npm 11 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Development binds to the local network, so a phone on the same Wi-Fi can open `http://YOUR_COMPUTER_LAN_IP:5173`. Keep the development process running while testing. These are independent solo hunts; a local network URL is not a multiplayer invite.

On macOS, your Wi-Fi address is shown in System Settings → Wi-Fi → Details → TCP/IP. Use that address on the phone; `localhost` on a phone refers to the phone itself.

## Playing

- Enter your detective name and edit the scientist’s name if you like. Watch Dad test his time machine and six idiots escape, then choose **Grab the sack. Start hunt.** You can skip straight to the hunt. The timer waits for you and for the house to load.
- Tap clear floor to walk there. Tap a room on the map for automatic navigation through its doorways.
- Tap furniture to walk over and investigate. Opened containers reveal their contents.
- Tap a visible dad. Your detective walks closer, grabs him, and scoops him into a growing sack. A tapped peeker stays spotted even if his peek would otherwise end.
- WASD/arrow keys or the optional joystick also move the hunter. E and the Check button inspect nearby furniture.
- Six dads per hunt: three peeking and three inside searchable objects, across at least four rooms, with at most two per room. Peeks last about two seconds with three to four seconds hidden; checking furniture can expose a peeker too.
- A room-level hint becomes available after sixty seconds without a catch.
- Find all six or play until ten minutes elapse. Time continues in background tabs and while help is open.
- Replay keeps the scientist and changes hiding places. No consecutive hunt has the same set of hiding places. Return to the start page to change the name.
- There are no mid-game dialogue bubbles or gossip feed. Only brief controls, requested hints, essential errors, and visual capture reactions. Results wait for the last dad to land in the sack.
- Sound is optional. The intro has pause and skip controls. Reduced motion follows your system preference or the animation toggle; the intro becomes manually advanced still scenes, and the hunt uses fades with the same discovery and scoring rules.

## Verification

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Core tests use Node's built-in test runner and need no downloaded dependencies. They check all twenty interaction anchors and every pair of routes between them, 500 randomized placements, personalized story/catch names and character metadata, peek timing, remembered sightings, search/reveal/catch ordering, duplicate scoring, deadlines, collision-safe navigation, hints, and a complete hunt.

The browser check starts a development server if necessary, exercises desktop and mobile interactions, and saves screenshots to ignored `artifacts/`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium installation. Set `FATHER_HUNTER_URL` to test an already-running development server. For an additional art and interaction sweep, run `FATHER_HUNTER_CATALOGUE=1 npm run test:browser`: it finds deterministic seeds covering all twenty hideouts, walks to each one, inspects it, saves its rendered pose, and taps it into the sack.

`npm run build` typechecks the application and builds the static frontend into `apps/web/dist`. `npm run preview` serves that build locally.

## Architecture

- `apps/web`: React screens, responsive HUD, Phaser house renderer, sound, and touch controls.
- `packages/game-core`: renderer-independent house definitions, pathfinding, deterministic placements, session state, scoring, and timing.
- `HuntSession`: session boundary for snapshots, subscriptions, movement, searches, remembered sightings, catches, and hints. The local implementation owns Phase 1. An HTTP implementation will own server-authoritative multiplayer actions later.
- `HouseDefinition`: collision geometry, doorways, decorative props, twenty hiding slots, interaction anchors, pose/crop/occlusion metadata, and seeded peek schedules.
- `CharacterPack`: name, atlas, grid dimensions, and expression mapping shared by the intro and hunt. The sample can later be replaced by a generated personal father.

No secrets, external fonts, image API, AWS account, or backend service are required at runtime. The generated sample expression sheet is bundled in the project. See [Balaji art and prompt](docs/ART.md), [detective atlas and prompt](docs/DETECTIVE-ART.md), and [intro art, exact prompt, and personalization contract](docs/INTRO-ART.md).

## Next phases

See [the roadmap and playtest gates](docs/ROADMAP.md). The next step after the prototype is a real friend playtest. Difficulty and humour require people to try the game; passing automated tests cannot establish that it is funny.

## Git workflow

Repository: https://github.com/vinayakajith/father-hunter

Make small, coherent commits and push immediately after every commit. If the environment blocks GitHub, preserve local history and report the failed push. Do not claim a checkpoint is published until the push succeeds.
