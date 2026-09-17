# `@grudanov-nikolay/agenttrace-opencode-plugin`

agenttrace observability plugin for OpenCode. Streams OpenCode sessions,
events, and OTLP-style spans into the local agenttrace (formerly Workshop)
daemon on `http://localhost:5899` (and to Raindrop Cloud if a
`RAINDROP_WRITE_KEY` is set).

This is the first public release under the new name (`0.1.0`, renamed from
`@grudanov-nikolay/opencode-workshop-plugin@0.0.1` on 2026-09-17, F-024). It is
a **drop-in replacement** for the closed-source `@raindrop-ai/opencode-plugin`
and ships additional fixes on top. The daemon name moved from
`opencode-workshop` to `agenttrace`; companion packages now are
`@grudanov-nikolay/agenttrace` (daemon) and
`@grudanov-nikolay/agenttrace-opencode-plugin` (this plugin).

| | |
|---|---|
| **Upstream** | `@raindrop-ai/opencode-plugin@0.0.18` (npm-only, no public git) |
| **This fork** | `@grudanov-nikolay/agenttrace-opencode-plugin@0.1.0` |
| **Repo** | https://github.com/nikolay-grudanov/agenttrace-opencode-plugin |
| **License** | MIT (see [LICENSE](./LICENSE) — dual copyright Raindrop AI + Nikolai Grudanov) |
| **Verified** | A/B smoke test against upstream on `fff_find_files` MCP tool — 0 errors, 2 tool calls landed in agenttrace with status=OK |

## Install

```bash
pnpm add @grudanov-nikolay/agenttrace-opencode-plugin @opencode-ai/plugin
```

If your integration also uses the OpenCode SDK directly, install `@opencode-ai/sdk` as well.

Then add to your project or `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@grudanov-nikolay/agenttrace-opencode-plugin@0.1.0"]
}
```

For per-project `eventName` (so agenttrace UI splits runs by project), set:

```json
{
  "local_workshop_url": "http://127.0.0.1:5899/v1",
  "project_id": "support-prod"
}
```

or via env: `RAINDROP_PROJECT_ID=support-prod`.

## Local development

If you're working on the plugin itself, OpenCode 1.17.x loads plugins only from its own cache — `npm link` and `package.json` `file:` references are ignored. Use the install helper:

```bash
git clone https://github.com/nikolay-grudanov/agenttrace-opencode-plugin.git
cd agenttrace-opencode-plugin
./scripts/install-local.sh
```

Then add to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["@grudanov-nikolay/agenttrace-opencode-plugin@0.1.0"]
}
```

To pick up code changes after editing `dist/`:

```bash
./scripts/install-local.sh --reinstall   # or just restart OpenCode — symlink is hot
```

## What's different from upstream

1. **MCP `tool.execute.after` fix** — for MCP tool calls (GigaChat via MLProxy, jupyter_executor, anything using MCP), OpenCode passes raw `CallToolResult` (`{content: [{type, text}]}`) instead of the documented `{title, output, metadata}` shape. Upstream throws; this fork assembles `result.output` from `result.content[]` and continues.

2. **`RAINDROP_LOCAL_WORKSHOP_URL` non-local fallback** — if the env var is set to a non-local URL (stale `.bashrc` export, copy-paste mistake), fall back to `raindrop.json` `local_workshop_url` (or auto-detect) and emit a single rate-limited warning. Hardens the 2026-06-30 incident where we lost spans for 2 hours.

3. **`subagent_name` recovery on nested sub-agents (OpenCode 1.18)** — labels every level of `orchestrator → research → file-search → explore` chain on task spans + Subagent root + child LLM spans. Survives 4-level nesting. Workshop UI's `subagent_name` pill works out of the box.

4. **`result.error` → `status=ERROR`** — propagate OpenCode SDK `result.error` into the OTLP span's `status`, so failed tool calls actually show up as failures in the Workshop Statistics panel (was always `UNSET` upstream).

5. **Workshop sidepanel bootstrap** — when `RAINDROP_SIDEPANEL_ACTIVE=1` and a local Workshop daemon is detected, the plugin registers a `workshop` MCP server via the `config` hook and prepends a sidepanel system prompt via `experimental.chat.system.transform`. Sidepanel chat in the Workshop UI can drive the same `opencode run` child process.

6. **Verified against original** — A/B smoke test on real MCP tool: original 0.0.18 produced 2× `result.output is required` errors; this fork produced 0.

7. **Drop-in replacement** — same npm name shape, same OpenCode plugin interface, same event payload format. Just swap the package name in your config.

See [`ai-docs/PLAN.md`](ai-docs/PLAN.md) for the full development plan (F-001 through F-006 closed, F-002 in progress with install helper, CI smoke test, and prettier reformat; F-007+ in backlog).

## Notes

- `@opencode-ai/plugin` is required (peer dependency).
- `@opencode-ai/sdk` is an optional peer dependency.
- The plugin source is in `dist/` (minified bundles). F-002.1 will add section markers; F-003 in the backlog will produce a readable `src/index.ts`.
- Pre-1.0 alpha. APIs may shift before `1.0.0`. Pin exact versions in production.

## License

MIT — same as upstream. See [`LICENSE`](LICENSE).
