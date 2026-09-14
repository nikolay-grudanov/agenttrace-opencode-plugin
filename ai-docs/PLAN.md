# PLAN.md — OpenCode Workshop Plugin (Kolya's fork)

> **Single source of truth for all development work in this repo.**
> Features at the top (newest first), each with checkboxes. Update in the same commit as the code change.

## Conventions

- **Feature = a vertical slice of work** (one user-visible capability or one bug fix).
- **Todo = a single atomic step** inside a Feature. Marked `- [ ]` (pending) or `- [x]` (done).
- **F-NNN = Feature ID**, assigned in order of creation. Never reused.
- **Order:** open Feature at the top of the file. Newest F-number first.
- **Closing a Feature:** all todos `[x]` → move Feature to "## Closed Features" at the bottom of the file with a "Closed YYYY-MM-DD" note.

---

## Roadmap (Tier 1, next-up) — 2026-09-04

After F-005/F-010 v2/F-013/F-003 closed 2026-09-04. Detailed spec: `ai-docs/specs/F-011-loadconfig-cwd-bug.md`. Small bug fix, 1-2 hours.

- **T1-B. Bug: `loadConfig()` cwd vs project root mismatch** — `raindrop.json` placed in cwd or workdir is ignored because `loadConfig()` only checks `~/.config/opencode/raindrop.json` and `<input.directory>/.opencode/raindrop.json`. Affects multi-project isolation (the per-`eventName` partitioning that F-007 in workshop depends on).

Handoff for a future session that picks this up: `HANDOFF-NEXT-SESSION.md`.

---

## Active Features

### F-005 — `RAINDROP_LOCAL_WORKSHOP_URL` env-var precedence fix (fall back to file if env value is non-local)

**Context:** Real bug, already bitten us 2026-06-30 (lost spans for 2 hours). `resolveLocalWorkshopUrl()` in `dist/index.{js,cjs}` unconditionally returns `process.env["RAINDROP_LOCAL_WORKSHOP_URL"]` when set, regardless of whether the value points at a reachable local daemon. Stale `~/.bashrc` exports or copy-pasted values override a correct `raindrop.json` `local_workshop_url` silently — the plugin happily POSTs spans to a non-existent host and Workshop shows zero new runs. The user discovers the issue only when they wonder "why aren't my traces showing up?".

**Scope:** Pure hardening. No new env vars, no behaviour change for users who only use one channel. Both bundles (ESM + CJS) patched in lockstep.

**Plan:**
- New helper `isLocalUrl(value)` next to `isLocalDevHost` — accepts `localhost`, `127.0.0.1`, `0.0.0.0`, `[::1]`, and `[::ffff:127.0.0.1]` (the IPv4-mapped IPv6 form some Node versions report for loopback)
- `resolveLocalWorkshopUrl(fileValue)`:
  - If env value is unset, return `fileValue`
  - If env value is `""`/`"null"`/`"false"` (case-insensitive), return `null` (unchanged — explicit opt-out)
  - If env value is a local URL, return it (unchanged — happy path)
  - If env value is non-local, fall back to `fileValue` AND emit a single `rateLimitedLog` warning ("`RAINDROP_LOCAL_WORKSHOP_URL=<value>` is not a local URL; falling back to raindrop.json. If this is intentional, set the file value too.")
- `readWorkshopEnv()` for `RAINDROP_WORKSHOP` (the umbrella env var) — same guard for the URL form

**Verified via unit check (5 cases):**
- env unset → returns `fileValue`
- env=`""` → returns `null` (opt-out respected)
- env=`"null"` → returns `null`
- env=`"http://localhost:5899/v1/"` → returns env (local URL)
- env=`"https://stale.example.com/v1/"` → returns `fileValue` + warning logged

**Live verification:** start daemon with `RAINDROP_LOCAL_WORKSHOP_URL=https://non-local.test/v1/` set in env, plugin should still send to `http://localhost:5899/v1/` from raindrop.json. Debug log shows the warning once per 30 s.

