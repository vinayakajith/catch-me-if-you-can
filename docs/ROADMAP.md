# Delivery phases

## Phase 1 — Solo fun prototype

Implemented locally. Prove mobile navigation, visual discovery, furniture searches, and character comedy with a bundled fictional father through the remaining human playtests.

Human acceptance:

- A player with no gaming background can start, move, investigate, and catch without coaching.
- A first-time player finds at least one father in the first minute and understands why harder clues were discoverable.
- The commode lid, upside-down jar, giant vase, and wooden head bonk into the sack are readable and funny at phone size.
- The short time-machine intro makes laughing, hyperactive copies feel like one ridiculous government investigation. Skip and reduced motion remain usable; replays change occupied hideouts.
- Portrait touch controls, text, and targets are usable on an actual phone. No forced rotation.
- At least a few friends want to try another hunt. Revise hiding difficulty or reactions based on what they actually do.

## Phase 2 — Local multiplayer

Implemented with a local Node HTTP API and SQLite persistence behind an asynchronous room-storage interface. Maximum five agents including the creator, name-only join, a shareable LAN invite, reconnectable cookie identity, independent houses/catches, and each agent’s own two-minute timer. Start after loading and the intro, without waiting for other players. Replays preserve the best score and reshuffle a fair cast with the same count and exposure mix.

Visible clients poll every 500 ms. The server validates ordered movement and interaction commands, records catch receipts, and atomically updates the agent’s best score and friend notification. Lost replies and duplicates award once; different players can both catch their own copy. Equal best scores share a rank. A replacement tab rotates the controller token; the old tab cannot keep scoring.

Rooms close one hour after creation. No new two-minute attempt starts when less than two minutes remain. Room art becomes inaccessible immediately at closure and cleanup removes it; the invite retains final scores for 24 more hours. Requests use server deadlines, independently of physical database cleanup.

Desktop shows the board beside the house. Mobile, including landscape, shows it after each attempt. Catch notifications are plain text. The house renders up to 2× device density, with touch coordinates and camera scaling adjusted together. The agent wears a suit and sunglasses and uses a giant wooden hammer on the head before the sack animation.

Automated gate: five isolated browser players, simultaneous independent catches, personal artwork sharing, full-room rejection, real two-minute rounds, lost responses, refresh/reconnect, late replies, best-score replay, expiry, and a ten-minute five-agent HTTP test. Human gate remaining: five friends on actual phones find the flow and comedy worth replaying.

## Phase 3 — Personal fathers and revenge

Personal generation was brought forward at the user’s request, ahead of multiplayer. Implemented locally: phone crop and HEIC conversion, durable jobs, one-face approval before five anchored expression edits, recoverable uploads, bounded retries, six-face and gameplay previews, body palette, private asset delivery, source deletion, 24-hour expiry, and personalized intro/hunt/replay. The intro reuses faces on animated scientist, runner, and broom-rider bodies; its laboratory background stays separate. See [the personalization contract](INTRO-ART.md). Storage and provider interfaces keep the renderer independent of SQLite, files, and OpenAI.

The development key has a persistent **$1 total** budget, enforced before each image request with conservative reservations for uncertain outcomes. The pinned image model is `gpt-image-2.5-sunburst-2026-09-08`. Automated tests use a fixture provider and do not spend money. The broader ten-photo likeness trial remains deferred under this budget; a fictional Balaji reference only verifies the integration and visual consistency, not real-person likeness.

Revenge remains the next product phase, as requested: each participant can become a creator and invite the next group of up to five. It creates a new independent hunt through the creation flow and never overwrites a completed room. The normal creation flow already works; the chained revenge entry and sharing experience are still to build.

Remaining gate: several different real photos produce recognizable faces at gameplay size; actual phones handle upload-to-play; the revenge chain works across completed rooms. Increase the trial budget only with explicit user authorization. Generation failure must leave the sample game playable.

## Phase 4 — AWS deployment

Define infrastructure in AWS CDK: S3/CloudFront for the static frontend, API Gateway/Lambda for the Node handlers, DynamoDB for shared game state, private S3 for uploaded/generated assets, and an asynchronous queue/worker for image generation. Use configuration rather than renderer changes to switch local storage and database endpoints to AWS.

Enforce room closure in application code; DynamoDB TTL is delayed physical cleanup. Add asset expiry cleanup, bounded generation retries, logs, and request/job error monitoring. Keep photo/image-service credentials on the backend.

Deploy only after local playtests establish that the game is worth replaying. Visible friend avatars and WebSockets are subsequent enhancements, not requirements for the first multiplayer hunt.
