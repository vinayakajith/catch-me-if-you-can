# Father Hunter working agreement

- The local solo game, personal AI character flow, and five-player multiplayer rooms are implemented as described in README.md. Multiplayer was explicitly authorized: independent two-minute attempts, best scores across replays, one-hour rooms, and 24-hour final-score retention. Revenge chains and AWS deployment remain later phases.
- Mobile and players with no gaming background are primary: preserve tap-to-walk, simple interactions, readable clues, and the contextual commode-lid reveal.
- Keep movement, collision, placement, scoring, and timing rules in packages/game-core. Keep renderer and UI details in apps/web.
- Make small coherent commits frequently. Immediately run git push after every commit. The user explicitly requested this workflow. Preserve local commits and report the actual blocker if a push fails; never imply it succeeded.
- Run npm test for rule changes and npm run build for frontend changes. Run the browser check when game inputs or visual behaviour change, if the environment supports it. Use test:multiplayer for room/browser changes and test:load for sustained five-player verification; these must keep using fixture providers and temporary storage. Report verification limits honestly.
- Keep uploaded photos, credentials, caches, node_modules, and test screenshots out of Git. Bundle game assets needed for offline runtime.
- Every real image call must use the backend's BudgetedImageProvider. The user authorized at most $1 total development spend, including uncertain requests. Never bypass, reset, delete, or relocate `.father-hunter/development-spend.sqlite` while using this key. Tests use the fixture provider; no paid tests without accounting in the same ledger. A higher budget requires explicit user authorization.