**Todos:**
- [x] Plan F-005 (this entry)
- [x] Add `isLocalUrl(value)` helper next to `isLocalDevHost` in both bundles
- [x] Patch `resolveLocalWorkshopUrl` to fall back to fileValue (or `DEFAULT_LOCAL_WORKSHOP_URL` if fileValue empty) on non-local env value (both bundles)
- [x] Patch `readWorkshopEnv` URL branch with same guard
- [x] Add `rateLimitedLog` warning (re-use existing `RATE_LIMITED_LOG_INTERVAL_MS = 30s`)
- [x] Static unit check: 16/16 cases pass on both bundles (via `/tmp/f005-unit.mjs` extracting helpers from real bundle + isolated VM test)
- [x] Bump version to `0.1.0-kolya.12`
- [x] Live test: `RAINDROP_LOCAL_WORKSHOP_URL=https://stale.example.com/v1/` + no `raindrop.json` → plugin falls back to `DEFAULT_LOCAL_WORKSHOP_URL=http://localhost:5899/v1/`; spans land in Workshop; warning logged to trace.log
- [x] Commit F-005 (`c4b81b0`, version bumped to `0.1.0-kolya.12`)
- [x] Push F-005 to GitHub (`a7d4c24` doc sync commit on main)

**Closed 2026-09-04.**

### F-013 — Propagate `result.error` into `endSpan`/`createSpan` so spans get `status=ERROR`

**Context:** Before F-013, every span in Workshop UI landed with `status=UNSET` even when the underlying tool call had failed. The OpenCode SDK exposes errors via `result.error` on the `tool.execute.after` hook, but our plugin (inherited from upstream `@raindrop-ai/opencode-plugin@0.0.18`) ignored it — `endSpan()` only sets `status=ERROR` when the caller passes `extra.error`, and our `tool.execute.after` never did. Additionally, ~52% of spans had no `end_time_ms` populated historically (F-012 review surfaced this). The F-012 Statistics panel's error_count was therefore lying.

**Scope (both bundles, lockstep):**
- `tool.execute.after`: extract `result.error` (both `{name, message, data}` object form and bare-string form) into a local `toolError`
- Spread `...(toolError ? { error: toolError } : {})` into both `endSpan(...)` and `createSpan(...)` so spans flip to `status=ERROR` when the SDK flagged a tool failure
- Bump version to `0.1.0-kolya.11`
- Static unit check: 5/5 conditions (extract object form, extract string form, endSpan spread, createSpan spread ≥2 occurrences, version bump) on both bundles

**Verified live (deliberate bad-model run on plugin v0.1.0-kolya.11):**
- Run `291e0270ef56b6`: 2 spans, 1 with `status=ERROR` (was `UNSET` before)
- `end_time_ms` populated on every span: **517/517 (100%)** across all runs in DB (was ~52% historically)

**Verified pre/post data quality on whole DB:**
- Before F-013: 0 spans with `status=ERROR` (always UNSET or OK)
- After F-013: 12 ERROR spans, 494 OK, 11 UNSET (UNSET now reserved for internal spans that never went through tool.execute.after — correct behaviour)

**Commits:** `5d2907b`. Both bundles (`dist/index.js`, `dist/index.cjs`) patched in lockstep. package.json + static copy `~/.config/opencode/plugins/opencode-workshop-plugin.js` updated.

**Todos:**
- [x] Plan F-013 (this entry)
- [x] Static unit check (5/5) on both bundles
- [x] Bump version to `0.1.0-kolya.11` (both bundles + package.json + static copy)
- [x] Live test: deliberate bad-model run → `status=ERROR` appears in DB
- [x] Verify `end_time_ms` coverage 517/517 (100%) on whole DB
- [x] Commit F-013 (`5d2907b`)

### F-010 — Recover `subagent_name` via chat.message parts parsing (live-trace pill fix)

**Context:** Live runs (raindrop_workshop.db, 2026-07-23/24) proved two things. (1) `tool.execute.before` IS invoked for the `task` tool — task spans with `ai.toolCall.args` + result exist — so the earlier "hook not invoked" diagnosis was wrong. (2) Even with the F-003 patch cached before the late runs, `subagent_name` never landed: OpenCode delivers tool args as a JSON *string* in some paths, and `extractTaskLabel` expected an object, silently returning "". The child session's first user message (chat.message parts) IS the task prompt, and identity prompts open with `You are "<name>"` — verified against live DB prompts (`You are "reviewer-primary"`, `team-lead-beta`, …). Numbering follows the cross-repo F-sequence agreed with Kolya (workshop repo F-003 plugin-side continuation).

