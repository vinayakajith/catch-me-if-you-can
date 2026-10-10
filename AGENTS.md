# Father Hunter working agreement

- The current delivery target is the complete Phase 1 local solo prototype described in README.md. Later phases are gated by playtesting and user direction.
- Mobile and players with no gaming background are primary: preserve tap-to-walk, simple interactions, readable clues, and the contextual commode-lid reveal.
- Keep movement, collision, placement, scoring, and timing rules in packages/game-core. Keep renderer and UI details in apps/web.
- Make small coherent commits frequently. Immediately run git push after every commit. The user explicitly requested this workflow. Preserve local commits and report the actual blocker if a push fails; never imply it succeeded.
- Run npm test for rule changes and npm run build for frontend changes. Run the browser check when game inputs or visual behaviour change, if the environment supports it. Report verification limits honestly.
- Keep uploaded photos, credentials, caches, node_modules, and test screenshots out of Git. Bundle game assets needed for offline runtime.
