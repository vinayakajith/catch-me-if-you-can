# Catch Me If You Can security review

Reviewed 11 October 2026. Scope: local application, public API boundaries, browser flows, AWS infrastructure changes, repository history and generated bundles. This is an engineering review with automated adversarial tests, not a third-party penetration test of a deployed site.

## Pre-publication credential audit, 14 October 2026

The owner requested that the GitHub repository be made public after checking for credentials and secrets. Remote branches and tags were fetched before the audit. The project scanner passed across 135 current files, 521 reachable history blobs, and 14 built files, including an exact check against the configured development key without printing it.

An independent Gitleaks 8.30.1 scan detected no secrets in all 66 commits, an exported copy of the tracked tree, the built frontend, commit metadata, or logs from all 24 completed GitHub Actions runs. The development key was also checked against the downloaded logs and commit metadata; no matches were found. Audit downloads and reports stayed outside Git.

GitHub had only the main branch, no tags, releases, pull requests, issues, wiki, discussions, Actions artifacts, repository secrets, or repository variables. The active CI run uses fixtures and has no deployment credentials. Local `.env`, uploaded photos, spending ledgers, and shutdown artifacts remain ignored. AWS remains offline; publishing the source does not authorize a new deployment. These results describe the checked contents, rather than a guarantee that scanners can identify every possible secret.

## Findings and changes

| Area | Result and protection |
| --- | --- |
| Credentials | No key matches in reachable Git history, tracked/current source or built web/server bundles. The scanner also checks the configured development key without printing it. `.env`, photos and ledgers are ignored. |
| OpenAI access | Key use stays in server code. Only the AWS image worker receives the secret ARN/read permission. The HTTP Lambda never loads it. Production generation defaults off with budget zero. |
| Public mutations | Exact HTTPS Origin plus a custom action header, Secure/HTTP-only/SameSite=Strict owner cookie, bounded names and bodies. No wildcard API CORS. |
| Gateway access | The HTTP gateway requires the private CloudFront origin header; rate limits trust its generated viewer address. The direct WebSocket gateway instead requires an exact Origin and a single-use 30-second ticket issued to a cookie-owned room member. Ticket hashes are consumed atomically and never logged. |
| Rate/cost abuse | Room creation: 20/session/hour and 100/IP/hour. Photos: 10/session/day, 30/IP/day, 20 globally/day. Other API calls: 1,800/session/minute. DynamoDB counters are atomic; Gateway throttles and Lambda concurrency bound initial throughput. |
| Financial races | DynamoDB transactions reserve money before a provider call, reject repeated request IDs and settle once. Uncertain requests retain reservations. Financial records never expire with rooms/jobs. Twenty concurrent reservations against $1 permit at most five $0.20 reservations. |
| Provider failures | Quota/access errors have sanitized copy and a five-minute cooldown. Known rejections release reserves; uncertain errors retain them. Bounded temporary retries, saved partial faces and sample fallback avoid trapping players. |
| Job dispatch/crashes | Transactional outbox prevents a lost queue send from losing a job. Revision checks prevent duplicate generation. Saved outputs can recover after lease expiry; unknown outcomes pause. Cleanup failure after a completed face cannot roll back that face. |
| Uploads | Cropped metadata-free browser JPEG plus independent server decoding, size/dimension limits, exact-key signed POST, digest and ETag verification. Arbitrary URLs are not fetched as input. |
| Private artwork | Cookie-owned jobs and member-only room art. Private S3 buckets, server-side encryption, TLS and short signed GETs. Original photos never appear in room responses. Child rooms own their copies. |
| Expiry | One-hour scoring/joins enforced on each mutation, regardless of cleanup timing. Member artwork/results retain 24 more hours. Scheduled cleanup plus S3 orphan lifecycle. Partial S3 delete failures are retried rather than silently accepted. |
| Multiplayer integrity | New shared rounds use atomic first-claim transactions, separate player movement rows, server time/collision/reach, round IDs, command receipts and connection fencing. Only the host can start/rematch; ready players share one timer. Old independent invites retain their original protocol. |
| Player portraits | One laughing image through the same budgeted provider. Room-bound expiry, member-only face routes, no raw-source read or father-pack reuse, deletion after processing/failure, and rejection/deletion of late worker output. Player faces receive no 24-hour retention extension. |
| WebSocket abuse | 24 KB input cap, ordered bounded batches, owner limits across connections, ticket replay rejection and short-lived connection records. The dedicated Lambda has no provider secret or S3 privileges; DynamoDB access is restricted to game/connection/limit key prefixes. |
| Browser output | Names render as text. The SVG body template accepts only a validated hex skin colour. Production CSP, no-sniff, frame denial, HSTS and no-referrer headers apply through CloudFront. |
| Browser recovery | Stale polls cannot roll back acknowledgements/replays. S3 completion can recover without a second upload/job. Temporary rate limits retain commands and reconnect with backoff. |

