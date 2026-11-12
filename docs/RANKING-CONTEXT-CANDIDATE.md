> Release update: owner approved production deployment on 2026-11-13 JST. Both additive RPCs have now been applied and public API/security checks passed. Production UI enablement is controlled by repository variable `VITE_ENABLE_RANKING_CONTEXT`; older candidate notes below are historical. Stop procedure is in RANKING-CONTEXT-STOP.sql.

# Ranking context: isolated candidate, NOT DEPLOYED

## Scope and status
- Branch codex/ranking-context-safety, base 24de54d. No main changes, remote push, database migration or production deployment.
- Existing top-100 leaderboard, capped 110-row result query, score submission, gameplay, account rankings unchanged.
- New UI guarded by VITE_ENABLE_RANKING_CONTEXT=true (default OFF). Only after successful submission, an explicit click performs one detail query. No polling or automatic retry.
- Current run rank-equivalent and saved-best rank (submission time) are separate. For a below-best run, own saved best remains in comparison, so hypothetical position can be total+1. This is NOT a claim of a new participant. Denominator is same-difficulty stored identities, not verified people. Basic excluded.
- Neighbor list means closest score records, not guaranteed immediate ordinal predecessors when large ties exist; maximum three higher, three equal, three lower. Same score shares rank. Endless uses rounded seconds.

