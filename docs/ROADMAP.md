# Delivery phases

## Phase 1 — Solo fun prototype

The current implementation milestone. Prove mobile navigation, visual discovery, furniture searches, and character comedy with a bundled fictional father.

Human acceptance:

- A player with no gaming background can start, move, investigate, and catch without coaching.
- A first-time player finds at least one father in the first minute and understands why harder clues were discoverable.
- The commode lid, upside-down jar, giant vase, and scoop into the sack are readable and funny at phone size.
- A quick case brief makes the six copies feel like one ridiculous investigation. Replays change the story and occupied hideouts.
- Portrait touch controls, text, and targets are usable on an actual phone. No forced rotation.
- At least a few friends want to try another hunt. Revise hiding difficulty or reactions based on what they actually do.

## Phase 2 — Local multiplayer

Add a Node HTTP API and DynamoDB Local, preserving the frontend and shared game rules. Maximum five players including the creator; name-only entry; host-controlled start; reconnectable player identity; shared seeded placements, claims, activity, and leaderboard. Each player explores independently without remote walking avatars initially.

Poll room snapshots every 500 ms while visible. The backend atomically awards the first successful claim and updates the score with the same operation; clients cannot supply their own scores. Handle retries, double claims, full rooms, disconnects, concurrent joins, and deadline boundaries. Equal top scores produce joint winners.

Room expiry is one hour after creation, independently of the ten-minute round. Requests enforce deadlines using server time. Expired storage records must not grant access while waiting for database cleanup.

Gate: five real browser clients compete correctly, including races for the same father, reconnects, and interrupted network access.

## Phase 3 — Personal fathers and revenge

Add photo upload, father name, asynchronous image-generation jobs, progress, retryable failures, and creator preview. Generate a recognizable consistent CharacterPack with all six expressions; animate expression assets in the game engine. Uploads and generated assets sit behind a storage interface backed by local files during development.

Revenge creates a new independent hunt through the same creation flow. It never overwrites the completed room.

Gate: several different photos produce recognizable faces at gameplay size; the upload-to-play and revenge flows work on phones. Agree the image provider, generation budget, and retention period when implementing this phase.

## Phase 4 — AWS deployment

Define infrastructure in AWS CDK: S3/CloudFront for the static frontend, API Gateway/Lambda for the Node handlers, DynamoDB for shared game state, private S3 for uploaded/generated assets, and an asynchronous queue/worker for image generation. Use configuration rather than renderer changes to switch local storage and database endpoints to AWS.

Enforce room closure in application code; DynamoDB TTL is delayed physical cleanup. Add asset expiry cleanup, bounded generation retries, logs, and request/job error monitoring. Keep photo/image-service credentials on the backend.

Deploy only after local playtests establish that the game is worth replaying. Visible friend avatars and WebSockets are subsequent enhancements, not requirements for the first multiplayer hunt.