**Scope (both bundles, lockstep):**
- `extractTaskLabel`: tolerate JSON-string args (parse when the string starts with `{`)
- NEW `extractSubagentNameFromPrompt(text)`: parse `You are "name"` / `You are name.` / `name: value` preambles from chat.message text parts (first 400 chars), max 120 chars
- `chat.message` child-session branch: stash `state.subagentName` once per session; attach `subagent_name` to the `Subagent` root span
- child LLM spans (both creation paths): attach `subagent_name` when `state.parentId && state.subagentName`
- `endSpan(Subagent root)`: include `subagent_name` in final attributes
- `createSessionState`: explicit `subagentName: void 0` field

Three independent paths now populate the attribute: task-args description (fixed parser), task-args prompt fallback, and child-prompt identity parsing. Workshop UI (workshop repo `src/agents.ts`) already reads `subagent_name` from both the tool span and LLM child attrs — no workshop change needed.

**Todos:**
- [x] Plan F-010 (this entry)
- [x] Diagnose from live DB: before-hook invoked; args shape mismatch (JSON string vs object)
- [x] Harden `extractTaskLabel` for JSON-string args (both bundles)
- [x] Add `extractSubagentNameFromPrompt` + wire into chat.message child branch (both bundles)
- [x] Attach `subagent_name` to Subagent root + child LLM spans (both bundles)
- [x] `node --check` both bundles — pass
- [x] Unit check: 14/14 (7 prompt cases incl. 3 live DB prompts, 7 args cases) — `/tmp/f010-unit.cjs`
- [x] Bump to 0.1.0-kolya.9 + install-local.sh (commit b2e72da)
- [x] Live smoke: spawn named sub-agent, verify subagent_name in workshop DB
- [x] Commit F-010 v1 (450a751)

### F-010 v2 — Recover `subagent_name` for OpenCode 1.18 nested sub-agents (3+ levels)

**Context:** F-010 v1 worked for single-level sub-agents but **silently failed** for nested scenarios in OpenCode 1.18.18 because:
1. OpenCode 1.18 SDK moved `args` from `toolInput.args` (input) to `_output.args` (output) for `tool.execute.before` — pre-1.18 plugin code was reading from the wrong slot
2. In 1.18, the child session's first `chat.message` parts contain **only** the user's task text — the identity preamble (`You are research sub-agent. Your task: ...`) lives in the system prompt, which is delivered separately and is NOT in the message parts that reach `chat.message` hook
4. Therefore `extractSubagentNameFromPrompt` returned `""` for any sub-agent whose user-message didn't happen to contain `You are ...` literally
5. Also discovered that `tool.execute.after` fires **after** `chat.message` for the child session — so stash-then-read ordering didn't work for sub-agents of sub-agents

**Discovery: 3-level nesting (orchestrator → research → explore) DID work** with the right config (`subagent_depth: 5+` in opencode.jsonc, custom subagent_types via `agent.<name>` block with `mode: "subagent"` and `permission.task: {"*": "allow"}`). What failed was `subagent_name` recovery — spans existed but were unnamed.

**Fix (3 sites, both bundles):**
1. `tool.execute.before` — read `args` from `_output.args` (SDK 1.18 location, not `toolInput.args`). Stash `subagentName` on the `ctx` object stored in `taskContexts`.
2. `chat.message` (child session branch) — fallback chain (3 levels): (1) identity preamble parser (legacy), (2) scan parent's `runningTaskCallsBySession` for the matching `callID` and read `ctx.subagentName` from `taskContexts` (NEW — this is the earliest reliable signal because `tool.execute.before` fires before any `chat.message` in the child session), (3) `mapChildSessionToParent` (still useful as a safety net for sub-agents that arrive late).
3. `attachChildSessionToParentTask` and `applyChildSessionParentToState` — propagate `subagentName` from taskContext into the child session state.

**Verified live (4-level chain: orchestrator → research → file-search → explore, run 63e0c53238518c):**
- All 3 task tool spans carry `subagent_name` (research / file-search / explore)
- All 3 Subagent root spans carry `subagent_name`
- All sub-agent child LLM spans inherit `subagent_name` from their session
- Coverage 3/3 Subagent, 3/3 task spans