## Original reason: what is evidenced
Git commit 4cfd19d (2026-11-06, PR #33) explicitly limits higher-score rows to 110, transferring metric only, avoiding counting beyond the cutoff for run results. Public list retains 100. Existing submission and authenticated overview RPCs already compute exact best ranks. The source proves bounded transfers and capped run queries, NOT that original authors measured a specific Supabase capacity threshold. Historical motive beyond documented code is unverified. Replacing 110 with unlimited client fetching would be unsafe and is not proposed.

## Cost and security
The candidate is a STABLE SECURITY INVOKER RPC using existing RLS and public display-column permissions. No device keys, account IDs, timestamps, private auth data or writes returned. Column chosen from fixed whitelist. No grants on scores expanded. Input difficulty restricted; score nonnegative integer. Client timeout is only user-facing and does NOT prove backend cancellation. UI one-click protection is NOT server rate limiting; hostile callers can repeatedly request arbitrary scores, just as existing read endpoints can be abused. Before release decide rate limiting/caching/DB timeout strategy appropriate to the existing gateway.

Exact COUNT is not O(log N) merely because indexes exist. Candidate does one total/higher/tied count and up to 9 neighboring-rank counts; repeated index/heap scanning can grow with rows. This candidate prioritizes explicit semantics and small response, not proven optimal DB load. Consider aggregate/cached counts or rank offset derivation before high traffic. No new persistent table/index means no added storage corpus, but compute and egress still increase.

## Verification
- All 242 tests across 22 files pass, including 9 new tests for anon/auth public-column permissions, RLS, same-score rank, empty difficulty, negative/invalid input, lower-than-best, Endless, repeated clicks, stale response and HTML-name safety.
- TypeScript/build pass.
- Existing read-only live security check: display columns and survival read succeed; wildcard/device-key reads denied. No live candidate query or load test run.
- Local synthetic PGlite benchmark 1k/10k/100k total rows; see ranking-context-benchmark.json and scripts/benchmark-ranking-context.mjs. At 100k, warm medians 24.87–63.58 ms; payload 352–497 bytes. At 1k, 1.0–1.66 ms. This is single-user WASM PostgreSQL on local Mac with synthetic data, NOT Supabase free-tier or simultaneous production capacity evidence.

## Remaining release gates
1. Inspect production schema/indexes/RLS and query plans safely; actual total/difficulty cardinality, request rate and current free-tier budget. Prior ~28 MB/500 MB observation is historical and does not prove compute headroom.
2. Investigate production timeout/rate limits; optimize repeated counts if necessary. Do not load-test production without explicit approval and bounded plan.
3. Isolated headless Chrome UI checked at 1280×720 and 390×844 with synthetic 9 rows and long names: no horizontal overflow, one network request despite repeated clicks, new result resets button. Screenshot inspected; mobile game remains in its existing landscape-aspect letterboxed area with a scrollable result panel. Full real-game flow, actual phone touch scrolling, rename, account change during request and complete visual refinement remain release gates. External Supabase/GA requests blocked in UI fixture.
4. Product choice: this candidate compares current score against saved bests, not a verified-own-best-centered leaderboard. If exact own best neighbors are required, securely retrieve canonical best (account vs guest) without leaking identity; do not silently substitute a possibly stale local record.
5. Apply migration and enable flag only after approval; validate RPC response under actual anon/auth roles. Main push auto-deploys and has NOT occurred.

Free-tier cost cannot be guaranteed by the local benchmark. Recommend limited opt-in detail while keeping existing default leaderboard, then measure, rather than full automatic exact counts on every run.


## Follow-up: saved-best-centered implementation (supersedes earlier candidate limitations)
- Added ranking_own_best: narrowly scoped SECURITY DEFINER reads ONLY the authorized identity's public name and best metric. It does not count other players or invoke the aggregate under definer privilege.
- Member path uses the existing Supabase SDK session access token plus expected user ID; server auth.uid must match, auth.users must still exist, and player_ranking_identity selects canonical key. Guest key cannot be supplied with member request. An anonymous caller cannot query keys mapped to accounts. Tokens/keys are never returned or logged.
- Guest path uses existing UUID capability (same model as legacy score submission), not a verified human identity. An attacker possessing another guest key could query that guest's already-public name/metric; this candidate does not claim to solve guest key theft or false scores. No public table grants expanded.
- Public aggregate remains SECURITY INVOKER and is invoked separately under anon display permissions, preserving RLS. Two sequential requests per result detail, only on click; no automatic polling. Owner is checked before/after requests. No stale local best substitution.
- Detail is now centered on canonical saved best; current score and submission-time best rank are separate. Shows next higher score gap. At most 3 above, 3 same-score, 3 below records; ties may mean not all same-rank names displayed. Self is included in comparison, not uniquely highlighted in list because opaque identifiers are intentionally withheld. Member/guest merging retains existing canonical model.
- Aggregate optimization: total/higher/tied from one pass, then equality counts for at most 7 distinct nearby score groups; neighbor ranks derived by group-size offsets. Eliminates per-neighbor full higher-score counts. Huge tie groups still require work, and the total pass still scales with rows. Missing legacy survival values excluded from measured Endless denominator, rather than inventing survival time.
- Improved synthetic 100k benchmark: warm median 5.49–16.32ms (previous 24.87–63.58ms), same small bounded response. Not actual Supabase CPU/SLA or concurrent test.
- Live low-volume read-only HEAD exact-count check (six sequential requests, no record bodies): 1848 rows total; Easy802/Normal556/Hard251/Hardcore125/Endless114. These are stored ranking rows, not unique users or actual play count. Per-request elapsed includes internet latency and is not query CPU time. See ranking-live-count-readonly.json. Current storage/compute budget and production EXPLAIN remain unverified.
- Added member/guest ownership SQL tests, role mismatch/deleted/unmapped identity, canonical Endless, no direct key access, large-tie group correctness, and account-switch client fail-closed. Final full tests and build rerun recorded by parent report.
- Headless UI rerun with saved-best mock on PC/mobile; two requests only, nine rows, no horizontal overflow, retry remains accessible. Screenshots contain synthetic data, never real player output. Actual touch device and full production integration remain untested.
- Deployment remains blocked pending production schema/index/RLS inspection, rate/timeout design, end-to-end integration review and explicit deployment approval. No need to ask user to choose technical identity approach; the above uses existing identity foundations.


## Final safety pass / live catalog inspection
Supabase SQL Editor, separate query preserving the user's existing unsaved query, used BEGIN READ ONLY with SET LOCAL statement_timeout='1500ms' and lock_timeout='100ms', catalog SELECT only, ROLLBACK. No score rows queried or changed, no EXPLAIN ANALYZE, no settings persisted. Verified:
- scores_device_key_difficulty_key UNIQUE (device_key,difficulty)
- scores_profile_score_idx (difficulty,score DESC)
- scores_profile_survival_idx (difficulty,survival_seconds DESC)
- scores and player_ranking_identity: RLS enabled (not forced)
- scores SELECT policy allows public display; identity SELECT restricted to authenticated auth.uid()=user_id.
- Stored role configs: anon statement_timeout=3s; authenticated=8s; authenticator=8s and lock_timeout=8s. These are observed configured limits; no deliberate production timeout probe was run. Candidate public aggregate uses anon. The owner's narrower identity RPC may run under authenticated 8s; it is an indexed one-record lookup. User-side AbortSignal 5s is not a proof of remote cancellation.

Added bounded 60-second public aggregate cache (16 entries, same difficulty/value requests share a promise). No identity data or credentials cached. The display states up to one-minute-old count. Own best still fetched fresh. Failed requests are not cached. This reduces legitimate repeated views; it is NOT a server rate limit. Do not advertise protection from direct API floods. If measured demand or abuse increases, prefer a managed gateway per-client rate limit before expanding exposure; introducing a gateway, new persistent credentials, or new security settings needs separate approval.

Real game UI integration ran in a local-only copied HTML with every Supabase URL intercepted to synthetic response, while loading unchanged game main.ts/UI/game flow. Via browser UI: title→start→Endless→Escape→give up→GAME OVER→detail; canonical best/nearby/delta visible; name change→retry→pause→give up→fresh detail button reset; mode select→Basic→pause→finish→SCORE with no ranking panel. No actual Supabase score writes. This is a real browser game flow with mocked network, not a live production integration or physical-phone run. The generated qa-ranking-flow.html is test-only and must not be deployed; regenerate via scripts/create-ranking-flow-fixture.mjs. User browser control ended and test server stopped.

## Proposed deployment sequence (NOT executed)
1. Peer review SQL authorization and cache semantics. Keep VITE_ENABLE_RANKING_CONTEXT false throughout DB preparation.
2. With explicit production-change approval, apply the two additive function migrations only. No scores schema/index/row modifications needed. Existing API/leaderboard remains intact.
3. Perform a handful of controlled own-account/guest read checks (no fake scores), matching canonical best and exact count; test unauthorized member lookup denial. Do not run load tests on production. Inspect a plain EXPLAIN plan where useful, without ANALYZE; decline broad schema discovery.
4. After success, approved deploy with flag enabled and CI pass; verify existing game play/results and fallback under RPC failure. Main push automatically deploys, so no push before that approval.
5. Observe actual error/latency/budget over a bounded period with authorization. If regression occurs, disable the feature flag/redeploy first; unchanged old rank path continues. Functions can remain unused or be removed in a separately approved reversible migration.

Remaining risks: network plus real role execution unverified until step 3; anonymous UUID possession remains existing weak ownership; plausible fabricated scores remain possible; exact totals still scale with row count; ties can hide names due to bounded list; own lookup and public aggregation are separate snapshots so concurrent changes can move a displayed position. All these are preferable to claiming exact real-person counts or fetching whole tables.


## Independent-review corrections
- Bounded same-score names are ordered by public name, not by owner; ties can omit the owner. The UI no longer claims the neighborhood list includes self. The canonical own best is always separately shown above the list. Name order only determines which tied names are sampled; it does not break ties or improve/worsen anyone's score rank. No stable private identifier is disclosed or synthesized to highlight self. Duplicate names cannot be treated as identity.
- Added 51-way tie regression: user's ZZZ name is omitted from the three visible ties, while exact own rank remains 21/101 and all tied rows rank 21. UI regression confirms separate own best and explicit omission explanation.
- UI flag OFF does NOT shut down direct RPC requests. For DB-load/abuse incidents, the authorized operator should revoke EXECUTE for PUBLIC, anon and authenticated on BOTH newly added RPCs, then disable the UI. See docs/RANKING-CONTEXT-STOP.sql (proposal only, not executed). Existing leaderboard/submit grants remain untouched. REVOKE stops new unauthorized calls, not already-running statements; existing role timeouts and separately approved targeted cancellation cover those. Verify denial with only a few read-only calls. Restore exact anon/authenticated grants only after resolution and explicit approval; never PUBLIC/table grants.
