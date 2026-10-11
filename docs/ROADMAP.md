# Catch Me If You Can delivery phases

## Implemented locally

1. **Solo game:** five rooms, twenty hiding spots, 12–20 copies, a spotlight statue, serious wall portrait, laughing appliance occupants, a flying broom, touch navigation and the wooden head bonk into the sack. The whole cast is deliberately not announced.
2. **Personal characters:** crop a photo, approve one recognizable face, generate five anchored expressions, adjust body colour, preview and play. Saved progress, bounded retries, private assets, source deletion, sample fallback and a persistent $1 development cap are implemented.
3. **Five-player rooms:** share one invite, join with a name, independent two-minute hunts, best scores across replays, live plain-text notices, desktop board and mobile results-only board. Rooms close after one hour.
4. **Witch story and fresh-game chains:** the old violet witch makes a potion while her idiot assistant enters the machine. Personal laughing copies escape; she collects her hammer and sack. Replay stays in the same room. Every participant can create a fresh invite using the retained artwork or a new photo. Room art and final scores remain for 24 hours after closure.
5. **Public serverless preparation:** DynamoDB room/job/budget/rate-limit adapters, private S3 uploads and signed reads, transactional outbox, SQS image worker, recovery and cleanup. CDK provisions the frontend, API, queues, secrets and monitoring. Production image generation defaults off with a zero allowance. No AWS resources have been deployed in this phase.

## Shared-room phase

Implemented: one shared twenty-target hunt, host-controlled lobby/countdown, visible coloured witches, WebSocket movement, one-tap practice and contextual actions, fullscreen landscape with portrait fallback, one laughing player portrait and room-bound deletion. Existing solo and independent invites remain compatible.

## Next: owner deployment of the shared-room update

Follow [the learning and deployment guide](AWS.md). The domain and existing stack are live. Review the new WebSocket resources and deploy while preserving the approved production settings. Verify five browsers in one shared round through the real domain, HTTPS cookies, direct-invite refresh, private S3 access and queue/cleanup monitoring. Use a fresh production OpenAI key and an explicitly approved budget before enabling photo generation. The development key and ledger stay local.

## Human acceptance still required

- A new player can start, walk, investigate and catch without coaching.
- The first statue catch is clear; harder hideouts reward looking rather than blind tapping.
- The commode, upside-down jar, cramped wardrobe, serious Liberty disguise and head bonk are readable and funny on an actual phone.
- The potion → forbidden machine → multiplication → escape → witch pursuit story makes sense, with usable skip and reduced-motion options.
- Several different real portraits remain recognizable at gameplay size. The fictional sample trial does not prove real-person likeness.
- Five friends on physical phones want to replay and pass a fresh invite on.

Automated tests establish behavior, recovery and timing. Humour, likeness and real mobile-network feel still need those playtests. WebSockets and visible player faces are implemented in this phase. More houses remain a later enhancement.
