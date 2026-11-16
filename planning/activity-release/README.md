# Unpublished guest activity integration, 2026-11-16

Base: origin/main c1aa100, isolated worktree. Locally committed on feat/site-activity-isolated. Not pushed or deployed.

## Gate
Client `VITE_SITE_ACTIVITY_ENABLED` defaults off. Worker `ACTIVITY_ENABLED=false`.
Worker runs first ONLY `/api/activity/*`; all other assets keep original routing/header rules.
`VITE_SITE_ACTIVITY_LEGACY_POLICY=independent-reviewed` is an explicit release choice, NOT
implied by enabling collection. Default respects the existing GA-denied state. New per-feature
off always wins. Confirm the old wording/policy with owner before selecting independent mode.

## Collection
Existing game active elapsed seconds, never countdown or old browser cumulative history.
Prepare at title; only games started after successful enrollment count. One final update/game,
5-minute heartbeat for long games, best-effort pagehide. No score/ranking identity/account join,
no typing contents, no device fingerprint/IP stored in DB. Browsers, NOT people. All 6 modes
except VS. Reloads/tabs get separate writer IDs; cumulative MAX makes retries idempotent.
Successful enrollment/write renew the same ID/epoch to90days collection and180days withdrawal.
Failed or expired credentials never renew. Revoke tombstones90days+120sec prevent late response resurrection. On Cookie deletion data cannot be
reidentified for deletion. Limits or outages yield missing/partial, never an invented zero.

## Deployment order (each verified before next)
1. Read-only DB preflight: pgcrypto/roles/name collision/DB usage/cron/owner identity.
2. Apply reviewed SQL transaction to isolated schema + two new RPCs only. Secret NULL/owner NULL
   are fail-closed. Back up current deployed worker version and site version before publishing.
3. Configure dedicated random HMAC RPC key in private config and Worker secret, separate cookie
   signing key. Never put actual secrets in Git, logs, client, or a public document. Verify restrictive
   grants/RLS, anonymous/non-owner denials, exact-byte HMAC, parallel/retry/revoke tests on real DB.
4. DO NOT enable purge/cron: owner has NOT approved permanent deletion and requests long-term
   historical aggregates. Initial collection may start with no automatic deletion and existing hard
   row/operation caps. Finalize long-term rollups and obtain concrete retention approval before any
   purge. Privacy notice now matches this no-auto-delete state. Current summary only shows last90days.
5. Bind ACTIVITY_RATE_LIMITER (for example per-location60/60seconds, approx only). Verify plan
   and hard DB caps. Design defaults10000identities/100000rows/20000operations daily; no paid upgrade.
6. Publish owner summary UI and verify owner-only auth. Publish game with both gates OFF; smoke
   static assets/audio/ranking/login/privacy/CSP/404 and API503 with zero DB ingestion.
7. Set approved build/policy flag and Worker enabled true, redeploy, test one browser without GA,
   stop/delete/reload/hidden/tab/timeout; verify exact DB daily counters and owner dashboard.
8. Record start time/coverage as partial. Never label a full day complete without health evidence.

## Backout
Set ACTIVITY_ENABLED=false first. Keep current gateway/secrets available for revoke if anyone
already collected; full worker rollback removes deletion endpoint and should be avoided unless
required for service recovery. Client flag off on next build. Do not drop schema or purge all data
as rollback (irreversible). Owner dashboard may stay read-only with partial warning. If no collection
has begun, original worker version rollback is sufficient.

## Validation so far
Game300 tests and build; prototype69 tests including real PGlite pgcrypto and
HTTP→gateway→role-anon DB→delete/replay. Independent gateway re-review cleared three issues.
Wrangler deploy --dry-run passed (no upload). Owner API auth/range/CSRF tests and prior suite pass.
Not yet verified: real PostgreSQL multiple connections, live schema, cron, live CPU/cost,
full browser gameplay/rendering or actual deployment. No production claims are warranted yet.

## Production update 2026-11-16 23:46 JST
Client and Worker enabled after real HTTP canary, idempotency, owner summary and revoke/stale-write checks. Private owner Site v15 deployed; signed-in visual rendering remains unverified. Cloudflare Free plan owner-confirmed. Approximate rate limit binding present; 429 not observed in limited tests. No automatic deletion enabled. CI reads explicit repository client flags; Worker defaults OFF locally; production CI explicitly passes its release flag. To stop collection, deploy ACTIVITY_ENABLED=false while preserving revoke endpoint and secrets.