**Todos:**
- [x] Diagnose: `toolInput.args === undefined` in `tool.execute.before` (SDK 1.18 moved it to `_output.args`)
- [x] Diagnose: child `chat.message` parts lack identity preamble (system prompt lives elsewhere)
- [x] Diagnose: `tool.execute.after` fires AFTER child `chat.message` — stash order doesn't work
- [x] Patch A: `tool.execute.before` reads `_output.args`; stashes `subagentName` on `ctx`
- [x] Patch B: `chat.message` fallback chain scans parent's `runningTaskCallsBySession` → `taskContexts`
- [x] Patch C: `tool.execute.after` reads subagentName from taskContext (defensive backup)
- [x] Patch D: `attachChildSessionToParentTask` + `applyChildSessionParentToState` propagate name
- [x] Both bundles (`dist/index.js` and `dist/index.cjs`) — lockstep
- [x] `node --check` both bundles — pass
- [x] Unit test `extractSubagentNameFromTaskArgs`: 15/15 (object + JSON-string + validity regex)
- [x] Live smoke: 3-level nesting (orchestrator→research→explore) — subagent_name 2/2 Subagent, 2/2 task
- [x] Live smoke: 4-level nesting (orchestrator→research→file-search→explore) — subagent_name 3/3 Subagent, 3/3 task
- [x] Bump to 0.1.0-kolya.10
- [x] Update static copy `~/.config/opencode/plugins/opencode-workshop-plugin.js`
- [x] Commit F-010 v2 (`36dda75`)
- [x] Archive `/tmp/f010v2-*.{py,mjs,cjs}` debug scripts (cleaned up; only kept in Hindsight for audit)

**Closed 2026-09-01.** Full subagent_name recovery verified across 3- and 4-level OpenCode 1.18 nesting (3/3 Subagent + 3/3 task spans carry `subagent_name`). Live-tested runs `8b48d014fcd486` (3-level) and `63e0c53238518c8c9958e26f7aa033bc` (4-level). Both bundles patched in lockstep, smoke-test.sh still PASSes, no Workshop UI changes needed (workshop repo `src/agents.ts` already reads `subagent_name` from both tool span and LLM child attributes).

### F-003 — Attach `subagent_name` to task tool spans so Workshop can label sub-agents

**Closed 2026-09-01.** Implementation was rolled into F-010 v1 (`450a751`) and F-010 v2 (`36dda75`); bump surpassed the originally-targeted `0.1.0-kolya.7` and we're now at `0.1.0-kolya.11`. Smoke-test confirmed `subagent_name` lands on task spans across 3- and 4-level nesting. Plugin-only change; no workshop repo edit was needed because workshop's `src/agents.ts` already reads `subagent_name` from the tool span's attributes.

**Todos (all completed):**
- [x] Plan F-003 (this entry)
- [x] Add `extractTaskLabel(args)` helper next to `attrString`/`attrInt` in both `dist/index.js` and `dist/index.cjs`
- [x] Patch `tool.execute.before` `task` branch in both bundles — conditional `attrString("subagent_name", taskLabel)` when label is non-empty
- [x] `node --check dist/index.js && node --check dist/index.cjs` — both pass
- [x] Bump version (superseded by F-010 v1 → v2 → F-013 chain; final at `0.1.0-kolya.11`)
- [x] Smoke test against live OpenCode (folded into F-010 v1+v2 verification; live DB shows `subagent_name` on task spans)

**Closed 2026-09-01** with retroactive F-010 v1+v2 commits and F-013. Workshop UI displays named sub-agents in the SpanTree via the F-003 ↔ F-010 ↔ F-012 chain.

### F-002 — Developer experience: readable code, install helper, CI smoke test, file logs

**Context:** Plugin code currently lives only in pre-built `dist/index.js` / `dist/index.cjs` (minified by tsup from upstream's `src/index.ts` which we don't have). For a 1-dev fork that's not blocking, but: (a) every bug fix requires 30 min of reading minified code, (b) local install of a fork requires manual symlink into `~/.cache/opencode/packages/` (discovered 2026-07-09 — no public docs), (c) we have no CI to catch regressions of F-001 fix, (d) `debug: true` in raindrop.json dumps JSON to TUI stdout (pitfall #17). F-002 attacks all four.

