# adrianlatorre.com coffee counter migration

The source integration is implemented in `/Users/a2023362/workspace/fun/adrianlatorre.com` and verified against disposable databases. Production deployment and observation items remain intentionally unchecked.

## Before deployment

- [ ] Record the authoritative deployed coffee total and the exact durable `DB_PATH`.
- [ ] Back up the SQLite file and verify the backup can be opened.
- [x] Pin `wave-counter[fastapi]`, `@wave-counter/client`, and `@wave-counter/vue` at coordinated version `0.1.0`; local tarball links are reserved for development and test loops only.
- [x] Keep the legacy SQLite `coffee` table intact for rollback and one-time baseline discovery.

## Backend integration

- [x] Initialize `WaveCounter(database_path=DB_PATH, initial_counts={"coffee": LEGACY_TOTAL})`; startup reads the legacy row so a changing deployed total is not hard-coded.
- [x] Mount `create_router(counter)` at `/api/waves` behind the site's existing middleware.
- [x] Verify `GET /api/waves/counters/coffee` returns the legacy total before recording a new event.
- [x] Verify baseline analytics contain no fabricated events and package tables remain `waves_*` namespaced.

## Frontend integration

- [x] Import `@wave-counter/vue/styles.css` and replace only the local coffee behavior with `<WaveCounter counter-key="coffee" endpoint="/api/waves" />`.
- [x] Preserve the surrounding compact site presentation through CSS custom properties.
- [ ] Verify click, right click, long press, Context Menu, Shift+F10, Escape, retry, and reduced-motion behavior.

## Production verification

- [ ] Confirm the displayed total still equals the legacy total immediately after deployment.
- [ ] Record one event and confirm the authoritative total increases exactly once.
- [ ] Replay the same UUIDv7 request and confirm the total does not increase.
- [ ] Restart the service and confirm the increment persists.
- [ ] Open analytics and confirm the imported baseline is absent from daily event buckets.
- [ ] Confirm authentication, CORS, rate limiting, backups, and persistent-volume configuration remain host-owned and active.

## Rollback and legacy removal

- [ ] If any verification fails, restore the previous frontend/backend release without deleting `waves_*` data.
- [x] Remove the legacy repository, models, routes, API methods, and tests after the source integration suite is green.
- [ ] After a stable production observation period, remove the legacy coffee table.
- [ ] Keep the pre-migration backup according to the site's retention policy.
