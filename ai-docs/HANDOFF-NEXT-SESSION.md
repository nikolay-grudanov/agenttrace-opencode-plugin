# HANDOFF-NEXT-SESSION — Plugin Tier 1 picks up here

> **For:** Next-session Miko (or any agent picking up plugin Tier 1 work).
> **Generated:** 2026-09-04 by the session that closed F-005/F-010 v2/F-013.
> **Read first:** `ai-docs/PLAN.md`, `ai-docs/AGENTS.md` (conventions).

## What's open — Tier 1

### T1-B. F-011 — Bug fix: `loadConfig()` cwd vs project root mismatch
- **Spec:** `ai-docs/specs/F-011-loadconfig-cwd-bug.md`
- **Estimated effort:** 1-2 hours
- **Why this matters:** Without it, multi-project isolation (per-`eventName` partitioning in workshop UI) is broken — every session lands as `event_name="opencode_session"` regardless of where you put `raindrop.json` in your workdir.
- **How to fix:** Read the spec, do F-011-P1 (3-line change in `loadConfig()` in both bundles). Bump version to `0.1.0-kolya.13`.

## State on disk (as of 2026-09-04)

| Path | State |
|---|---|
| `~/workspase/projects/agenttrace-opencode-plugin/dist/{index.js,index.cjs}` | At v0.1.0-kolya.12 (F-005 shipped) |
| `~/.config/opencode/plugins/opencode-workshop-plugin.js` | Static copy at kolya.12 |
| `~/workspase/projects/agenttrace-opencode-plugin/ai-docs/PLAN.md` | Has Tier 1 roadmap section |
| `~/workspase/projects/agenttrace-opencode-plugin/ai-docs/specs/F-011-loadconfig-cwd-bug.md` | Ready to implement |
| Workshop daemon | Running on pid 2202413 via `bun --watch src/index.ts` — auto-reloads on `src/` changes |
| `~/.raindrop/raindrop_workshop.db` | ~520 spans, all event_name="opencode_session" (this is the bug) |

## Critical constraints (do NOT violate)

- **No auto-commit / no auto-push** — Kolya's word required for both.
- **No daemon restart** — even though it's the plugin and not the daemon directly, restarting Workshop daemon requires Kolya. Plugin changes are picked up automatically next time OpenCode loads it (via static copy in `~/.config/opencode/plugins/`).
- **Both bundles in lockstep** — every patch to `dist/index.js` must also land in `dist/index.cjs` byte-identically (modulo quote style).
- **Static copy** — every change to `dist/index.js` must be copied to `~/.config/opencode/plugins/opencode-workshop-plugin.js`.

## Known side discoveries

- `RAINDROP_WORKSHOP=enable/disable` form doesn't work (upstream readEnvVar shim). Cosmetic; URL form works.
- This plugin has no `src/index.ts` — we hand-edit `dist/{js,cjs}` directly. This is a known limitation documented in F-002 of plugin PLAN.md.

## How to pick up

1. Read this file + `ai-docs/PLAN.md` + `ai-docs/specs/F-011-loadconfig-cwd-bug.md`.
2. Patch both bundles in lockstep.
3. Bump version to `0.1.0-kolya.13`.
4. Copy to `~/.config/opencode/plugins/opencode-workshop-plugin.js`.
5. Live-verify (script in spec §6).
6. Update PLAN.md, commit.
7. **Stop.** Wait for Kolya's "пуш".

---

*Handoff maintained by Miko. Last updated 2026-09-04.*