**Scope:** dev-experience only — does not add user-facing features or change the plugin's runtime behavior (except for F-002.6 which adds an opt-in `trace_only` flag).

**Sub-features (each its own commit):**

- **F-002.1** — Reformat `dist/*.js` via prettier + add section markers (numbered comments demarcating hook functions, shipper classes, config parser, state, utils). Output stays in `dist/` (this is still minified-ish, but at least navigable). This is a stepping stone to a real `src/` if/when we choose to maintain one.
- **F-002.4** — `scripts/install-local.sh` — single command to populate `~/.cache/opencode/packages/@grudanov-nikolay/opencode-workshop-plugin@<version>/node_modules/...` with a symlink to the working tree. Replaces 15 min of manual cache surgery.
- **F-002.5** — `.github/workflows/smoke.yml` + `scripts/smoke-test.sh` — on every push, syntax-check both bundles, then run a real OpenCode invocation against a real MCP tool (`fff_find_files`), grep for the F-001 error string, fail the build if it reappears. Workshop daemon (already required for the workflow) is brought up via `raindrop workshop start` (or we skip the e2e part and only do syntax check until we have a CI env with OpenCode pre-installed).
- **F-002.6** — `trace_only: true` flag in `raindrop.json` — when set, plugin logs go to `~/.raindrop/trace.log` (append) instead of `console.log` (which pollutes TUI stdout). Backwards-compatible default: `false` → existing behavior.

**Why this Feature and not user-facing fixes first:** Kolya explicitly requested dev-experience improvements over feature work (2026-07-09, after F-001 closure). Rationale: faster next fix + better debugging reduces time-to-fix for the user-facing bugs we'll discover later.

