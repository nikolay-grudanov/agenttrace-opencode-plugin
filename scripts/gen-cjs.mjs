#!/usr/bin/env node
// scripts/gen-cjs.mjs — generate dist/index.cjs from dist/index.js.
//
// WHY (F-040): the plugin ships a hand-patched ESM bundle (dist/index.js) plus a
// hand-patched CJS twin (dist/index.cjs). Before F-040 the two files had drifted
// (dist/index.cjs was an older snapshot: it was missing the `gitContext`
// argument, the F-006 sidepanel bootstrap and the F-040 v2 adapter). Keeping two
// hand-edited copies of a 2800-line bundle in sync by hand is a bug factory, so
// the CJS twin is now *generated* from the ESM bundle.
//
// WHAT: dist/index.js is plain ESM with exactly six top-level module syntax
// constructs:
//   1187  import { AsyncLocalStorage } from "async_hooks";
//   1188  import { createRequire } from "module";        <- F-040 Node-ESM require shim
//   1223  import { existsSync, readFileSync } from "fs";
//   1224  import { homedir } from "os";
//   1225  import { join } from "path";
//   2864  export default { id, setup, server };
// No dynamic `import()`, no `import.meta`, no top-level await — so a mechanical
// rewrite is safe. This script performs exactly that rewrite and prepends a
// tsup-style CommonJS preamble.
//
// The generated CJS keeps the `nodeRequire` shim verbatim; in CJS `typeof require
// === "function"` is true so `nodeRequire` aliases the real `require`.
//
// USAGE:  node scripts/gen-cjs.mjs        (from the plugin repo root)
//         node --check dist/index.cjs     (verify)
//
// If dist/index.js ever grows a real `src/index.ts` + tsup pipeline (roadmap
// item T1-L), this script becomes a no-op and tsup takes over.

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const srcPath = resolve(root, "dist/index.js")
const outPath = resolve(root, "dist/index.cjs")

const ESM_IMPORT_RE = /^import \{[^}]*\} from "[^"]*";\r?\n/gm

// Identifiers imported by the bundle, mapped onto their `require` result. Keep
// in sync with the import statements asserted below — the script fails loudly if
// an import appears that is not listed here.
const BINDINGS = {
  "async_hooks": { AsyncLocalStorage: "AsyncLocalStorage" },
  module: { createRequire: "createRequire" },
  fs: { existsSync: "existsSync", readFileSync: "readFileSync" },
  os: { homedir: "homedir" },
  path: { join: "join" },
}

const PREAMBLE = `"use strict";
// GENERATED FILE — do not edit by hand.
// Source: dist/index.js  •  Regenerate: node scripts/gen-cjs.mjs
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)__defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === "object") || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
`

const source = readFileSync(srcPath, "utf8")

// --- 1. sanity: no dynamic import / import.meta / top-level await ------------
for (const [pattern, hint] of [
  [/\bimport\s*\(/, "dynamic import() found — gen-cjs cannot rewrite it"],
  [/\bimport\.meta\b/, "import.meta found — gen-cjs cannot rewrite it"],
  [/\bexport\s+\*|\bexport\s+(const|let|var|function|class|\{)/, "named re-export found — gen-cjs only rewrites the default export"],
]) {
  if (pattern.test(source)) throw new Error(hint)
}

// --- 2. collect + strip the ESM imports --------------------------------------
const importLines = source.match(ESM_IMPORT_RE) ?? []
const seen = new Set()
for (const line of importLines) {
  const match = /^import \{([^}]*)\} from "([^"]*)";$/.exec(line.trim())
  if (!match) throw new Error(`unrecognised import statement: ${line.trim()}`)
  const [, names, specifier] = match
  const table = BINDINGS[specifier]
  if (!table) throw new Error(`new bare import "${specifier}" — add it to BINDINGS in scripts/gen-cjs.mjs`)
  for (const name of names.split(",").map((n) => n.trim()).filter(Boolean)) {
    if (!(name in table)) throw new Error(`new binding "${name}" from "${specifier}" — add it to BINDINGS`)
    seen.add(`${specifier}:${name}`)
  }
}
for (const key of seen) {
  const [specifier, name] = key.split(":")
  if (!(name in BINDINGS[specifier])) throw new Error(`binding drift: ${key}`)
}

// --- 3. rewrite the default export ------------------------------------------
const EXPORT_RE = /^export default \{/m
if (!EXPORT_RE.test(source)) throw new Error("expected a top-level `export default {` in dist/index.js")
let body = source.replace(EXPORT_RE, "var index_default = {")

// --- 4. assemble -------------------------------------------------------------
const shimLines = Object.entries(BINDINGS).map(([specifier, table]) => {
  const alias = "import_node_" + specifier.replace(/[^a-z0-9]/gi, "_")
  const assigns = Object.keys(table)
    .map((name) => `var ${name} = ${alias}.${table[name]};`)
    .join("\n")
  return `var ${alias} = require("${specifier}");\n${assigns}`
})

const footer = `
var index_exports = {};
__export(index_exports, { default: () => index_default });
module.exports = __toCommonJS(index_exports);
`

const out =
  PREAMBLE +
  shimLines.join("\n") +
  "\n// src/index.ts\n" +
  body.replace(ESM_IMPORT_RE, "") +
  footer

writeFileSync(outPath, out, "utf8")
console.log(`gen-cjs: wrote ${outPath} (${out.length} bytes, ${out.split("\n").length} lines)`)
console.log(`gen-cjs: rewrote ${importLines.length} import statement(s), 1 default export`)