# Catch Me If You Can security review

Reviewed 11 October 2026. Scope: local application, public API boundaries, browser flows, proposed AWS infrastructure, repository history and generated bundles. This is an engineering review with automated adversarial tests, not a third-party penetration test of a deployed site.

## Findings and changes

| Area | Result and protection |
| --- | --- |
| Credentials | No key matches in reachable Git history, tracked/current source or built web/server bundles. The scanner also checks the configured development key without printing it. `.env`, photos and ledgers are ignored. |
| OpenAI access | Key use stays in server code. Only the AWS image worker receives the secret ARN/read permission. The HTTP Lambda never loads it. Production generation defaults off with budget zero. |
| Public mutations | Exact HTTPS Origin plus a custom action header, Secure/HTTP-only/SameSite=Strict owner cookie, bounded names and bodies. No wildcard API CORS. |
| Direct gateway access | A private CloudFront origin header is checked with constant-time comparison. Rate limits use CloudFront’s generated viewer address, not client-supplied forwarded headers. |
| Rate/cost abuse | Room creation: 20/session/hour and 100/IP/hour. Photos: 10/session/day, 30/IP/day, 20 globally/day. Other API calls: 1,800/session/minute. DynamoDB counters are atomic; Gateway throttles and Lambda concurrency bound initial throughput. |
| Financial races | DynamoDB transactions reserve money before a provider call, reject repeated request IDs and settle once. Uncertain requests retain reservations. Financial records never expire with rooms/jobs. Twenty concurrent reservations against $1 permit at most five $0.20 reservations. |
| Provider failures | Quota/access errors have sanitized copy and a five-minute cooldown. Known rejections release reserves; uncertain errors retain them. Bounded temporary retries, saved partial faces and sample fallback avoid trapping players. |
| Job dispatch/crashes | Transactional outbox prevents a lost queue send from losing a job. Revision checks prevent duplicate generation. Saved outputs can recover after lease expiry; unknown outcomes pause. Cleanup failure after a completed face cannot roll back that face. |
| Uploads | Cropped metadata-free browser JPEG plus independent server decoding, size/dimension limits, exact-key signed POST, digest and ETag verification. Arbitrary URLs are not fetched as input. |
| Private artwork | Cookie-owned jobs and member-only room art. Private S3 buckets, server-side encryption, TLS and short signed GETs. Original photos never appear in room responses. Child rooms own their copies. |
| Expiry | One-hour scoring/joins enforced on each mutation, regardless of cleanup timing. Member artwork/results retain 24 more hours. Scheduled cleanup plus S3 orphan lifecycle. Partial S3 delete failures are retried rather than silently accepted. |
| Multiplayer integrity | Five-seat transactions, independent attempts, server time/movement/collision checks, monotonic command receipts, best-score transactions and controller tokens. Duplicate catches cannot score twice. |
| Browser output | Names render as text. The SVG body template accepts only a validated hex skin colour. Production CSP, no-sniff, frame denial, HSTS and no-referrer headers apply through CloudFront. |
| Browser recovery | Stale polls cannot roll back acknowledgements/replays. S3 completion can recover without a second upload/job. Temporary rate limits retain commands and reconnect with backoff. |

## Evidence

Run `npm test`, `test:aws`, `test:infra`, `test:lambda`, `test:multiplayer`, `test:characters`, `security:check`, and `npm audit --audit-level=high`. CI runs fixture checks without AWS credentials or an OpenAI key. Credential findings print locations only, never matched values.

Five-player DynamoDB Local load, 11 October 2026: 600 seconds, **34,804 requests, zero failures, 300 catches, 20 completed attempts**. API p95 85.11 ms, p99 139.44 ms; peer notices p95 516 ms. Browser tests and build work also ran on the same machine. These numbers are local evidence, not deployed AWS capacity measurements.

The history scan covers reachable Git objects, not private chat transcripts, deleted remote repositories or every third-party system. A key previously shared in chat should be replaced for production. There were no additional paid image calls in this implementation phase.

## Boundaries to verify at deployment

- Real CloudFront, DNS/ACM, S3 CORS, IAM and live concurrency require the domain smoke tests in [AWS.md](AWS.md). No production stack was deployed during this review.
- Signed images are bearer URLs during their short validity; authorized players can save or screenshot images. Expiry cannot revoke copies already downloaded.
- Anonymous cookies provide session ownership, not verified identity. Names can be impersonated across rooms. Clearing cookies loses access; there is no account recovery flow.
- The browser necessarily receives hidden-object positions for rendering. Server validation blocks invalid movement/claims, but a modified client can automate discovery. This is a friends’ game, not an anti-cheat system.
- Application limits and Gateway throttles reduce abuse, but do not cap total AWS infrastructure charges or defeat distributed botnets. Review billing and traffic before wider promotion; add edge bot controls if actual traffic warrants them.
- Physical deletion can lag access expiry during outages. Private S3 lifecycle is a three-day fallback for orphan files. Deleting a retained production table or changing a spending ceiling requires an explicit operational decision.