## Evidence

Run `npm test`, `test:aws`, `test:infra`, `test:lambda`, `test:multiplayer`, `test:shared`, `test:load:shared`, `test:characters`, `security:check`, and `npm audit --audit-level=high`. CI runs fixture checks without AWS credentials or an OpenAI key. Credential findings print locations only, never matched values.

Earlier independent-room HTTP load, 11 October 2026: 600 seconds, **34,804 requests, zero failures, 300 catches, 20 completed attempts**. API p95 85.11 ms, p99 139.44 ms; peer notices p95 516 ms. Browser tests and build work also ran on the same machine. These numbers are local evidence, not deployed AWS capacity measurements.

Shared WebSocket load, 11 October 2026: 180 seconds, five real sockets against DynamoDB Local with 150 ms simulated RTT, **4,217 responses, zero failures, 38 catches across two rounds**. Peer movement p95 was **278 ms** over 9,436 samples; response p95 was 268 ms. The test requires peer p95 below 500 ms. These figures are local measurements; repeat a five-phone check after deployment.


Live AWS shared-room verification, 11 October 2026: **4,401 responses, zero failed commands, 38 catches across 2 rounds** with five concurrent clients over 182 seconds. Response p95 was **189 ms** and peer-update p95 was **198 ms** over 8,823 samples. The test observed one handled late callback error; it did not lose a command or disconnect a player. The full five-browser two-minute game also passed with zero browser exceptions, including mobile results, refresh and rematch. Tests used sample artwork and made no paid image requests. These are measured runs, not a latency guarantee for every device or network.

The history scan covers reachable Git objects, not private chat transcripts, deleted remote repositories or every third-party system. A key previously shared in chat should be replaced for production. There were no additional paid image calls in this implementation phase.

## Boundaries to verify at deployment

- The owner authorized deployment on 11 October 2026. Five independent browsers passed a real two-minute game through CloudFront, the custom HTTPS domain and the authenticated AWS WebSocket endpoint, including catches, refresh, mobile results and rematch. Real paid image generation and its S3 upload path were not repeated; image workflows, ownership and expiry were verified with fixtures. See [AWS.md](AWS.md) for repeatable live checks.
- Signed images are bearer URLs during their short validity; authorized players can save or screenshot images. Expiry cannot revoke copies already downloaded.
- Anonymous cookies provide session ownership, not verified identity. Names can be impersonated across rooms. Clearing cookies loses access; there is no account recovery flow.
- The browser necessarily receives hidden-object positions for rendering. Server validation blocks invalid movement/claims, but a modified client can automate discovery. This is a friends’ game, not an anti-cheat system.
- Application limits and Gateway throttles reduce abuse, but do not cap total AWS infrastructure charges or defeat distributed botnets. Review billing and traffic before wider promotion; add edge bot controls if actual traffic warrants them.
- Physical deletion can lag access expiry during outages. Private S3 lifecycle is a three-day fallback for orphan files. Deleting a retained production table or changing a spending ceiling requires an explicit operational decision.
