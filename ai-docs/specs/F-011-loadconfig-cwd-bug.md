# F-011 — Bug Fix: `loadConfig()` cwd vs project root mismatch

> **Status:** Planning spec. Roadmap Tier 1 (next-up). Not yet implemented.
> **Author:** Miko (Hermes Agent) for Kolya Gruanov, 2026-09-04.
> **Repo:** `~/workspase/projects/agenttrace-opencode-plugin` (companion plugin).
> **Estimated effort:** 1-2 hours.
> **Commits target:** 1-2 atomic commits.

---

## 1. Problem statement

### What's broken

The plugin's `loadConfig(projectDirectory)` reads `raindrop.json` from these two locations:

```js
const configPaths = [
  join(homedir(), ".config", "opencode", "raindrop.json"),
  join(projectDirectory, ".opencode", "raindrop.json")
];
```

But OpenCode passes **`input.directory`** (project root, not cwd) as `projectDirectory`. If Kolya places `raindrop.json` in his workdir (cwd) with `{"eventName": "my-project", "local_workshop_url": "..."}`, **the plugin never reads it** because:

- `~/.config/opencode/raindrop.json` doesn't exist (Kolya doesn't put it there)
- `<input.directory>/.opencode/raindrop.json` doesn't exist (Kolya doesn't put it there either)

The result: `eventName` defaults to `"opencode_session"` and `local_workshop_url` falls back to env var (which, after F-005 fix, may not even be set).

### Concrete reproduction (already done in F-005 live test)

```
$ cd /tmp/f005-live && cat raindrop.json
{
  "local_workshop_url": "http://localhost:5899/v1",
  "eventName": "f005-live",
  "trace_only": true
}

$ RAINDROP_LOCAL_WORKSHOP_URL="https://stale.example.com/v1/" \
  OPENCODE_CONFIG=/tmp/f005-live/opencode.jsonc \
  opencode run --model minimax-coding-plan/MiniMax-M3 --agent orchestrator "DONE."

[kolya-oswp] [warn] RAINDROP_LOCAL_WORKSHOP_URL=... is not a local URL; falling back to raindrop.json (or auto-detect).
[kolya-oswp] [info] Loading @grudanov-nikolay/opencode-workshop-plugin v0.1.0-kolya.12
[kolya-oswp] [info] Raindrop tracing enabled — destinations: local Workshop (http://localhost:5899/v1/)

> orchestrator · MiniMax-M3
DONE.
```

In the resulting DB row, `event_name="opencode_session"` (default), not `"f005-live"`. **The raindrop.json in cwd is ignored.**

When Kolya copied the file to `~/.config/opencode/raindrop.json`, the trace.log showed `Local debugger mirroring: http://localhost:5899/v1/` but `event_name` was still `"opencode_session"` — because OpenCode's `input.directory` is a different project root.

### Why it hurts

Multi-project isolation (F-007 in workshop) depends on per-project `eventName`. If you can't get `eventName` to take effect without putting `raindrop.json` in a non-obvious path, the whole feature degrades to "all sessions look the same in the UI".

This is the upstream behaviour inherited from `@raindrop-ai/opencode-plugin@0.0.18`. Our fork never fixed it.

---

## 2. Goal

**`raindrop.json` placed in cwd or workdir is read by the plugin** for the relevant fields, even when `<input.directory>` differs from cwd.

---

## 3. Non-goals

| Out of scope | Why |
|---|---|
| Search up the directory tree | Risk of grabbing wrong config from a parent dir. Cwd + homedir + project-dir is enough. |
| Watch `raindrop.json` for live changes | Plugin loads config once at startup; live-reload is F-007's problem, not this fix. |
| Backwards-incompatible path changes | Keep `~/.config/opencode/raindrop.json` and `<project>/.opencode/raindrop.json` working as today. Just **add cwd as a third option**. |

---

## 4. Design

### 4.1 Resolution order — three paths

```js
const configPaths = [
  join(homedir(), ".config", "opencode", "raindrop.json"),
  join(projectDirectory, ".opencode", "raindrop.json"),
  join(process.cwd(), ".opencode", "raindrop.json"),       // NEW: cwd-relative
];
```

**Rationale:**
- Homedir stays first (system-wide override wins)
- `projectDirectory/.opencode/raindrop.json` second (existing project-relative)
- `cwd/.opencode/raindrop.json` third (catches the workdir case where Kolya actually puts the file)

We deliberately **do NOT search up the tree** — that's surprising and hard to debug. Three explicit paths is the right level.

### 4.2 What about cwd without `.opencode/` subdir?

Kolya's test put `raindrop.json` directly in `/tmp/f005-live/`, not in `/tmp/f005-live/.opencode/`. We should also handle that — but with lower priority to avoid surprising matches in unrelated dirs:

```js
const configPaths = [
  join(homedir(), ".config", "opencode", "raindrop.json"),
  join(projectDirectory, ".opencode", "raindrop.json"),
  join(projectDirectory, "raindrop.json"),            // NEW: project-root
  join(process.cwd(), ".opencode", "raindrop.json"),  // NEW: cwd
  join(process.cwd(), "raindrop.json"),               // NEW: cwd bare
];
```

