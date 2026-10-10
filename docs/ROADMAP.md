# Delivery phases

## Phase 1 — Solo fun prototype

Implemented locally. Prove mobile navigation, visual discovery, furniture searches, and character comedy with a bundled fictional father through the remaining human playtests.

Human acceptance:

- A player with no gaming background can start, move, investigate, and catch without coaching.
- A first-time player finds at least one father in the first minute and understands why harder clues were discoverable.
- The commode lid, upside-down jar, giant vase, and backside whack into the sack are readable and funny at phone size.
- The short time-machine intro makes laughing, hyperactive copies feel like one ridiculous government investigation. Skip and reduced motion remain usable; replays change occupied hideouts.
- Portrait touch controls, text, and targets are usable on an actual phone. No forced rotation.
- At least a few friends want to try another hunt. Revise hiding difficulty or reactions based on what they actually do.

## Phase 2 — Local multiplayer

Add a Node HTTP API and DynamoDB Local, preserving the frontend and shared game rules. Maximum five players including the creator; name-only entry; host-controlled start; reconnectable player identity; shared seeded placements, claims, activity, and leaderboard. Each player explores independently without remote walking avatars initially.

Poll room snapshots every 500 ms while visible. The backend atomically awards the first successful claim and updates the score with the same operation; clients cannot supply their own scores. Handle retries, double claims, full rooms, disconnects, concurrent joins, and deadline boundaries. Equal top scores produce joint winners.

Room expiry is one hour after creation, independently of the three-minute round. Requests enforce deadlines using server time. Expired storage records must not grant access while waiting for database cleanup.

Gate: five real browser clients compete correctly, including races for the same father, reconnects, and interrupted network access.

## Phase 3 — Personal fathers and revenge

Personal generation was brought forward at the user’s request, ahead of multiplayer. Implemented locally: phone crop and HEIC conversion, durable jobs, one-face approval before five anchored expression edits, recoverable uploads, bounded retries, six-face and gameplay previews, body palette, private asset delivery, source deletion, 24-hour expiry, and personalized intro/hunt/replay. The intro reuses faces on animated scientist, runner, and broom-rider bodies; its laboratory background stays separate. See [the personalization contract](INTRO-ART.md). Storage and provider interfaces keep the renderer independent of SQLite, files, and OpenAI.

The development key has a persistent **$1 total** budget, enforced before each image request with conservative reservations for uncertain outcomes. The pinned image model is `gpt-image-2.5-sunburst-2026-09-08`. Automated tests use a fixture provider and do not spend money. The broader ten-photo likeness trial remains deferred under this budget; a fictional Balaji reference only verifies the integration and visual consistency, not real-person likeness.

Revenge creates a new independent hunt through the same creation flow. It never overwrites the completed room.

Remaining gate: several different real photos produce recognizable faces at gameplay size; actual phones handle upload-to-play; revenge works once shared rooms exist. Increase the trial budget only with explicit user authorization. Generation failure must leave the sample game playable.

## Phase 4 — AWS deployment

Define infrastructure in AWS CDK: S3/CloudFront for the static frontend, API Gateway/Lambda for the Node handlers, DynamoDB for shared game state, private S3 for uploaded/generated assets, and an asynchronous queue/worker for image generation. Use configuration rather than renderer changes to switch local storage and database endpoints to AWS.

Enforce room closure in application code; DynamoDB TTL is delayed physical cleanup. Add asset expiry cleanup, bounded generation retries, logs, and request/job error monitoring. Keep photo/image-service credentials on the backend.

Deploy only after local playtests establish that the game is worth replaying. Visible friend avatars and WebSockets are subsequent enhancements, not requirements for the first multiplayer hunt.
