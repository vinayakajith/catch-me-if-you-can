# Father Hunter

A very unserious hidden-object game. A desi witch-scientist puts a broom engine in a time machine. Laughing copies escape. You are the government detective with one stick, one sack, and three minutes.

## Current milestone

Phase 1 is a local solo prototype: a five-room house, twenty hiding places, 12–20 randomized targets including one catchable broom rider, a clear five-scene intro, editable scientist name, touch navigation, comic captures, results, and replay. The total cast is deliberately kept out of the story and HUD. Balaji is a fictional sample character. Multiplayer, photo uploads, personal generation, revenge links, and AWS deployment remain later phases.

The spotlighted Liberty pose is a guaranteed easy catch. He is deadly serious, holding a flashlight and notebook in his lungi. A wall portrait is serious too. Other hiding dads laugh: tumbling in a washer, spinning in a microwave, cramped in a wardrobe, upside-down in a pickle jar, inside the commode, and elsewhere. Under the bed, only his lungi hem and legs show. Opening a container reveals its occupant without awarding a point.

Verification includes deterministic rules, physical routes to every hideout, browser input and rendered captures. Actual-phone and friend playtests remain the next gate; automated checks do not establish whether the game is funny.

## Run locally

Use Node.js 24 or newer and npm 11 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Development binds to the local network, so a phone on the same Wi-Fi can open `http://YOUR_COMPUTER_LAN_IP:5173`. Keep the development process running while testing. These are independent solo hunts; a local network URL is not a multiplayer invite.

On macOS, your Wi-Fi address is shown in System Settings → Wi-Fi → Details → TCP/IP. Use that address on the phone; `localhost` on a phone refers to the phone itself.

## Playing

- Enter your detective name and edit the scientist’s name. Watch the invention, entrance, duplication, escape and assignment, or skip to the hunt. Loading and the intro consume no round time.
- Tap clear floor or a room on the map to walk through the house. Keyboard arrows/WASD and the optional touch joystick work too.
- Tap furniture to investigate. Open the commode lid, wardrobe and appliance doors. E and Check inspect nearby furniture.
- Tap an exposed dad. The detective walks over, extracts him, gives his covered backside one comic whack, and bags him. The visible count changes after he lands. A spotted peeker cannot duck away during the approach.
- Tap the broom rider once. He hovers in place while the detective approaches. There is no precision chase.
- The statue is an easy opening catch; other occupants shuffle among twenty places, with targets in all five rooms. Every hunt has one broom rider and 11–19 hidden dads.
- Room hints unlock after twenty seconds without a catch. The round ends at exactly three minutes or earlier if the whole cast is bagged. Time continues in background tabs and while help is open; the session also enforces a one-hour hard expiry.
- Results give your actual count and elapsed time. Replay preserves names and changes occupied hideouts. Return to the start page to rename the father.
- Gameplay has no dialogue bubbles or gossip feed. Sound is optional; reduced motion uses still intro scenes and quieter capture transitions. Pause/resume preserves the exact intro clock, and results wait for the final sack animation.

## Verification

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Core tests use Node's built-in test runner and need no downloaded dependencies. They check all twenty interaction anchors and every pair of routes between them, 500 randomized placements, personalized story/catch names and character metadata, peek timing, remembered sightings, search/reveal/catch ordering, duplicate scoring, the exact three-minute boundary, collision-safe broom routes with 6–10 second rests, locking a moving rider, hints, and a complete hunt.

The browser check starts a development server if necessary, exercises desktop and mobile interactions, and saves screenshots to ignored `artifacts/`. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium installation. Set `FATHER_HUNTER_URL` to test an already-running development server. For an additional art and interaction sweep, run `FATHER_HUNTER_CATALOGUE=1 npm run test:browser`: it finds deterministic seeds covering all twenty hideouts, walks to each one, inspects it, saves its rendered pose, and taps it into the sack.

`npm run build` typechecks the application and builds the static frontend into `apps/web/dist`. `npm run preview` serves that build locally.

## Architecture

- `apps/web`: React screens, responsive HUD, Phaser house renderer, sound, and touch controls.
- `packages/game-core`: renderer-independent house definitions, pathfinding, deterministic placements, session state, scoring, and timing.
- `Target`: hidden-slot and broom-rider variants. Search actions take slot IDs; spot and catch actions take target IDs. Broom routes, wall-clock positions and locks live in game-core.
- `HuntSession`: session boundary for snapshots, subscriptions, movement, searches, remembered sightings, catches, and hints. The local implementation owns Phase 1. An HTTP implementation will own server-authoritative multiplayer actions later.
- `HouseDefinition`: collision geometry, doorways, decorative props, twenty hiding slots, interaction anchors, pose/crop/occlusion metadata, and seeded peek schedules.
- `CharacterPack`: name, atlas, grid dimensions, and expression mapping shared by the intro and hunt. The sample can later be replaced by a generated personal father.

No secrets, external fonts, image API, AWS account, or backend service are required at runtime. The generated sample expression sheet is bundled in the project. See [current lungi character art and exact prompt](docs/DESI-ART.md), [original Balaji reference](docs/ART.md), [detective atlas and prompt](docs/DETECTIVE-ART.md), and [intro art, exact prompt, and personalization contract](docs/INTRO-ART.md).

## Next phases

See [the roadmap and playtest gates](docs/ROADMAP.md). The next step after the prototype is a real friend playtest. Difficulty and humour require people to try the game; passing automated tests cannot establish that it is funny.

## Git workflow

Repository: https://github.com/vinayakajith/father-hunter

Make small, coherent commits and push immediately after every commit. If the environment blocks GitHub, preserve local history and report the failed push. Do not claim a checkpoint is published until the push succeeds.