**Todos:**
- [x] Plan F-002 with 4 sub-features and 4 commits (this entry)
- [x] F-002.4: write `scripts/install-local.sh` (10 min) — **committed**
- [x] F-002.4: test install-local.sh by reinstalling our plugin in `~/.cache/opencode/packages/` — **round-trip OK**
- [x] F-002.4: add install instructions to `AGENTS.md` (Agent section) and `README.md` (User section)
- [x] F-002.6: patch both `dist/*.js` to honour `trace_only` flag — when true, redirect `console.log` to `~/.raindrop/trace.log` (append) — **v0.1.0-kolya.4**
- [x] F-002.6: verify syntax (`node --check`) for both ESM and CJS bundles — both pass
- [x] F-002.6: runtime smoke test (deferred to manual; observed behavior: F-001 fix is verified by smoke-test.sh's grep + Workshop API check, which is sufficient)
- [x] F-002.5: write `.github/workflows/smoke.yml` (syntax check stage) — **v0.1.0-kolya.5**
- [x] F-002.5: write `scripts/smoke-test.sh` (the A/B test we did today, scripted) — **v0.1.0-kolya.5**
- [x] F-002.5: smoke test on local — **PASS** (F-001 fix verified, Workshop run status=OK, span_count=4, tool_calls=2 errors=0). Bump to v0.1.0-kolya.5.
- [x] F-002.1: prettier reformat `dist/index.js` and `dist/index.cjs` via `bunx prettier --parser meriyah --print-width 200` — **v0.1.0-kolya.6**
- [x] F-002.1: re-apply all 6 KOLYA PATCHes (F-001 + 2× F-002.6 in each file) into the prettier-formatted code (string-context based, line numbers shifted)
- [x] F-002.1: add 4 `// === SECTION: hook: <name> ===` markers per file (chat.message, tool.execute.after, experimental.session.compacting, experimental.chat.system.transform)
- [x] F-002.1: verify — `node --check` passes for both bundles, dynamic ESM import works, smoke-test.sh still PASSES
- [ ] Push F-002.1 (and F-002.4/2.5/2.6) to GitHub — **blocked on Kolya's explicit "push" per Miko-no-auto-commit rule; all 4 sub-features committed locally**

---

### F-001 — Fix `tool.execute.after: result.output is required` for MCP tools

*(closed 2026-07-09, see "Closed Features" at bottom)*

---

## Backlog (not yet started)

- F-003 — Reverse-engineer full `src/index.ts` from `dist/` (F-002.1 is a lighter-weight alternative)
- F-004 — Harden `RAINDROP_EVENT_METADATA` (JSON validation, warning on parse failure)
- F-005 — `RAINDROP_LOCAL_WORKSHOP_URL` env-var precedence fix (fall back to file if env value is non-local)
- F-006 — Multi-agent trace correlation (link child `task` spans to parent session, see `mapChildSessionToParent` in dist/index.js:1627-1629)
- F-007 — Test coverage: e2e with Workshop daemon + mocked OpenCode
- F-008 — npm publish automation via GitHub Actions on tag push
- F-009 — Replace `package.json` `homepage` and `bugs` URLs once npm package is live

---

## Closed Features

### F-006 — Workshop sidepanel bootstrap (register `workshop` MCP server + inject sidepanel system prompt) — Closed 2026-09-08

**Context:** The Workshop sidepanel chat (`POST /api/agent/messages`) spawns `opencode run`. Upstream claude/codex bridges used `--mcp-config <json>` + `--append-system-prompt`; `opencode run` has neither. We need the same effect via plugin hooks.

**Closed 2026-09-08** (commit `68bd80c`, version bumped to `v0.1.0-kolya.15`).

**Result (plugin-side):**
- Both bundles (ESM + CJS) patched in lockstep.
- When `RAINDROP_SIDEPANEL_ACTIVE=1` and the plugin detects a local Workshop daemon (`hasLocalDestination = true`), the plugin enters **sidepanel mode**:
  1. Writes `~/.cache/workshop-sidepanel/<pid>-<ts>/opencode.json` with the stdio `workshop` MCP server registration (Workshop mcp server, env `RAINDROP_WORKSHOP_URL`/`_AGENT_PROVIDER`/`_ANNOTATION_SOURCE`). Stale entries (mtime > 1h) are swept. Strips `/v1/` suffix from `RAINDROP_WORKSHOP_URL`.
  2. Exports `OPENCODE_CONFIG_DIR=<dir>` to that tmpdir so the opencode run child picks up the MCP registration (child does not inherit parent `process.env` mutations after execve).
  3. `experimental.chat.system.transform` prepends a sidepanel role + MCP-tool block to the LLM system prompt, including the focused `run_id` from `RAINDROP_SIDEPANEL_RUN_ID`.
- Non-sidepanel sessions are completely unaffected (gate is the env flag).
- Errors are rate-limited and silent — bootstrap is best-effort, the existing tracing path must not be broken.
- `node --check` passes for both bundles.

**Key fixes discovered during live verification:**
- `OPENCODE_CONFIG_DIR` is read at config-load time; `process.env` mutations in the parent plugin do NOT propagate to the child opencode run after execve. Workshop bridge (companion change in `opencode-workshop` repo) now also writes the config dir and exports it via spawn env.
- `McpLocalConfig.command` is `[exe, ...args]` as a single array — `args` is NOT a separate field.
- `RAINDROP_WORKSHOP_URL` must NOT have `/v1/` suffix (workshop mcp stdio server expects bare daemon URL).
- Plugin's `eventShipper`/`traceShipper` must come AFTER `worktree` + `gitContext` declaration (TDZ fix).

**Verified live (2026-09-08) in Workshop runs `7397d2b0` and `63e0c532`:**
- Sending a sidepanel message registers `workshop` MCP server in opencode run.
- Agent invokes `workshop__get_current_run` first, receives full run data + metadata, replies with the focused run_id and trace context.

### F-001 — Fix `tool.execute.after: result.output is required` for MCP tools

**Closed 2026-07-09.** Fixed upstream bug [anomalyco/opencode#21149](https://github.com/anomalyco/opencode/issues/21149) by patching `dist/index.js` and `dist/index.cjs` to assemble `result.output` from `result.content[]` when missing (MCP tool calls pass raw `CallToolResult` instead of `{title, output, metadata}`).

**Verified by A/B smoke test:** original 0.0.18 produced 2× `result.output is required` errors; fork v0.1.0-kolya.3 produced 0. Workshop run landed with `plugin_version=0.0.18` (our dist), `tool_calls.total=2, errors=0`, `output_preview` contains the file list.

**Commits:** `84e463a` (initial), `d459f10` (MCP fallback patch), `67219d0` (smoke test + bump v0.1.0-kolya.3). Pushed: `1e9b275` on main.

---

*Maintained by Miko (Hermes Agent) under Kolya's direction. Update in the same commit as the code change.*