Test in order, merge first-match-found. First match wins for each file (the loop merges, so later paths override earlier ones — that's actually the **upstream behaviour**, see §4.3).

### 4.3 Upstream merge order quirk

Upstream code:

```js
for (const configPath of configPaths) {
  ...
  merged = { ...merged, ...parsed };
}
```

This means **later paths override earlier paths** (because spread). If both `~/.config/opencode/raindrop.json` AND cwd `raindrop.json` exist, cwd wins. That's probably fine — local config overrides system config — but it might surprise someone.

We'll keep this behaviour but **document it explicitly** in the warning message and in the spec. Don't change the merge order in this fix; that's a separate decision.

### 4.4 Optional: env var override

Two new env vars (opt-in, optional):

```
RAINDROP_CONFIG_PATHS=path1,path2,path3
```

If set, replaces the default `configPaths` array entirely. Use case: CI environments with deterministic paths. Off by default.

Skip this for the initial fix; add in a follow-up if needed.

---

## 5. Implementation plan — atomic commits

### Commit 1: F-011-P1 — Add cwd + bare paths to config search

Files:
- `dist/index.js` and `dist/index.cjs` — extend `configPaths` array in `loadConfig()`
- `package.json` — bump version (`0.1.0-kolya.13`)
- Static copy: `~/.config/opencode/plugins/opencode-workshop-plugin.js`

Code change (both bundles):

```js
const configPaths = [
  join(homedir(), ".config", "opencode", "raindrop.json"),
  join(projectDirectory, ".opencode", "raindrop.json"),
  join(projectDirectory, "raindrop.json"),            // F-011: project root
  join(process.cwd(), ".opencode", "raindrop.json"),  // F-011: cwd
  join(process.cwd(), "raindrop.json"),               // F-011: cwd bare
];
```

Verification:
- `node --check` both bundles
- Static unit test: write a small driver that calls `loadConfig()` with mock paths and verifies it picks up `cwd/raindrop.json`

### Commit 2 (optional): F-011-P2 — Tests + docs

Files:
- `dist/index.{js,cjs}` — no change (config resolution is upstream-internal)
- `tests/config-paths.test.cjs` — 5 unit tests:
  1. cwd-only `raindrop.json` is read
  2. cwd `.opencode/raindrop.json` is read
  3. projectDirectory `raindrop.json` is read
  4. homedir still wins over cwd when both exist
  5. cwd is not read if it doesn't exist (no error)

Skip this commit if F-011 stays small and well-tested via live smoke.

### Commit 3 (docs): F-011-P3 — Update PLAN.md + AGENTS.md

- `ai-docs/PLAN.md` — add F-011 entry, mark Closed YYYY-MM-DD
- `AGENTS.md` — note the 5-path resolution order in the config section

---

## 6. Live verification

Reproduce the F-005 scenario but with cwd `raindrop.json` instead of `~/.config/...`:

```bash
$ cd /tmp/f011-live
$ cat > raindrop.json <<EOF
{
  "local_workshop_url": "http://localhost:5899/v1",
  "eventName": "f011-test",
  "trace_only": true
}
EOF
$ cat > opencode.jsonc <<EOF
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/home/gna/.config/opencode/plugins/opencode-workshop-plugin.js"],
  "permission": {"task": "deny"},
  "agent": {"orchestrator": {"description": "x", "mode": "primary", "prompt": "x"}}
}
EOF

$ OPENCODE_CONFIG=/tmp/f011-live/opencode.jsonc opencode run --model minimax-coding-plan/MiniMax-M3 --agent orchestrator "DONE."

# Expected:
# - trace.log shows plugin loaded v0.1.0-kolya.13
# - run lands in DB with event_name="f011-test" (not "opencode_session")
# - trace.log shows correct workshop URL from cwd raindrop.json
```

If `event_name="f011-test"` shows in the DB row → bug fixed.

---

## 7. Files touched (final list)

```
dist/index.js                                       MODIFIED (extend configPaths)
dist/index.cjs                                      MODIFIED (lockstep)
package.json                                        MODIFIED (version bump)
~/.config/opencode/plugins/opencode-workshop-plugin.js  UPDATED (static copy)
ai-docs/PLAN.md                                     MODIFIED (F-011 entry)
ai-docs/AGENTS.md                                   MODIFIED (config resolution order note)
```

Total: 4-6 files modified, 0-1 new test file. Estimated diff: +15 lines, -2 lines.

---

## 8. Done criteria

- [ ] Commit(s) merged locally on plugin `main`
- [ ] `node --check` both bundles pass
- [ ] Live verification: cwd `raindrop.json` is picked up, `eventName` takes effect
- [ ] No regression: existing `~/.config/opencode/raindrop.json` path still works
- [ ] Static copy `~/.config/opencode/plugins/opencode-workshop-plugin.js` updated
- [ ] PLAN.md updated with `Closed YYYY-MM-DD`
- [ ] **Kolya's explicit "push" given** before pushing

---

## 9. Risks and open questions

| Risk | Mitigation |
|---|---|
| `process.cwd()` returns a different path in some runtime edge cases (chroot, symlinks) | Acceptable — better than the current "completely ignored" state. Document the behaviour. |
| Picking up `raindrop.json` from an unrelated dir (e.g., parent of cwd) | Don't search up. Three paths is enough. |
| Upstream merges later paths over earlier — confusing | Document in AGENTS.md. Don't fix the merge order in this PR. |

---

*Prepared by Miko for Kolya, 2026-09-04. Ready for the next session.*
