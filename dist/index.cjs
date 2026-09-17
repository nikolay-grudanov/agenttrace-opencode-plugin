"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all) __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === "object") || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => plugin,
});
module.exports = __toCommonJS(index_exports);

// ../core/dist/chunk-WKRW55KX.js
function getCrypto() {
  const c = globalThis.crypto;
  return c;
}
function randomBytes(length) {
  const cryptoObj = getCrypto();
  const out = new Uint8Array(length);
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}
function base64Encode(bytes) {
  const maybeBuffer = globalThis.Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i2 = 0; i2 < bytes.length; i2++) {
    binary += String.fromCharCode(bytes[i2]);
  }
  const btoaFn = globalThis.btoa;
  if (typeof btoaFn === "function") return btoaFn(binary);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  let i = 0;
  while (i < binary.length) {
    const c1 = binary.charCodeAt(i++) & 255;
    const c2 = i < binary.length ? binary.charCodeAt(i++) & 255 : NaN;
    const c3 = i < binary.length ? binary.charCodeAt(i++) & 255 : NaN;
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (Number.isNaN(c2) ? 0 : c2 >> 4);
    const e3 = Number.isNaN(c2) ? 64 : ((c2 & 15) << 2) | (Number.isNaN(c3) ? 0 : c3 >> 6);
    const e4 = Number.isNaN(c3) ? 64 : c3 & 63;
    out += alphabet.charAt(e1);
    out += alphabet.charAt(e2);
    out += e3 === 64 ? "=" : alphabet.charAt(e3);
    out += e4 === 64 ? "=" : alphabet.charAt(e4);
  }
  return out;
}
function generateId() {
  return base64Encode(randomBytes(12)).replace(/[+/=]/g, "").slice(0, 16);
}
function runWithTracingSuppressed(fn) {
  const hook = globalThis.RAINDROP_SUPPRESS_TRACING;
  if (typeof hook !== "function") return fn();
  let started = false;
  try {
    return hook(() => {
      started = true;
      return fn();
    });
  } catch (err) {
    if (started) throw err;
    return fn();
  }
}
var DEFAULT_REQUEST_TIMEOUT_MS = 3e4;
var MAX_RETRY_DELAY_MS = 3e4;
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function formatEndpoint(endpoint) {
  if (!endpoint) return void 0;
  return endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
}
function redactUrlForLog(url) {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch (e) {
    return "<unparseable-url>";
  }
}
var RATE_LIMITED_LOG_INTERVAL_MS = 3e4;
var rateLimitedLogLast = /* @__PURE__ */ new Map();
function rateLimitedLog(key, log) {
  const now = Date.now();
  const last = rateLimitedLogLast.get(key);
  if (last !== void 0 && now - last < RATE_LIMITED_LOG_INTERVAL_MS) {
    return false;
  }
  rateLimitedLogLast.set(key, now);
  log();
  return true;
}
async function raceWithTimeout(promise, timeoutMs) {
  let timer;
  const settledInTime = await Promise.race([
    promise.then(
      () => true,
      () => true,
    ),
    new Promise((resolve) => {
      var _a;
      timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
      (_a = timer.unref) == null ? void 0 : _a.call(timer);
    }),
  ]);
  if (timer) clearTimeout(timer);
  return settledInTime;
}
function parseRetryAfter(headers) {
  var _a;
  const value = (_a = headers.get("Retry-After")) != null ? _a : headers.get("retry-after");
  if (!value) return void 0;
  const asNumber = Number(value);
  if (value.trim() !== "" && !Number.isNaN(asNumber)) return asNumber * 1e3;
  const asDate = new Date(value).getTime();
  if (!Number.isNaN(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }
  return void 0;
}
function getRetryDelayMs(attemptNumber, previousError) {
  if (previousError && typeof previousError === "object" && previousError !== null && "retryAfterMs" in previousError) {
    const v = previousError.retryAfterMs;
    if (typeof v === "number") return Math.min(Math.max(0, v), MAX_RETRY_DELAY_MS);
  }
  if (attemptNumber <= 1) return 0;
  const base = 500;
  const factor = Math.pow(2, attemptNumber - 2);
  return Math.min(base * factor, MAX_RETRY_DELAY_MS);
}
async function withRetry(operation, opName, opts) {
  const prefix = opts.sdkName ? `[raindrop-ai/${opts.sdkName}]` : "[raindrop-ai/core]";
  let lastError = void 0;
  for (let attemptNumber = 1; attemptNumber <= opts.maxAttempts; attemptNumber++) {
    if (attemptNumber > 1) {
      const delay = getRetryDelayMs(attemptNumber, lastError);
      if (opts.debug) {
        console.warn(`${prefix} ${opName} retry ${attemptNumber}/${opts.maxAttempts} in ${delay}ms`);
      }
      if (delay > 0) await wait(delay);
    } else if (opts.debug) {
      console.log(`${prefix} ${opName} attempt ${attemptNumber}/${opts.maxAttempts}`);
    }
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      if (opts.debug) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`${prefix} ${opName} attempt ${attemptNumber} failed: ${msg}${attemptNumber === opts.maxAttempts ? " (no more retries)" : ""}`);
      }
      if (lastError && typeof lastError === "object" && "retryable" in lastError && !lastError.retryable) break;
      if (attemptNumber === opts.maxAttempts) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
async function postJson(url, body, headers, opts) {
  var _a;
  const opName = `POST ${redactUrlForLog(url)}`;
  const timeoutMs = (_a = opts.timeoutMs) != null ? _a : DEFAULT_REQUEST_TIMEOUT_MS;
  await withRetry(
    async () => {
      const resp = await runWithTracingSuppressed(() =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        }),
      );
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        const err = new Error(`HTTP ${resp.status} ${resp.statusText}${text ? `: ${text}` : ""}`);
        const retryAfterMs = parseRetryAfter(resp.headers);
        if (typeof retryAfterMs === "number") err.retryAfterMs = retryAfterMs;
        err.retryable = resp.status === 429 || resp.status >= 500;
        throw err;
      }
    },
    opName,
    opts,
  );
}
var DEFAULT_MAX_TEXT_FIELD_CHARS = 1e6;
var TRUNCATION_MARKER = "...[truncated by raindrop]";
var currentDefaultMaxTextFieldChars = DEFAULT_MAX_TEXT_FIELD_CHARS;
function resolveMaxTextFieldChars(value) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return currentDefaultMaxTextFieldChars;
}
function truncateToLimit(text, limit) {
  if (limit > TRUNCATION_MARKER.length) {
    return text.slice(0, limit - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
  }
  return text.slice(0, Math.max(0, limit));
}
function capText(value, limit) {
  if (typeof value !== "string") return value;
  const max = limit != null ? limit : currentDefaultMaxTextFieldChars;
  if (value.length <= max) return value;
  return truncateToLimit(value, max);
}
var SpanStatusCode = {
  UNSET: 0,
  OK: 1,
  ERROR: 2,
};
function createSpanIds(parent) {
  const traceId = parent ? parent.traceIdB64 : base64Encode(randomBytes(16));
  const spanId = base64Encode(randomBytes(8));
  return {
    traceIdB64: traceId,
    spanIdB64: spanId,
    parentSpanIdB64: parent ? parent.spanIdB64 : void 0,
  };
}
function nowUnixNanoString() {
  return Date.now().toString() + "000000";
}
function attrString(key, value) {
  if (value === void 0) return void 0;
  return { key, value: { stringValue: value } };
}
function attrInt(key, value) {
  if (value === void 0) return void 0;
  if (!Number.isFinite(value)) return void 0;
  return { key, value: { intValue: String(Math.trunc(value)) } };
}
// KOLYA PATCH (F-003): mirror of extractTaskLabel in index.js. See ESM for rationale.
function extractTaskLabel(rawArgs) {
  // F-010 hardening: OpenCode can deliver tool args as a JSON *string*
  // (the after-hook already tolerates this shape via capText2). Parse
  // before reading, otherwise the description never reaches the span.
  let args = rawArgs;
  if (typeof args === "string") {
    const trimmed = args.trim();
    if (!trimmed.startsWith("{")) return "";
    try {
      args = JSON.parse(trimmed);
    } catch (_err) {
      return "";
    }
  }
  if (!args || typeof args !== "object") return "";
  const desc = args.description;
  if (typeof desc === "string" && desc.trim().length > 0) return desc.trim().slice(0, 120);
  const prompt = args.prompt;
  if (typeof prompt === "string" && prompt.trim().length > 0) return prompt.trim().slice(0, 60);
  return "";
}
// KOLYA PATCH (F-010): best-effort sub-agent name recovery from the task
// prompt text (the child session's first user message, i.e. chat.message
// parts). Recognises identity preambles: 'You are "name"' (quoted),
// 'You are name.' (bare), or an explicit 'name: value' header. Returns ""
// when nothing recognisable is found — Workshop then falls back to task N.
function extractSubagentNameFromPrompt(text) {
  if (typeof text !== "string" || text.length === 0) return "";
  const head = text.slice(0, 400);
  let m = head.match(/you\s+are\s+["\u201c'\u00ab]([^"\u201d'\u00bb]{1,80})["\u201d'\u00bb]/i);
  if (m) return m[1].trim().slice(0, 120);
  m = head.match(/you\s+are\s+(?:the\s+|an?\s+)?([A-Za-z0-9][A-Za-z0-9._\- ]{1,60}?)(?:[.,;\n]|\s+that\s)/i);
  if (m && m[1].trim().split(/\s+/).length <= 6) return m[1].trim().slice(0, 120);
  m = head.match(/(?:^|\n)\s*["\u201c'\u00ab]?name["\u201d'\u00bb]?\s*[:=]\s*["\u201c'\u00ab]?([A-Za-z0-9][A-Za-z0-9._\- ]{0,60})/i);
  if (m) return m[1].trim().slice(0, 120);
  return "";
}
// KOLYA PATCH (F-010 v2): see index.js. In OpenCode 1.18 the child's first
// user message has no identity preamble (system prompt holds it), so we fall
// back to args.subagent_type stashed by the parent tool.execute.after hook.
function extractSubagentNameFromTaskArgs(rawArgs) {
  let args = rawArgs;
  if (typeof args === "string") {
    const trimmed = args.trim();
    if (!trimmed.startsWith("{")) return "";
    try {
      args = JSON.parse(trimmed);
    } catch (_err) {
      return "";
    }
  }
  if (!args || typeof args !== "object") return "";
  const st = args.subagent_type;
  if (typeof st === "string" && st.trim().length > 0 && /^[A-Za-z0-9._\-]{1,64}$/.test(st.trim())) {
    return st.trim();
  }
  return "";
}
function buildOtlpSpan(args) {
  const attrs = args.attributes.filter((x) => x !== void 0);
  const span = {
    traceId: args.ids.traceIdB64,
    spanId: args.ids.spanIdB64,
    name: args.name,
    startTimeUnixNano: args.startTimeUnixNano,
    endTimeUnixNano: args.endTimeUnixNano,
  };
  if (args.ids.parentSpanIdB64) span.parentSpanId = args.ids.parentSpanIdB64;
  if (attrs.length) span.attributes = attrs;
  if (args.status) span.status = args.status;
  return span;
}
function buildExportTraceServiceRequest(spans, serviceName = "raindrop.core", serviceVersion = "0.0.0") {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: serviceName } }],
        },
        scopeSpans: [
          {
            scope: { name: serviceName, version: serviceVersion },
            spans,
          },
        ],
      },
    ],
  };
}
var LOCAL_DEBUGGER_ENV_VAR = "RAINDROP_LOCAL_DEBUGGER";
var WORKSHOP_ENV_VAR = "RAINDROP_WORKSHOP";
var DEFAULT_LOCAL_WORKSHOP_URL = "http://localhost:5899/v1/";
function readEnvVar(name) {
  var _a;
  try {
    const env = (_a = globalThis == null ? void 0 : globalThis.process) == null ? void 0 : _a.env;
    if (env && typeof env[name] === "string" && env[name].length > 0) {
      return env[name];
    }
  } catch (e) {}
  return void 0;
}
function readWorkshopEnv() {
  const raw = readEnvVar(WORKSHOP_ENV_VAR);
  if (raw === void 0) return void 0;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return void 0;
  if (/^https?:\/\//i.test(trimmed)) {
    // KOLYA PATCH (F-005): same precedence guard.
    if (!isLocalUrl(trimmed)) {
      rateLimitedLog("workshop_env_non_local", () => console.warn(`[oc-wsp] [warn] RAINDROP_WORKSHOP=${trimmed} is not a local URL; ignoring.`));
      return void 0;
    }
    return { url: trimmed };
  }
  if (/^(1|true|yes|on)$/i.test(trimmed)) return "enable";
  if (/^(0|false|no|off)$/i.test(trimmed)) return "disable";
  return void 0;
}
function isLocalDevHost(hostname) {
  if (!hostname) return false;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") {
    return true;
  }
  if (hostname.endsWith(".localhost")) return true;
  return false;
}
// KOLYA PATCH (F-005): URL-level local-host check used by env-var precedence.
function isLocalUrl(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  let hostname;
  try { hostname = new URL(value).hostname.toLowerCase(); } catch (_e) { return false; }
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") return true;
  if (hostname === "[::1]" || hostname.startsWith("::ffff:127.") || hostname.startsWith("::ffff:7f00:1")) return true;
  if (hostname.endsWith(".localhost")) return true;
  return false;
}
function readRuntimeHostname() {
  try {
    const loc = globalThis == null ? void 0 : globalThis.location;
    if (loc && typeof loc.hostname === "string" && loc.hostname.length > 0) {
      return loc.hostname;
    }
  } catch (e) {}
  return void 0;
}
function shouldAutoEnableLocalWorkshop() {
  if (isLocalDevHost(readRuntimeHostname())) return true;
  if (readEnvVar("NODE_ENV") === "development") return true;
  return false;
}
function resolveLocalDebuggerBaseUrl(baseUrl) {
  var _a, _b, _c;
  if (baseUrl === null) return null;
  if (typeof baseUrl === "string" && baseUrl.length > 0) {
    return (_a = formatEndpoint(baseUrl)) != null ? _a : null;
  }
  const explicitUrlEnv = readEnvVar(LOCAL_DEBUGGER_ENV_VAR);
  if (explicitUrlEnv) return (_b = formatEndpoint(explicitUrlEnv)) != null ? _b : null;
  const workshopEnv = readWorkshopEnv();
  if (workshopEnv === "disable") return null;
  if (workshopEnv === "enable") return DEFAULT_LOCAL_WORKSHOP_URL;
  if (workshopEnv && "url" in workshopEnv) return (_c = formatEndpoint(workshopEnv.url)) != null ? _c : null;
  if (shouldAutoEnableLocalWorkshop()) return DEFAULT_LOCAL_WORKSHOP_URL;
  return null;
}
function mirrorTraceExportToLocalDebugger(body, options = {}) {
  var _a;
  const baseUrl = resolveLocalDebuggerBaseUrl(options.baseUrl);
  if (!baseUrl) return;
  void postJson(
    `${baseUrl}traces`,
    body,
    {},
    {
      maxAttempts: 1,
      debug: (_a = options.debug) != null ? _a : false,
      sdkName: options.sdkName,
    },
  ).catch(() => {});
}
function mirrorPartialEventToLocalDebugger(event, options = {}) {
  var _a;
  const baseUrl = resolveLocalDebuggerBaseUrl(options.baseUrl);
  if (!baseUrl) return;
  const headers = options.writeKey ? { Authorization: `Bearer ${options.writeKey}` } : {};
  void postJson(`${baseUrl}events/track_partial`, event, headers, {
    maxAttempts: 1,
    debug: (_a = options.debug) != null ? _a : false,
    sdkName: options.sdkName,
  }).catch(() => {});
}
var PROJECT_ID_HEADER = "X-Raindrop-Project-Id";
var PROJECT_ID_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function isValidProjectIdSlug(value) {
  return PROJECT_ID_SLUG_PATTERN.test(value);
}
function normalizeProjectId(raw, opts) {
  if (typeof raw !== "string") return void 0;
  const trimmed = raw.trim();
  if (!trimmed) return void 0;
  if (!isValidProjectIdSlug(trimmed) && opts.debug) {
    console.warn(`${opts.prefix} projectId "${trimmed}" does not match slug ${PROJECT_ID_SLUG_PATTERN.source}; sending anyway \u2014 backend may reject with HTTP 400`);
  }
  return trimmed;
}
function projectIdHeaders(projectId) {
  return projectId ? { [PROJECT_ID_HEADER]: projectId } : {};
}
var SHUTDOWN_DEADLINE_MS = 1e4;
var POST_SHUTDOWN_TIMEOUT_MS = 5e3;
function mergePatches(target, source) {
  var _a, _b, _c, _d;
  const out = { ...target, ...source };
  if (target.properties || source.properties) {
    out.properties = { ...((_a = target.properties) != null ? _a : {}), ...((_b = source.properties) != null ? _b : {}) };
  }
  if (target.attachments || source.attachments) {
    out.attachments = [...((_c = target.attachments) != null ? _c : []), ...((_d = source.attachments) != null ? _d : [])];
  }
  return out;
}
var EventShipper = class {
  constructor(opts) {
    this.buffers = /* @__PURE__ */ new Map();
    this.sticky = /* @__PURE__ */ new Map();
    this.timers = /* @__PURE__ */ new Map();
    this.inFlight = /* @__PURE__ */ new Set();
    this.hasShutdown = false;
    var _a, _b, _c, _d, _e, _f, _g, _h;
    this.writeKey = (_a = opts.writeKey) == null ? void 0 : _a.trim();
    this.baseUrl = (_b = formatEndpoint(opts.endpoint)) != null ? _b : "https://api.raindrop.ai/v1/";
    this.enabled = opts.enabled !== false;
    this.debug = opts.debug;
    this.partialFlushMs = (_c = opts.partialFlushMs) != null ? _c : 1e3;
    this.sdkName = (_d = opts.sdkName) != null ? _d : "core";
    this.prefix = `[raindrop-ai/${this.sdkName}]`;
    this.defaultEventName = (_e = opts.defaultEventName) != null ? _e : "ai_generation";
    this.maxTextFieldCharsOpt = opts.maxTextFieldChars;
    this.localDebuggerUrl = (_f = resolveLocalDebuggerBaseUrl(opts.localDebuggerUrl)) != null ? _f : void 0;
    if (this.debug && this.localDebuggerUrl) {
      console.log(`${this.prefix} Local debugger mirroring: ${this.localDebuggerUrl}`);
    }
    this.projectId = normalizeProjectId(opts.projectId, {
      debug: this.debug,
      prefix: this.prefix,
    });
    const isNode = typeof process !== "undefined" && typeof process.version === "string";
    this.context = {
      library: {
        name: (_g = opts.libraryName) != null ? _g : "@raindrop-ai/core",
        version: (_h = opts.libraryVersion) != null ? _h : "0.0.0",
      },
      metadata: {
        jsRuntime: isNode ? "node" : "web",
        ...(isNode ? { nodeVersion: process.version } : {}),
      },
    };
  }
  isDebugEnabled() {
    return this.debug;
  }
  authHeaders() {
    return this.writeKey ? { Authorization: `Bearer ${this.writeKey}` } : {};
  }
  requestHeaders() {
    return { ...this.authHeaders(), ...projectIdHeaders(this.projectId) };
  }
  /**
   * Build the retry/timeout options for one POST, honoring the shutdown
   * deadline. Returns `null` when the shutdown drain window is exhausted —
   * the caller must drop the payload (with a rate-limited warning) instead
   * of issuing a request that could outlive process exit.
   *
   * Checked fresh on EVERY send, so a shutdown that begins while the flush
   * path is mid-drain takes effect immediately: no further retries, and the
   * per-attempt timeout is clamped to the remaining window. After
   * `shutdown()` returns (deadline cleared, `hasShutdown` still set),
   * sends — late callers, or flush work the deadline abandoned mid-drain —
   * run as a single short attempt rather than regaining the full retry
   * schedule.
   */
  requestOpts() {
    if (this.shutdownDeadlineAt !== void 0) {
      const remainingMs = this.shutdownDeadlineAt - Date.now();
      if (remainingMs <= 0) return null;
      return {
        maxAttempts: 1,
        debug: this.debug,
        sdkName: this.sdkName,
        timeoutMs: Math.min(DEFAULT_REQUEST_TIMEOUT_MS, remainingMs),
      };
    }
    if (this.hasShutdown) {
      return {
        maxAttempts: 1,
        debug: this.debug,
        sdkName: this.sdkName,
        timeoutMs: POST_SHUTDOWN_TIMEOUT_MS,
      };
    }
    return { maxAttempts: 3, debug: this.debug, sdkName: this.sdkName };
  }
  async patch(eventId, patch) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    if (!this.enabled) return;
    if (!eventId || !eventId.trim()) return;
    const maxChars = resolveMaxTextFieldChars(this.maxTextFieldCharsOpt);
    if (typeof patch.input === "string" && patch.input.length > maxChars) {
      patch = { ...patch, input: capText(patch.input, maxChars) };
    }
    if (typeof patch.output === "string" && patch.output.length > maxChars) {
      patch = { ...patch, output: capText(patch.output, maxChars) };
    }
    if (this.debug) {
      console.log(`${this.prefix} queue patch`, {
        eventId,
        userId: patch.userId,
        convoId: patch.convoId,
        eventName: patch.eventName,
        hasInput: typeof patch.input === "string" && patch.input.length > 0,
        hasOutput: typeof patch.output === "string" && patch.output.length > 0,
        attachments: (_b = (_a = patch.attachments) == null ? void 0 : _a.length) != null ? _b : 0,
        isPending: patch.isPending,
      });
    }
    const sticky = (_c = this.sticky.get(eventId)) != null ? _c : {};
    const existing = (_d = this.buffers.get(eventId)) != null ? _d : {};
    const merged = mergePatches(existing, patch);
    merged.isPending = (_g = (_f = (_e = patch.isPending) != null ? _e : existing.isPending) != null ? _f : sticky.isPending) != null ? _g : true;
    this.buffers.set(eventId, merged);
    this.sticky.set(eventId, {
      userId: (_h = merged.userId) != null ? _h : sticky.userId,
      convoId: (_i = merged.convoId) != null ? _i : sticky.convoId,
      eventName: (_j = merged.eventName) != null ? _j : sticky.eventName,
      isPending: (_k = merged.isPending) != null ? _k : sticky.isPending,
    });
    const t = this.timers.get(eventId);
    if (t) clearTimeout(t);
    if (merged.isPending === false) {
      await this.flushOne(eventId);
      return;
    }
    const timeout = setTimeout(() => {
      void this.flushOne(eventId).catch(() => {});
    }, this.partialFlushMs);
    this.timers.set(eventId, timeout);
  }
  async finish(eventId, patch) {
    await this.patch(eventId, { ...patch, isPending: false });
  }
  async flush() {
    if (!this.enabled) return;
    const ids = [...this.buffers.keys()];
    await Promise.all(ids.map((id) => this.flushOne(id)));
    await Promise.all([...this.inFlight].map((p) => p.catch(() => {})));
  }
  async shutdown() {
    this.hasShutdown = true;
    this.shutdownDeadlineAt = Date.now() + SHUTDOWN_DEADLINE_MS;
    try {
      for (const t of this.timers.values()) clearTimeout(t);
      this.timers.clear();
      const settled = await raceWithTimeout(this.flush(), SHUTDOWN_DEADLINE_MS);
      if (!settled) this.warnShutdownDrop("in-flight request(s) at shutdown");
    } finally {
      this.shutdownDeadlineAt = void 0;
    }
  }
  async trackSignal(signal) {
    var _a, _b;
    if (!this.enabled) return;
    const body = [
      {
        event_id: signal.eventId,
        signal_name: signal.name,
        signal_type: (_a = signal.type) != null ? _a : "default",
        timestamp: signal.timestamp,
        sentiment: signal.sentiment,
        attachment_id: signal.attachmentId,
        properties: {
          ...((_b = signal.properties) != null ? _b : {}),
          ...(signal.comment ? { comment: signal.comment } : {}),
          ...(signal.after ? { after: signal.after } : {}),
        },
      },
    ];
    if (!this.writeKey) return;
    const url = `${this.baseUrl}signals/track`;
    const opts = this.requestOpts();
    if (!opts) {
      this.warnShutdownDrop("signal");
      return;
    }
    try {
      await postJson(url, body, this.requestHeaders(), opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      rateLimitedLog(`${this.prefix}.send_signal_failed`, () => console.warn(`${this.prefix} failed to send signal (dropping): ${msg}`));
    }
  }
  async identify(users) {
    if (!this.enabled) return;
    const list = Array.isArray(users) ? users : [users];
    const body = list
      .filter((user) => {
        if (!(user == null ? void 0 : user.userId) || !user.userId.trim()) {
          if (this.debug) {
            console.warn(`${this.prefix} skipping identify: missing userId`);
          }
          return false;
        }
        return true;
      })
      .map((user) => {
        var _a;
        return {
          user_id: user.userId,
          traits: (_a = user.traits) != null ? _a : {},
        };
      });
    if (!this.writeKey) return;
    if (body.length === 0) return;
    const url = `${this.baseUrl}users/identify`;
    const opts = this.requestOpts();
    if (!opts) {
      this.warnShutdownDrop("identify");
      return;
    }
    try {
      await postJson(url, body, this.requestHeaders(), opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      rateLimitedLog(`${this.prefix}.send_identify_failed`, () => console.warn(`${this.prefix} failed to send identify (dropping): ${msg}`));
    }
  }
  warnShutdownDrop(what) {
    rateLimitedLog(`${this.prefix}.shutdown_deadline`, () => console.warn(`${this.prefix} shutdown flush deadline exceeded; dropping ${what}`));
  }
  async flushOne(eventId) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    if (!this.enabled) return;
    const timer = this.timers.get(eventId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(eventId);
    }
    const accumulated = this.buffers.get(eventId);
    this.buffers.delete(eventId);
    if (!accumulated) return;
    const sticky = (_a = this.sticky.get(eventId)) != null ? _a : {};
    const eventName = (_c = (_b = accumulated.eventName) != null ? _b : sticky.eventName) != null ? _c : this.defaultEventName;
    const userId = (_d = accumulated.userId) != null ? _d : sticky.userId;
    if (!userId) {
      if (this.debug) {
        console.warn(`${this.prefix} skipping track_partial for ${eventId}: missing userId`);
      }
      this.sticky.delete(eventId);
      return;
    }
    const { wizardSession, ...restProperties } = (_e = accumulated.properties) != null ? _e : {};
    const convoId = (_f = accumulated.convoId) != null ? _f : sticky.convoId;
    const isPending = (_h = (_g = accumulated.isPending) != null ? _g : sticky.isPending) != null ? _h : true;
    const payload = {
      event_id: eventId,
      user_id: userId,
      event: eventName,
      timestamp: (_i = accumulated.timestamp) != null ? _i : /* @__PURE__ */ new Date().toISOString(),
      ai_data: {
        input: accumulated.input,
        output: accumulated.output,
        model: accumulated.model,
        convo_id: convoId,
      },
      properties: {
        ...restProperties,
        ...(wizardSession ? { "raindrop.wizardSession": wizardSession } : {}),
        ...(this.gitContext && (this.gitContext.project || this.gitContext.branch || this.gitContext.commit) ? { git: this.gitContext } : {}),
        $context: this.context,
      },
      attachments: accumulated.attachments,
      is_pending: isPending,
    };
    const url = `${this.baseUrl}events/track_partial`;
    if (this.debug) {
      console.log(`${this.prefix} sending track_partial`, {
        eventId,
        eventName,
        userId,
        convoId,
        isPending,
        inputPreview: typeof accumulated.input === "string" ? accumulated.input.slice(0, 120) : void 0,
        outputPreview: typeof accumulated.output === "string" ? accumulated.output.slice(0, 120) : void 0,
        attachments: (_k = (_j = accumulated.attachments) == null ? void 0 : _j.length) != null ? _k : 0,
        attachmentKinds:
          (_m =
            (_l = accumulated.attachments) == null
              ? void 0
              : _l.map((a) => ({
                  type: a.type,
                  role: a.role,
                  name: a.name,
                  valuePreview: a.value.slice(0, 60),
                }))) != null
            ? _m
            : [],
        endpoint: url,
      });
    }
    if (this.localDebuggerUrl) {
      mirrorPartialEventToLocalDebugger(payload, {
        baseUrl: this.localDebuggerUrl,
        writeKey: this.writeKey,
        debug: this.debug,
        sdkName: this.sdkName,
      });
    }
    if (!this.writeKey) {
      if (!isPending) this.sticky.delete(eventId);
      return;
    }
    const opts = this.requestOpts();
    if (!opts) {
      this.warnShutdownDrop(`track_partial ${eventId}`);
      if (!isPending) this.sticky.delete(eventId);
      return;
    }
    const p = postJson(url, payload, this.requestHeaders(), opts);
    this.inFlight.add(p);
    try {
      try {
        await p;
        if (this.debug) {
          console.log(`${this.prefix} sent track_partial ${eventId} (${eventName})`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        rateLimitedLog(`${this.prefix}.send_track_partial_failed`, () => console.warn(`${this.prefix} failed to send track_partial (dropping): ${msg}`));
      }
    } finally {
      this.inFlight.delete(p);
    }
    if (!isPending) {
      this.sticky.delete(eventId);
    }
  }
};
var DEFAULT_SECRET_KEY_NAMES = [
  "apikey",
  "apisecret",
  "apitoken",
  "secretaccesskey",
  "sessiontoken",
  "privatekey",
  "privatekeyid",
  "clientsecret",
  "accesstoken",
  "refreshtoken",
  "oauthtoken",
  "bearertoken",
  "authorization",
  "password",
  "passphrase",
];
var REDACTED_PLACEHOLDER = "[REDACTED]";
function normalizeKeyName(name) {
  return name.toLowerCase().replace(/[-_.]/g, "");
}
function redactSecretsInObject(value, options) {
  var _a, _b;
  const normalizedSecretSet = buildSecretSet((_a = options == null ? void 0 : options.secretKeyNames) != null ? _a : DEFAULT_SECRET_KEY_NAMES);
  const placeholder = (_b = options == null ? void 0 : options.placeholder) != null ? _b : REDACTED_PLACEHOLDER;
  const seen = /* @__PURE__ */ new WeakSet();
  const walk = (node) => {
    if (node === null || typeof node !== "object") return node;
    if (seen.has(node)) return "[CIRCULAR]";
    seen.add(node);
    if (Array.isArray(node)) {
      return node.map((item) => walk(item));
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (normalizedSecretSet.has(normalizeKeyName(k))) {
        out[k] = placeholder;
      } else {
        out[k] = walk(v);
      }
    }
    return out;
  };
  return walk(value);
}
function buildSecretSet(names) {
  const set = /* @__PURE__ */ new Set();
  for (const name of names) set.add(normalizeKeyName(name));
  return set;
}
var DEFAULT_REDACT_ATTRIBUTE_KEYS = ["ai.request.providerOptions", "ai.response.providerMetadata"];
function defaultTransformSpan(span) {
  const attrs = span.attributes;
  if (!attrs || attrs.length === 0) return span;
  let nextAttrs;
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    const redacted = redactJsonAttributeValue(attr.key, attr.value);
    if (redacted === void 0) continue;
    if (!nextAttrs) nextAttrs = attrs.slice();
    nextAttrs[i] = { key: attr.key, value: redacted };
  }
  if (!nextAttrs) return span;
  return { ...span, attributes: nextAttrs };
}
var REDACT_JSON_ATTRIBUTE_KEYS = new Set(DEFAULT_REDACT_ATTRIBUTE_KEYS);
function redactJsonAttributeValue(key, value) {
  if (!REDACT_JSON_ATTRIBUTE_KEYS.has(key)) return void 0;
  const json = value.stringValue;
  if (typeof json !== "string" || json.length === 0) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return void 0;
  }
  const scrubbed = redactSecretsInObject(parsed);
  let scrubbedJson;
  try {
    scrubbedJson = JSON.stringify(scrubbed);
  } catch (e) {
    return void 0;
  }
  if (scrubbedJson === json) return void 0;
  return { stringValue: scrubbedJson };
}
function applyOtelSpanAttributeLimit(limit) {
  var _a, _b;
  try {
    const raw = (_b = (_a = globalThis == null ? void 0 : globalThis.process) == null ? void 0 : _a.env) == null ? void 0 : _b.OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT;
    if (!raw) return limit;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(limit, parsed);
    }
  } catch (e) {}
  return limit;
}
var TraceShipper = class {
  constructor(opts) {
    this.queue = [];
    this.inFlight = /* @__PURE__ */ new Set();
    this.hasShutdown = false;
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    this.writeKey = (_a = opts.writeKey) == null ? void 0 : _a.trim();
    this.baseUrl = (_b = formatEndpoint(opts.endpoint)) != null ? _b : "https://api.raindrop.ai/v1/";
    this.enabled = opts.enabled !== false;
    this.debug = opts.debug;
    this.debugSpans = opts.debugSpans === true;
    this.flushIntervalMs = (_c = opts.flushIntervalMs) != null ? _c : 1e3;
    this.maxBatchSize = (_d = opts.maxBatchSize) != null ? _d : 50;
    this.maxQueueSize = (_e = opts.maxQueueSize) != null ? _e : 5e3;
    this.sdkName = (_f = opts.sdkName) != null ? _f : "core";
    this.prefix = `[raindrop-ai/${this.sdkName}]`;
    this.serviceName = (_g = opts.serviceName) != null ? _g : "raindrop.core";
    this.serviceVersion = (_h = opts.serviceVersion) != null ? _h : "0.0.0";
    this.localDebuggerUrl = (_i = resolveLocalDebuggerBaseUrl(opts.localDebuggerUrl)) != null ? _i : void 0;
    if (this.debug && this.localDebuggerUrl) {
      console.log(`${this.prefix} Local debugger mirroring: ${this.localDebuggerUrl}`);
    }
    this.projectId = normalizeProjectId(opts.projectId, {
      debug: this.debug,
      prefix: this.prefix,
    });
    this.transformSpanHook = opts.transformSpan;
    this.disableDefaultRedaction = opts.disableDefaultRedaction === true;
    this.maxTextFieldCharsOpt = opts.maxTextFieldChars;
  }
  /**
   * Cap every string attribute value on the span. O(#attributes) length
   * checks; only oversized values pay a slice. Runs AFTER the redaction
   * pipeline so the default secret-scrub still sees parseable JSON in
   * `ai.request.providerOptions` / `ai.response.providerMetadata` (capping
   * first could cut a JSON blob mid-way, fail the parse, and ship secrets
   * in the surviving prefix).
   *
   * A stricter `OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT` env var is honored
   * for span content, matching the Python SDK and the OTel SDK convention.
   */
  capSpanAttributes(span) {
    var _a;
    const maxChars = applyOtelSpanAttributeLimit(resolveMaxTextFieldChars(this.maxTextFieldCharsOpt));
    const attrs = span.attributes;
    if (!attrs || attrs.length === 0) return span;
    let nextAttrs;
    for (let i = 0; i < attrs.length; i++) {
      const attr = attrs[i];
      const value = (_a = attr.value) == null ? void 0 : _a.stringValue;
      if (typeof value !== "string" || value.length <= maxChars) continue;
      if (!nextAttrs) nextAttrs = attrs.slice();
      nextAttrs[i] = {
        key: attr.key,
        value: { ...attr.value, stringValue: capText(value, maxChars) },
      };
    }
    if (!nextAttrs) return span;
    return { ...span, attributes: nextAttrs };
  }
  /**
   * Apply the user `transformSpan` hook (if any) followed by the default
   * redactor (unless disabled). Returns either the (possibly new) span to
   * ship, or `null` to drop the span entirely.
   *
   * Ordering: user hook runs first so callers can rewrite the span freely
   * (rename attrs, add new ones, scrub things the default doesn't know
   * about). The default redactor then runs on whatever the user produced,
   * acting as the always-on floor for documented BYOK secrets. If the user
   * sets `disableDefaultRedaction: true`, the floor is skipped.
   *
   * Fail-closed: if the user hook throws, the span is dropped — a buggy
   * hook can never accidentally ship raw, un-redacted spans.
   */
  redactSpan(span) {
    let current = span;
    if (this.transformSpanHook) {
      try {
        const result = this.transformSpanHook(current);
        if (result === null) return null;
        if (result !== void 0) current = result;
      } catch (err) {
        if (this.debug) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`${this.prefix} transformSpan hook threw: ${msg}`);
        }
        return null;
      }
    }
    if (!this.disableDefaultRedaction) {
      current = defaultTransformSpan(current);
    }
    return this.capSpanAttributes(current);
  }
  isDebugEnabled() {
    return this.debug;
  }
  authHeaders() {
    return this.writeKey ? { Authorization: `Bearer ${this.writeKey}` } : {};
  }
  requestHeaders() {
    return { ...this.authHeaders(), ...projectIdHeaders(this.projectId) };
  }
  startSpan(args) {
    var _a, _b;
    const ids = createSpanIds(args.parent);
    const started = (_a = args.startTimeUnixNano) != null ? _a : nowUnixNanoString();
    const attrs = [attrString("ai.telemetry.metadata.raindrop.eventId", args.eventId), attrString("ai.operationId", args.operationId)];
    if ((_b = args.attributes) == null ? void 0 : _b.length) attrs.push(...args.attributes);
    const span = { ids, name: args.name, startTimeUnixNano: started, attributes: attrs };
    this.mirrorToLocalDebugger(
      buildOtlpSpan({
        ids: span.ids,
        name: span.name,
        startTimeUnixNano: span.startTimeUnixNano,
        endTimeUnixNano: span.startTimeUnixNano,
        // placeholder — will be updated on endSpan
        attributes: span.attributes,
        status: { code: SpanStatusCode.UNSET },
      }),
    );
    return span;
  }
  mirrorToLocalDebugger(span) {
    if (!this.localDebuggerUrl) return;
    const redacted = this.redactSpan(span);
    if (redacted === null) return;
    const body = buildExportTraceServiceRequest([redacted], this.serviceName, this.serviceVersion);
    mirrorTraceExportToLocalDebugger(body, {
      baseUrl: this.localDebuggerUrl,
      debug: false,
      sdkName: this.sdkName,
    });
  }
  endSpan(span, extra) {
    var _a, _b;
    if (span.endTimeUnixNano) return;
    span.endTimeUnixNano = (_a = extra == null ? void 0 : extra.endTimeUnixNano) != null ? _a : nowUnixNanoString();
    if ((_b = extra == null ? void 0 : extra.attributes) == null ? void 0 : _b.length) {
      span.attributes.push(...extra.attributes);
    }
    let status = extra == null ? void 0 : extra.status;
    if (!status && (extra == null ? void 0 : extra.error) !== void 0) {
      const message = extra.error instanceof Error ? extra.error.message : String(extra.error);
      status = { code: SpanStatusCode.ERROR, message };
    }
    const otlp = buildOtlpSpan({
      ids: span.ids,
      name: span.name,
      startTimeUnixNano: span.startTimeUnixNano,
      endTimeUnixNano: span.endTimeUnixNano,
      attributes: span.attributes,
      status,
    });
    this.enqueue(otlp);
    this.mirrorToLocalDebugger(otlp);
  }
  createSpan(args) {
    var _a;
    const ids = createSpanIds(args.parent);
    const attrs = [attrString("ai.telemetry.metadata.raindrop.eventId", args.eventId)];
    if ((_a = args.attributes) == null ? void 0 : _a.length) attrs.push(...args.attributes);
    const otlp = buildOtlpSpan({
      ids,
      name: args.name,
      startTimeUnixNano: args.startTimeUnixNano,
      endTimeUnixNano: args.endTimeUnixNano,
      attributes: attrs,
      status: args.status,
    });
    this.enqueue(otlp);
    this.mirrorToLocalDebugger(otlp);
  }
  enqueue(span) {
    if (!this.enabled) return;
    if (this.debugSpans) {
      const short = (s) => (s ? s.slice(-8) : "none");
      console.log(`${this.prefix}[span] name=${span.name} trace=${short(span.traceId)} span=${short(span.spanId)} parent=${short(span.parentSpanId)}`);
    }
    const redacted = this.redactSpan(span);
    if (redacted === null) return;
    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
    }
    this.queue.push(redacted);
    if (this.queue.length >= this.maxBatchSize) {
      void this.flush().catch(() => {});
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = void 0;
        void this.flush().catch(() => {});
      }, this.flushIntervalMs);
    }
  }
  async flush() {
    if (!this.enabled) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = void 0;
    }
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.maxBatchSize);
      if (!this.writeKey) continue;
      const opts = this.requestOpts();
      if (!opts) {
        rateLimitedLog(`${this.prefix}.shutdown_deadline`, () => console.warn(`${this.prefix} shutdown flush deadline exceeded; dropping ${batch.length} spans`));
        continue;
      }
      const body = buildExportTraceServiceRequest(batch, this.serviceName, this.serviceVersion);
      const url = `${this.baseUrl}traces`;
      if (this.debug) {
        console.log(`${this.prefix} sending traces batch`, {
          spans: batch.length,
          endpoint: url,
        });
      }
      const p = postJson(url, body, this.requestHeaders(), opts);
      this.inFlight.add(p);
      try {
        try {
          await p;
          if (this.debug) console.log(`${this.prefix} sent ${batch.length} spans`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          rateLimitedLog(`${this.prefix}.send_spans_failed`, () => console.warn(`${this.prefix} failed to send ${batch.length} spans: ${msg}`));
        }
      } finally {
        this.inFlight.delete(p);
      }
    }
  }
  /** See EventShipper.requestOpts — same shutdown-budget semantics. */
  requestOpts() {
    if (this.shutdownDeadlineAt !== void 0) {
      const remainingMs = this.shutdownDeadlineAt - Date.now();
      if (remainingMs <= 0) return null;
      return {
        maxAttempts: 1,
        debug: this.debug,
        sdkName: this.sdkName,
        timeoutMs: Math.min(DEFAULT_REQUEST_TIMEOUT_MS, remainingMs),
      };
    }
    if (this.hasShutdown) {
      return {
        maxAttempts: 1,
        debug: this.debug,
        sdkName: this.sdkName,
        timeoutMs: POST_SHUTDOWN_TIMEOUT_MS,
      };
    }
    return { maxAttempts: 3, debug: this.debug, sdkName: this.sdkName };
  }
  async shutdown() {
    this.hasShutdown = true;
    this.shutdownDeadlineAt = Date.now() + SHUTDOWN_DEADLINE_MS;
    try {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = void 0;
      }
      const drain = async () => {
        await this.flush();
        await Promise.all([...this.inFlight].map((p) => p.catch(() => {})));
      };
      const settled = await raceWithTimeout(drain(), SHUTDOWN_DEADLINE_MS);
      if (!settled) {
        rateLimitedLog(`${this.prefix}.shutdown_deadline`, () => console.warn(`${this.prefix} shutdown flush deadline exceeded; abandoning in-flight spans`));
      }
    } finally {
      this.shutdownDeadlineAt = void 0;
    }
  }
};

// ../core/dist/index.node.js
var import_async_hooks = require("async_hooks");
globalThis.RAINDROP_ASYNC_LOCAL_STORAGE = import_async_hooks.AsyncLocalStorage;
var SUPPRESS_TRACING_KEY = /* @__PURE__ */ Symbol.for("OpenTelemetry SDK Context Key SUPPRESS_TRACING");
function findOtelContextManager() {
  var _a;
  for (const sym of Object.getOwnPropertySymbols(globalThis)) {
    if (!((_a = sym.description) == null ? void 0 : _a.startsWith("opentelemetry.js.api."))) continue;
    const api = globalThis[sym];
    const cm = api == null ? void 0 : api.context;
    if (cm && typeof cm.with === "function" && typeof cm.active === "function") {
      return cm;
    }
  }
  return void 0;
}
function installTracingSuppressionHook() {
  if (typeof globalThis.RAINDROP_SUPPRESS_TRACING === "function") return;
  const hook = (fn) => {
    const cm = findOtelContextManager();
    if (!cm) return fn();
    return cm.with(cm.active().setValue(SUPPRESS_TRACING_KEY, true), fn);
  };
  globalThis.RAINDROP_SUPPRESS_TRACING = hook;
}
installTracingSuppressionHook();

// src/config.ts
var import_node_fs = require("fs");
var import_node_os = require("os");
var import_node_path = require("path");
function loadConfig(projectDirectory) {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  let merged = {};
  const configPaths = [
    (0, import_node_path.join)((0, import_node_os.homedir)(), ".config", "opencode", "raindrop.json"),
    (0, import_node_path.join)(projectDirectory, ".opencode", "raindrop.json"),
    (0, import_node_path.join)(projectDirectory, "raindrop.json"),
    (0, import_node_path.join)(process.cwd(), ".opencode", "raindrop.json"),
    (0, import_node_path.join)(process.cwd(), "raindrop.json")
  ];
  for (const configPath of configPaths) {
    try {
      if ((0, import_node_fs.existsSync)(configPath)) {
        const content = (0, import_node_fs.readFileSync)(configPath, "utf-8");
        const parsed = JSON.parse(content);
        merged = { ...merged, ...parsed };
      }
    } catch (e) {}
  }
  let eventMetadata;
  const envMeta = process.env["RAINDROP_EVENT_METADATA"];
  if (envMeta) {
    try {
      eventMetadata = JSON.parse(envMeta);
    } catch (e) {}
  }
  return {
    writeKey: (_b = (_a = process.env["RAINDROP_WRITE_KEY"]) != null ? _a : merged.write_key) != null ? _b : "",
    endpoint: (_d = (_c = process.env["RAINDROP_API_URL"]) != null ? _c : merged.api_url) != null ? _d : "https://api.raindrop.ai/v1",
    projectId: (_e = process.env["RAINDROP_PROJECT_ID"]) != null ? _e : merged.project_id,
    eventName: (_f = merged.event_name ?? merged.eventName) != null ? _f : "opencode_session",
    debug: process.env["RAINDROP_DEBUG"] === "true" ? true : (_g = merged.debug) != null ? _g : false,
    captureSystemPrompt: process.env["RAINDROP_CAPTURE_SYSTEM_PROMPT"] !== void 0 ? process.env["RAINDROP_CAPTURE_SYSTEM_PROMPT"] === "true" : (_h = merged.capture_system_prompt) != null ? _h : false,
    eventMetadata,
    // KOLYA PATCH (F-002.6): trace_only flag — when true, plugin logs go to
    // ~/.raindrop/trace.log (append) instead of stdout/TUI. Set in raindrop.json
    // as "trace_only": true, or via env RAINDROP_TRACE_ONLY=true. Default: false
    // (existing behaviour, writes to stdout).
    traceOnly: process.env["RAINDROP_TRACE_ONLY"] === "true" ? true : (merged.trace_only === true),
    localWorkshopUrl: resolveLocalWorkshopUrl(merged.local_workshop_url),
  };
}
function resolveLocalWorkshopUrl(fileValue) {
  const envValue = process.env["RAINDROP_LOCAL_WORKSHOP_URL"];
  if (envValue !== void 0) {
    if (envValue === "" || envValue.toLowerCase() === "null" || envValue.toLowerCase() === "false") {
      return null;
    }
    // KOLYA PATCH (F-005): non-local env guard + rate-limited warning.
    if (!isLocalUrl(envValue)) {
      rateLimitedLog("local_workshop_url_non_local", () => console.warn(`[oc-wsp] [warn] RAINDROP_LOCAL_WORKSHOP_URL=${envValue} is not a local URL; falling back to raindrop.json (or auto-detect).`));
      return fileValue || DEFAULT_LOCAL_WORKSHOP_URL;
    }
    return envValue;
  }
  return fileValue;
}

// package.json
var package_default = {
  name: "@grudanov-nikolay/agenttrace-opencode-plugin",
  version: "0.0.2",
  description: "agenttrace observability plugin for OpenCode. Drop-in replacement for @raindrop-ai/opencode-plugin. Renamed from @grudanov-nikolay/opencode-workshop-plugin@0.0.1 \u2192 @grudanov-nikolay/agenttrace-opencode-plugin@0.1.0 on 2026-09-17 (F-024). Carries the same 5 fixes: MCP tool.execute.after crash workaround (upstream issue anomalyco/opencode#21149), RAINDROP_LOCAL_WORKSHOP_URL non-local fallback, subagent_name recovery on 1.18 nested sub-agents (task span + child LLM span + Subagent root), result.error propagation into span status=ERROR, and Workshop sidepanel bootstrap (registers `workshop` MCP server and prepends sidepanel system prompt when RAINDROP_SIDEPANEL_ACTIVE=1).",
  type: "module",
  main: "dist/index.js",
  module: "dist/index.js",
  types: "dist/index.d.ts",
  license: "MIT",
  homepage: "https://github.com/nikolay-grudanov/agenttrace-opencode-plugin",
  bugs: {
    url: "https://github.com/nikolay-grudanov/agenttrace-opencode-plugin/issues",
  },
  author: "Nikolai Grudanov <nikolay-grudanov@users.noreply.github.com>",
  repository: {
    type: "git",
    url: "git+https://github.com/nikolay-grudanov/agenttrace-opencode-plugin.git",
  },
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      require: "./dist/index.cjs",
    },
  },
  sideEffects: false,
  files: ["dist/**"],
  peerDependencies: {
    "@opencode-ai/plugin": ">=1.3.0",
    "@opencode-ai/sdk": ">=1.3.0",
  },
  peerDependenciesMeta: {
    "@opencode-ai/sdk": {
      optional: true,
    },
  },
  publishConfig: {
    access: "public",
  },
};

// src/package-info.ts
var PLUGIN_NAME = package_default.name;
var PLUGIN_VERSION = package_default.version;

// src/shipper.ts
var EventShipper2 = class extends EventShipper {
  constructor(opts) {
    var _a, _b, _c, _d;
    super({
      ...opts,
      sdkName: (_a = opts.sdkName) != null ? _a : "opencode-plugin",
      libraryName: (_b = opts.libraryName) != null ? _b : PLUGIN_NAME,
      libraryVersion: (_c = opts.libraryVersion) != null ? _c : PLUGIN_VERSION,
      defaultEventName: (_d = opts.defaultEventName) != null ? _d : "opencode_session",
    });
    this.gitContext = opts.gitContext ?? null;
  }
};
var TraceShipper2 = class extends TraceShipper {
  constructor(opts) {
    var _a, _b, _c;
    super({
      ...opts,
      sdkName: (_a = opts.sdkName) != null ? _a : "opencode-plugin",
      serviceName: (_b = opts.serviceName) != null ? _b : "raindrop.opencode-plugin",
      serviceVersion: (_c = opts.serviceVersion) != null ? _c : PLUGIN_VERSION,
    });
  }
  enqueue(span) {
    var _a;
    const attrs = (_a = span.attributes) != null ? _a : [];
    attrs.unshift({ key: "span.id", value: { stringValue: span.spanId } }, ...(span.parentSpanId ? [{ key: "span.parent.id", value: { stringValue: span.parentSpanId } }] : []));
    span.attributes = attrs;
    super.enqueue(span);
  }
};

// src/bounded.ts
var TRUNCATION_MARKER2 = "...[truncated by raindrop]";
var MAX_TEXT_FIELD_CHARS = 1e6;
var MAX_BOUNDED_DEPTH = 12;
function truncateToLimit2(text, limit) {
  if (text.length <= limit) return text;
  if (limit > TRUNCATION_MARKER2.length) {
    return text.slice(0, limit - TRUNCATION_MARKER2.length) + TRUNCATION_MARKER2;
  }
  return text.slice(0, limit);
}
function capText2(value, limit = MAX_TEXT_FIELD_CHARS) {
  if (value.length <= limit) return value;
  return truncateToLimit2(value, limit);
}
function boundedClone2(value, budget, depth) {
  if (budget.remaining <= 0) return TRUNCATION_MARKER2;
  if (typeof value === "string") {
    if (value.length > budget.remaining) {
      const taken = value.slice(0, Math.max(0, budget.remaining)) + TRUNCATION_MARKER2;
      budget.remaining = 0;
      return taken;
    }
    budget.remaining -= Math.max(value.length, 1);
    return value;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    budget.remaining -= 8;
    return value;
  }
  if (typeof value !== "object") {
    budget.remaining -= 8;
    return value;
  }
  if (depth >= MAX_BOUNDED_DEPTH) {
    budget.remaining -= 16;
    return `<max depth: ${TRUNCATION_MARKER2}>`;
  }
  const withToJson = value;
  if (typeof withToJson.toJSON === "function") {
    try {
      return boundedClone2(withToJson.toJSON(), budget, depth + 1);
    } catch (e) {}
  }
  if (Array.isArray(value)) {
    const out2 = [];
    for (const item of value) {
      if (budget.remaining <= 0) {
        out2.push(TRUNCATION_MARKER2);
        break;
      }
      out2.push(boundedClone2(item, budget, depth + 1));
    }
    return out2;
  }
  const out = {};
  for (const key of Object.keys(value)) {
    if (budget.remaining <= 0) {
      out["..."] = TRUNCATION_MARKER2;
      break;
    }
    budget.remaining -= Math.max(key.length, 1);
    out[key] = boundedClone2(value[key], budget, depth + 1);
  }
  return out;
}
function boundedStringify(value, limit = MAX_TEXT_FIELD_CHARS) {
  var _a;
  try {
    if (typeof value === "string") {
      return truncateToLimit2(JSON.stringify(capText2(value, limit)), limit);
    }
    const pruned = boundedClone2(value, { remaining: limit + TRUNCATION_MARKER2.length + 256 }, 0);
    return truncateToLimit2((_a = JSON.stringify(pruned)) != null ? _a : "", limit);
  } catch (e) {
    return capText2(String(value), limit);
  }
}

// src/tracing-linkage-helpers.ts
function createSessionParentMapHelpers({
  sessions: sessions2,
  taskContexts: taskContexts2,
  runningTaskCallsBySession: runningTaskCallsBySession2,
  mapChildSessionToParent: mapChildSessionToParent2,
  pendingChildSessionsByCallKey: pendingChildSessionsByCallKey2,
  callKey: callKey2,
  log,
}) {
  function applyChildSessionParentToState(childSessionId) {
    const parentInfo = mapChildSessionToParent2.get(childSessionId);
    const state = sessions2.get(childSessionId);
    if (!parentInfo || !state) return;
    state.parentId = parentInfo.parentId;
    state.parentTaskSpanIds = parentInfo.parentTaskSpanIds;
    state.parentEventContext = parentInfo.eventContext;
  }
  function queuePendingChildByCallKey(key, childSessionId) {
    var _a;
    const pending = (_a = pendingChildSessionsByCallKey2.get(key)) != null ? _a : /* @__PURE__ */ new Set();
    pending.add(childSessionId);
    pendingChildSessionsByCallKey2.set(key, pending);
  }
  function attachChildSessionToParentTask(childSessionId, parentId, parentCallId, source) {
    const key = callKey2(parentId, parentCallId);
    const ctx = taskContexts2.get(key);
    if (!ctx) {
      queuePendingChildByCallKey(key, childSessionId);
      return false;
    }
    const parentInfo = {
      parentId,
      parentTaskSpanIds: ctx.ids,
      eventContext: ctx.eventContext,
    };
    mapChildSessionToParent2.set(childSessionId, parentInfo);
    applyChildSessionParentToState(childSessionId);
    return true;
  }
  function resolvePendingChildrenForCall(parentId, parentCallId, source) {
    const key = callKey2(parentId, parentCallId);
    const pending = pendingChildSessionsByCallKey2.get(key);
    if (pending && pending.size > 0) {
      for (const childSessionId of [...pending]) {
        if (attachChildSessionToParentTask(childSessionId, parentId, parentCallId, source)) {
          pending.delete(childSessionId);
        }
      }
      if (pending.size === 0) pendingChildSessionsByCallKey2.delete(key);
    }
  }
  function cleanupSessionParentMap(sessionId) {
    mapChildSessionToParent2.delete(sessionId);
    runningTaskCallsBySession2.delete(sessionId);
    for (const [key, pending] of pendingChildSessionsByCallKey2.entries()) {
      pending.delete(sessionId);
      if (pending.size === 0) pendingChildSessionsByCallKey2.delete(key);
    }
    for (const key of [...taskContexts2.keys()]) {
      if (key.startsWith(`${sessionId}:`)) taskContexts2.delete(key);
    }
    for (const [childSessionId, parentInfo] of [...mapChildSessionToParent2.entries()]) {
      if (parentInfo.parentId === sessionId) {
        mapChildSessionToParent2.delete(childSessionId);
      }
    }
  }
  return {
    applyChildSessionParentToState,
    attachChildSessionToParentTask,
    cleanupSessionParentMap,
    resolvePendingChildrenForCall,
  };
}

// src/tracing.ts
var ERROR_LOG_INTERVAL_MS = 3e4;
var lastErrorLogAt = /* @__PURE__ */ new Map();
function rateLimitedErrorLog(key, message) {
  const now = Date.now();
  const last = lastErrorLogAt.get(key);
  if (last !== void 0 && now - last < ERROR_LOG_INTERVAL_MS) return;
  lastErrorLogAt.set(key, now);
  console.log(message);
}
var sessions = /* @__PURE__ */ new Map();
var taskContexts = /* @__PURE__ */ new Map();
var runningTaskCallsBySession = /* @__PURE__ */ new Map();
var mapChildSessionToParent = /* @__PURE__ */ new Map();
var pendingChildSessionsByCallKey = /* @__PURE__ */ new Map();
function createSessionState(sessionId) {
  return {
    sessionId,
    currentInput: "",
    outputParts: /* @__PURE__ */ new Map(),
    reasoningParts: /* @__PURE__ */ new Map(),
    toolSpanStarts: /* @__PURE__ */ new Map(),
    processedMessages: /* @__PURE__ */ new Set(),
    subagentName: void 0,
  };
}
function callKey(sessionId, callId) {
  return `${sessionId}:${callId}`;
}
function markTaskCallFinished(sessionID, callID) {
  const running = runningTaskCallsBySession.get(sessionID);
  if (!running) return;
  running.delete(callID);
  if (running.size === 0) runningTaskCallsBySession.delete(sessionID);
}
function endPendingToolSpanWithError(state, callID, tool, toolCallArgs, errorMessage, traceShipper) {
  const startInfo = state.toolSpanStarts.get(callID);
  if (!startInfo) return false;
  state.toolSpanStarts.delete(callID);
  const error = new Error(errorMessage);
  const endAttrs = [attrString("ai.toolCall.args", toolCallArgs), attrString("error.message", errorMessage)];
  if (startInfo.liveSpan) {
    traceShipper.endSpan(startInfo.liveSpan, {
      attributes: endAttrs,
      error,
    });
  } else {
    const toolSpan = traceShipper.startSpan({
      name: "ai.toolCall",
      parent: startInfo.parent,
      eventId: startInfo.eventId,
      startTimeUnixNano: startInfo.startTimeUnixNano,
      attributes: [attrString("ai.operationId", "ai.toolCall"), attrString("ai.toolCall.name", tool), attrString("ai.toolCall.id", callID)],
    });
    traceShipper.endSpan(toolSpan, {
      attributes: endAttrs,
      error,
      endTimeUnixNano: nowUnixNanoString(),
    });
  }
  return true;
}
function unwrapQuotes(s) {
  if (s.length < 2) return s;
  const first = s[0];
  const last = s[s.length - 1];
  if ((first === '"' || first === "'") && first === last) return s.slice(1, -1);
  return s;
}
function buildPromptMessages(systemPrompt, userInput) {
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: unwrapQuotes(userInput) });
  return JSON.stringify(messages);
}
function getHostname() {
  var _a;
  try {
    const bunGlobal = globalThis;
    if ((_a = bunGlobal.Bun) == null ? void 0 : _a.hostname) return bunGlobal.Bun.hostname;
    return require("os").hostname();
  } catch (e) {
    const h = process.env["HOSTNAME"];
    if (h === void 0 || h === "") throw new Error("HOSTNAME env is not set");
    return h;
  }
}
function createHooks(config, worktree, directory, eventShipper, traceShipper, resolvedLocalUrl, sidepanelMode) {
  function log(msg, data) {
    if (!config.debug) return;
    const prefix = `[oc-wsp] [info] ${msg}`;
    if (data !== void 0) {
      console.log(prefix, data);
      return;
    }
    console.log(prefix);
  }
  const hostname = getHostname();
  const os = process.platform;
  const { applyChildSessionParentToState, attachChildSessionToParentTask, cleanupSessionParentMap, resolvePendingChildrenForCall } = createSessionParentMapHelpers({
    sessions,
    taskContexts,
    runningTaskCallsBySession,
    mapChildSessionToParent,
    pendingChildSessionsByCallKey,
    callKey,
    log,
  });
  return {
    // ------------------------------------------------------------------
    // event — session lifecycle + streaming parts
    // ------------------------------------------------------------------
    event: async ({ event }) => {
      var _a, _b, _c, _d, _e, _f, _g;
      try {
        const props = event.properties;
        const info = props["info"];
        const sessionID = (_b = (_a = props["sessionID"]) != null ? _a : info == null ? void 0 : info["id"]) != null ? _b : props["id"];
        const sessionEventTypes = ["session.created", "session.compacted", "session.idle", "session.deleted", "session.error"];
        if (sessionEventTypes.includes(event.type) && (sessionID === void 0 || sessionID === "")) {
          throw new Error(`event ${event.type}: missing sessionID in properties`);
        }
        if (event.type === "session.created") {
          if (info == null || typeof info !== "object") throw new Error("session.created: props.info is required");
          const parentID = info["parentID"];
          let state = sessions.get(sessionID);
          if (!state) {
            state = createSessionState(sessionID);
            sessions.set(sessionID, state);
          }
          state.parentId = parentID;
          if (state.parentId) mapChildSessionToParent.set(sessionID, { parentId: state.parentId });
        } else if (event.type === "session.compacted") {
          const state = sessions.get(String(sessionID));
          if (!state) return;
          state.isCompacting = true;
        } else if (event.type === "message.part.updated") {
          const part = props["part"];
          if (part == null || typeof part !== "object") throw new Error("message.part.updated: props.part is required");
          const partObj = part;
          const partSessionID = partObj["sessionID"];
          const messageId = partObj["messageID"];
          if (partSessionID == null || partSessionID === "") throw new Error("message.part.updated: part.sessionID is required");
          if (messageId == null || messageId === "") throw new Error("message.part.updated: part.messageID is required");
          const state = sessions.get(partSessionID);
          if (!state) return;
          if (partObj["type"] === "text" && typeof partObj["text"] === "string") {
            state.outputParts.set(messageId, capText2(partObj["text"]));
          } else if (partObj["type"] === "tool" && messageId) {
            const tool = partObj["tool"];
            const callID = partObj["callID"];
            const partState = partObj["state"];
            if (callID == null || callID === "") throw new Error("message.part.updated: part.callID is required for tool part");
            if (partState == null || typeof partState !== "object") throw new Error("message.part.updated: part.state is required for tool part");
            if (tool === "task") {
              const metadata = partState["metadata"];
              const childSessionId = metadata != null && typeof metadata === "object" ? metadata["sessionId"] : void 0;
              if (childSessionId != null && childSessionId !== "") {
                mapChildSessionToParent.set(childSessionId, {
                  parentId: partSessionID,
                });
                attachChildSessionToParentTask(childSessionId, partSessionID, callID, "part.metadata");
              }
            }
            const toolState = partState;
            if (toolState["status"] === "error") {
              const errorMessage = toolState["error"];
              if (typeof errorMessage !== "string" || errorMessage === "") throw new Error("message.part.updated: error tool state must have error string");
              const input = toolState["input"];
              const toolCallArgs = input === void 0 ? void 0 : typeof input === "string" ? capText2(input) : boundedStringify(input);
              if (endPendingToolSpanWithError(state, callID, tool, toolCallArgs, errorMessage, traceShipper) && tool === "task") {
                markTaskCallFinished(partSessionID, callID);
              }
            }
          } else if (partObj["type"] === "reasoning" && typeof partObj["text"] === "string") {
            state.reasoningParts.set(messageId, capText2(partObj["text"]));
          }
        } else if (event.type === "message.updated") {
          const msgInfo = props["info"];
          if (msgInfo == null || typeof msgInfo !== "object") throw new Error("message.updated: props.info is required");
          const info2 = msgInfo;
          const role = info2["role"];
          if (role !== "assistant") return;
          const msgSessionID = info2["sessionID"];
          const messageId = info2["id"];
          const time = info2["time"];
          if (msgSessionID == null || msgSessionID === "") throw new Error("message.updated: info.sessionID is required");
          if (messageId == null || messageId === "") throw new Error("message.updated: info.id is required");
          if (time == null || typeof time !== "object") throw new Error("message.updated: info.time is required");
          const timeObj = time;
          if (timeObj["completed"] == null) return;
          const state = sessions.get(msgSessionID);
          if (!state || !state.currentEventId || !state.currentRootSpan) return;
          if (state.processedMessages.has(messageId)) return;
          state.processedMessages.add(messageId);
          const tokens = info2["tokens"];
          if (tokens == null || typeof tokens !== "object") throw new Error("message.updated: info.tokens is required");
          const tokensObj = tokens;
          const inputTokens = tokensObj["input"];
          const outputTokens = tokensObj["output"];
          const reasoningTokens = tokensObj["reasoning"];
          if (typeof inputTokens !== "number" || typeof outputTokens !== "number") throw new Error("message.updated: tokens.input and tokens.output must be numbers");
          const providerID = info2["providerID"];
          const modelID = info2["modelID"];
          if (typeof providerID !== "string" || providerID === "" || typeof modelID !== "string" || modelID === "")
            throw new Error("message.updated: providerID and modelID are required non-empty strings");
          const modelName = `${providerID}/${modelID}`;
          const finishReason = info2["finish"];
          const outputText = state.outputParts.get(messageId);
          const reasoningText = state.reasoningParts.get(messageId);
          const isToolCallsCompletion = finishReason === "tool-calls";
          const hasIntermediateReasoning = reasoningText !== void 0 && reasoningText.trim().length > 0;
          if (outputText === void 0 && !(isToolCallsCompletion && hasIntermediateReasoning)) return;
          if (isToolCallsCompletion && !hasIntermediateReasoning) {
            await traceShipper.flush();
            return;
          }
          const msgError = info2["error"];
          const errorForSpan = msgError
            ? (() => {
                var _a2, _b2;
                const msg = (_b2 = (_a2 = msgError.data) == null ? void 0 : _a2.message) != null ? _b2 : msgError.name;
                const name = msgError.name;
                if (msg == null && name == null) throw new Error("message.updated: error object must have name or data.message");
                return `${msg != null ? msg : name}

type: ${name != null ? name : "UnknownError"}`;
              })()
            : void 0;
          if (isToolCallsCompletion) {
            if (reasoningText === void 0) throw new Error("message.updated: reasoningParts missing for tool-call continuation");
            const llmAttrs = [
              attrString("ai.operationId", "generateText"),
              attrString("ai.response.text", reasoningText),
              attrString("gen_ai.system", providerID),
              attrString("gen_ai.request.model", modelID),
              attrString("gen_ai.response.model", modelID),
              attrInt("gen_ai.usage.input_tokens", inputTokens),
              attrInt("gen_ai.usage.output_tokens", outputTokens),
            ];
            if (reasoningTokens != null && typeof reasoningTokens === "number" && reasoningTokens > 0) {
              llmAttrs.push(attrInt("gen_ai.usage.reasoning_tokens", reasoningTokens));
            }
            if (state.currentSystemPrompt) {
              llmAttrs.push(attrString("gen_ai.prompt.0.role", "system"), attrString("gen_ai.prompt.0.content", state.currentSystemPrompt));
            }
            if (state.parentId && state.subagentName) {
              llmAttrs.push(attrString("subagent_name", state.subagentName));
            }
            const llmParent = state.parentId && state.parentTaskSpanIds ? state.parentTaskSpanIds : state.currentRootSpan.ids;
            const llmSpan = traceShipper.startSpan({
              name: modelName,
              parent: llmParent,
              eventId: state.currentEventId,
              attributes: llmAttrs,
            });
            if (typeof timeObj["created"] === "number") {
              llmSpan.startTimeUnixNano = String(Math.floor(timeObj["created"])) + "000000";
            }
            traceShipper.endSpan(llmSpan, { error: errorForSpan });
            await traceShipper.flush();
            return;
          }
          if (outputText === void 0) return;
          const rootSpan = state.currentRootSpan;
          const isCompaction = state.isCompacting === true;
          if (state.parentId) {
            const userInput = unwrapQuotes(state.currentInput);
            const llmAttrs = [
              attrString("ai.operationId", "generateText"),
              attrString("ai.prompt", userInput),
              attrString("ai.prompt.messages", buildPromptMessages(state.currentSystemPrompt, state.currentInput)),
              attrString("ai.response.text", outputText),
              attrString("gen_ai.system", providerID),
              attrString("gen_ai.request.model", modelID),
              attrString("gen_ai.response.model", modelID),
              attrInt("gen_ai.usage.input_tokens", inputTokens),
              attrInt("gen_ai.usage.output_tokens", outputTokens),
            ];
            if (reasoningTokens != null && typeof reasoningTokens === "number" && reasoningTokens > 0) {
              llmAttrs.push(attrInt("gen_ai.usage.reasoning_tokens", reasoningTokens));
            }
            if (state.currentSystemPrompt) {
              llmAttrs.push(attrString("gen_ai.prompt.0.role", "system"), attrString("gen_ai.prompt.0.content", state.currentSystemPrompt));
            }
            if (state.parentId && state.subagentName) {
              llmAttrs.push(attrString("subagent_name", state.subagentName));
            }
            if (!state.parentTaskSpanIds) {
              traceShipper.endSpan(rootSpan, {
                error: "Missing strict parent task for child session",
              });
              state.currentRootSpan = void 0;
              state.currentEventId = void 0;
              await traceShipper.flush();
              return;
            }
            const finalLlmSpan = traceShipper.startSpan({
              name: modelName,
              parent: state.parentTaskSpanIds,
              eventId: state.currentEventId,
              attributes: llmAttrs,
            });
            if (typeof timeObj["created"] === "number") {
              finalLlmSpan.startTimeUnixNano = String(Math.floor(timeObj["created"])) + "000000";
            }
            traceShipper.endSpan(finalLlmSpan, { error: errorForSpan });
            traceShipper.endSpan(rootSpan, {
              attributes: [
                attrString("is_subagent", "true"),
                attrString("parent_session_id", state.parentId),
                ...(state.subagentName ? [attrString("subagent_name", state.subagentName)] : []),
              ],
              error: errorForSpan,
            });
          } else {
            rootSpan.name = isCompaction ? "ai.compaction" : modelName;
            const userInput = unwrapQuotes(state.currentInput);
            const rootAttrs = [
              attrString("ai.operationId", "generateText"),
              attrString("ai.prompt", userInput),
              attrString("ai.prompt.messages", buildPromptMessages(state.currentSystemPrompt, state.currentInput)),
              attrString("ai.response.text", outputText),
              attrString("gen_ai.system", providerID),
              attrString("gen_ai.request.model", modelID),
              attrString("gen_ai.response.model", modelID),
              attrInt("gen_ai.usage.input_tokens", inputTokens),
              attrInt("gen_ai.usage.output_tokens", outputTokens),
            ];
            if (isCompaction) {
              rootAttrs.push(attrString("is_compaction", "true"));
            }
            rootAttrs.push(attrString("message_id", messageId));
            if (reasoningTokens != null && typeof reasoningTokens === "number" && reasoningTokens > 0) {
              rootAttrs.push(attrInt("gen_ai.usage.reasoning_tokens", reasoningTokens));
            }
            if (state.currentSystemPrompt) {
              rootAttrs.push(attrString("gen_ai.prompt.0.role", "system"), attrString("gen_ai.prompt.0.content", state.currentSystemPrompt));
            }
            traceShipper.endSpan(rootSpan, {
              attributes: rootAttrs,
              error: errorForSpan,
            });
            if (isCompaction) {
              state.isCompacting = false;
            }
          }
          state.currentRootSpan = void 0;
          const hasAssistantResponse = outputText.trim().length > 0;
          if (!hasAssistantResponse) {
            await traceShipper.flush();
            state.currentEventId = void 0;
            return;
          }
          if (!state.parentId) {
            await eventShipper.finish(state.currentEventId, {
              userId: (_d = (_c = state.eventMetadata) == null ? void 0 : _c.userId) != null ? _d : state.sessionId,
              model: modelName,
              output: outputText,
              properties: {
                plugin_version: PLUGIN_VERSION,
                message_id: messageId,
                ...(isCompaction ? { is_compaction: true } : {}),
              },
            });
          }
          await traceShipper.flush();
          state.currentEventId = void 0;
        } else if (event.type === "session.idle") {
          if (!sessionID) return;
          const state = sessions.get(String(sessionID));
          if (!state) return;
          if (state.currentRootSpan) {
            traceShipper.endSpan(state.currentRootSpan);
            state.currentRootSpan = void 0;
          }
          if (state.currentEventId) {
            state.currentEventId = void 0;
          }
          state.isCompacting = false;
          await Promise.all([eventShipper.flush(), traceShipper.flush()]);
          if (state.parentId) {
            cleanupSessionParentMap(String(sessionID));
            sessions.delete(String(sessionID));
          } else {
          }
        } else if (event.type === "session.deleted") {
          if (!sessionID) return;
          const state = sessions.get(String(sessionID));
          if (!state) return;
          if (state.currentRootSpan) {
            traceShipper.endSpan(state.currentRootSpan);
            state.currentRootSpan = void 0;
          }
          if (state.currentEventId) {
            state.currentEventId = void 0;
          }
          cleanupSessionParentMap(String(sessionID));
          await Promise.all([eventShipper.flush(), traceShipper.flush()]);
          sessions.delete(String(sessionID));
        } else if (event.type === "session.error") {
          const errorSessionID = (_e = props["sessionID"]) != null ? _e : sessionID;
          if (errorSessionID === void 0 || errorSessionID === "") throw new Error("session.error: missing sessionID");
          const state = sessions.get(String(errorSessionID));
          if (!state) return;
          const errorObj = props["error"];
          if (errorObj == null) throw new Error("session.error: missing error object");
          const errorName = errorObj.name;
          const errorMessage = (_g = (_f = errorObj.data) == null ? void 0 : _f.message) != null ? _g : errorObj.name;
          if (errorName == null && errorMessage == null) throw new Error("session.error: error object must have name or data.message");
          const errorStr = `${errorMessage != null ? errorMessage : errorName}

type: ${errorName != null ? errorName : "UnknownError"}`;
          if (state.currentRootSpan) {
            traceShipper.endSpan(state.currentRootSpan, { error: errorStr });
            state.currentRootSpan = void 0;
          }
          if (state.currentEventId) {
            state.currentEventId = void 0;
          }
          cleanupSessionParentMap(String(errorSessionID));
          await Promise.all([eventShipper.flush(), traceShipper.flush()]);
          sessions.delete(String(errorSessionID));
        }
      } catch (err) {
        rateLimitedErrorLog("event", `[oc-wsp] [error] Error in event hook: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    // ------------------------------------------------------------------
    // chat.message — user sent a message; start a new turn with a fresh event ID
    // ------------------------------------------------------------------
// === SECTION: hook: chat.message ===
    "chat.message": async (messageInput, output) => {
      var _a, _b, _c, _d, _e, _f, _g;
      try {
        const { sessionID } = messageInput;
        let state = sessions.get(sessionID);
        if (!state) {
          state = createSessionState(sessionID);
          sessions.set(sessionID, state);
        }
        applyChildSessionParentToState(sessionID);
        if (state.currentRootSpan) {
          traceShipper.endSpan(state.currentRootSpan);
          state.currentRootSpan = void 0;
        }
        if (output == null) throw new Error("chat.message: output is required");
        const parts = output.parts;
        if (parts == null) throw new Error("chat.message: output.parts is required");
        const textParts = [];
        const newAttachments = [];
        const baseMeta = { ...config.eventMetadata };
        const promptMeta = {};
        for (const part of parts) {
          if (part["type"] === "text" && typeof part["text"] === "string") {
            textParts.push(part["text"]);
            const meta = part["metadata"];
            if (meta != null && typeof meta === "object") {
              const m = meta;
              if (typeof m["userId"] === "string") promptMeta.userId = m["userId"];
              if (typeof m["eventName"] === "string") promptMeta.eventName = m["eventName"];
              if (m["properties"] != null && typeof m["properties"] === "object") promptMeta.properties = m["properties"];
            }
          } else if (part["type"] === "file") {
            const mimeType = part["mediaType"];
            const filename = part["filename"];
            const url = part["url"];
            if (url && (mimeType == null ? void 0 : mimeType.startsWith("image/"))) {
              if (filename === void 0 || filename === "") throw new Error("chat.message: file part must have filename");
              newAttachments.push({ type: "image", role: "input", name: filename, value: url });
            }
          }
        }
        state.eventMetadata = {
          ...baseMeta,
          ...promptMeta,
          properties: baseMeta.properties || promptMeta.properties ? { ...((_a = baseMeta.properties) != null ? _a : {}), ...((_b = promptMeta.properties) != null ? _b : {}) } : void 0,
        };
        const userText = capText2(textParts.join("\n"));
        state.currentInput = userText;
        if (state.parentId) {
          if (!state.parentTaskSpanIds || !state.parentEventContext) {
            return;
          }
          // KOLYA PATCH (F-010): recover the sub-agent display name by parsing
          // the chat.message parts. The child session's first user message IS
          // the task prompt; identity prompts open with 'You are "<name>"'.
          // This is the fallback path when the task tool's `description` never
          // reaches the hook (OpenCode 1.17+/1.18 args-shape quirk). Stashed
          // once per session; the Subagent root and child LLM spans carry
          // subagent_name so Workshop UI shows the label in the pill.
          if (state.subagentName === void 0) {
            const fromPrompt = extractSubagentNameFromPrompt(textParts.join("\n"));
            // F-010 v2: chain of fallbacks. Priority:
            // (1) identity preamble in prompt text
            // (2) parent's taskContexts (set by tool.execute.before)
            // (3) mapChildSessionToParent (tool.execute.after may be too late)
            if (fromPrompt) {
              state.subagentName = fromPrompt;
            } else {
              const parentId = state.parentId;
              if (parentId) {
                const runningCalls = runningTaskCallsBySession.get(parentId);
                if (runningCalls) {
                  for (const callID of runningCalls) {
                    const ctx = taskContexts.get(callKey(parentId, callID));
                    if (ctx && ctx.subagentName) {
                      state.subagentName = ctx.subagentName;
                      break;
                    }
                  }
                }
              }
              if (!state.subagentName) {
                const childMap = mapChildSessionToParent.get(sessionID);
                const fromMap = childMap == null ? void 0 : childMap.subagentName;
                if (typeof fromMap === "string" && fromMap.length > 0) {
                  state.subagentName = fromMap;
                }
              }
            }
          }
          state.currentEventId = state.parentEventContext.eventId;
          const subagentRootAttrs = [
            attrString("workspace", worktree),
            attrString("directory", directory),
            attrString("hostname", hostname),
            attrString("os", os),
            attrString("is_subagent", "true"),
            attrString("parent_session_id", state.parentId),
          ];
          if (state.subagentName) subagentRootAttrs.push(attrString("subagent_name", state.subagentName));
          state.currentRootSpan = traceShipper.startSpan({
            name: "Subagent",
            parent: state.parentTaskSpanIds,
            eventId: state.currentEventId,
            attributes: subagentRootAttrs,
          });
          return;
        }
        state.currentEventId = generateId();
        state.currentRootSpan = traceShipper.startSpan({
          name: state.isCompacting ? "ai.compaction" : "ai.event",
          eventId: state.currentEventId,
          attributes: [attrString("workspace", worktree), attrString("directory", directory), attrString("hostname", hostname), attrString("os", os)],
        });
        await eventShipper.patch(state.currentEventId, {
          isPending: true,
          userId: (_d = (_c = state.eventMetadata) == null ? void 0 : _c.userId) != null ? _d : state.sessionId,
          convoId: state.sessionId,
          eventName: (_f = (_e = state.eventMetadata) == null ? void 0 : _e.eventName) != null ? _f : config.eventName,
          input: userText,
          ...(newAttachments.length > 0 ? { attachments: newAttachments } : {}),
          properties: {
            workspace: worktree,
            directory,
            hostname,
            os,
            plugin_version: PLUGIN_VERSION,
            ...((_g = state.eventMetadata) == null ? void 0 : _g.properties),
          },
        });
      } catch (err) {}
    },
    // ------------------------------------------------------------------
    // tool.execute.before — record start time only (span created atomically in after)
    // For child sessions, tool spans are parented directly to the parent task span.
    // ------------------------------------------------------------------
    "tool.execute.before": async (toolInput, _output) => {
      var _a, _b, _c;
      try {
        const { tool, sessionID, callID } = toolInput;
        const state = sessions.get(sessionID);
        if (!state || !state.currentEventId) return;
        const spanParent = state.parentId && state.parentTaskSpanIds ? state.parentTaskSpanIds : (_a = state.currentRootSpan) == null ? void 0 : _a.ids;
        if (!spanParent) return;
        const startTimeUnixNano = nowUnixNanoString();
        if (tool === "task") {
          // KOLYA PATCH (F-003): mirror of the ESM branch in tool.execute.before.
          // Attach human-readable subagent_name so Workshop UI can label it.
          const taskLabel = extractTaskLabel(toolInput.args);
          const taskAttrs = [
            attrString("ai.operationId", "ai.toolCall"),
            attrString("ai.toolCall.name", tool),
            attrString("ai.toolCall.id", callID),
          ];
          if (taskLabel) taskAttrs.push(attrString("subagent_name", taskLabel));
          const liveTaskSpan = traceShipper.startSpan({
            name: "ai.toolCall",
            parent: spanParent,
            eventId: state.currentEventId,
            attributes: taskAttrs,
          });
          liveTaskSpan.startTimeUnixNano = startTimeUnixNano;
          const ctx = {
            ids: liveTaskSpan.ids,
            eventContext: {
              eventId: state.currentEventId,
              userId: (_c = (_b = state.eventMetadata) == null ? void 0 : _b.userId) != null ? _c : state.sessionId,
              convoId: state.sessionId,
            },
          };
          taskContexts.set(callKey(sessionID, callID), ctx);
          let running = runningTaskCallsBySession.get(sessionID);
          if (running == null) {
            running = /* @__PURE__ */ new Set();
            runningTaskCallsBySession.set(sessionID, running);
          }
          running.add(callID);
          resolvePendingChildrenForCall(sessionID, callID, "tool.execute.before");
          state.toolSpanStarts.set(callID, {
            startTimeUnixNano,
            parent: spanParent,
            eventId: state.currentEventId,
            name: tool,
            liveSpan: liveTaskSpan,
          });
        } else {
          state.toolSpanStarts.set(callID, {
            startTimeUnixNano,
            parent: spanParent,
            eventId: state.currentEventId,
            name: tool,
          });
        }
      } catch (err) {
        rateLimitedErrorLog("tool.execute.before", `[oc-wsp] [error] Error in tool.execute.before hook: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    // ------------------------------------------------------------------
    // tool.execute.after — create tool span atomically with both start and end times
    // ------------------------------------------------------------------
// === SECTION: hook: tool.execute.after ===
    "tool.execute.after": async (toolInput, result) => {
      try {
        const { tool, sessionID, callID, args } = toolInput;
        const state = sessions.get(sessionID);
        if (!state || !state.currentEventId) return;
        if (args === void 0 || args === null) throw new Error("tool.execute.after: args is required");
        const toolCallArgs = typeof args === "string" ? capText2(args) : boundedStringify(args);
        const startInfo = state.toolSpanStarts.get(callID);
        state.toolSpanStarts.delete(callID);
        const resultMetadata = result.metadata;
        const childSessionId = resultMetadata == null ? void 0 : resultMetadata["sessionId"];
        if (tool === "task" && childSessionId) {
          // KOLYA PATCH (F-010 v2): stash subagent_type from task args so the
          // child session can recover its display name when its chat.message
          // parts lack an identity preamble (OpenCode 1.18).
          const _taskSubagentName = extractSubagentNameFromTaskArgs(args);
          mapChildSessionToParent.set(childSessionId, {
            parentId: sessionID,
            subagentName: _taskSubagentName || void 0,
          });
          attachChildSessionToParentTask(childSessionId, sessionID, callID, "tool.execute.after");
        }
        if (startInfo) {
          const endTimeUnixNano = nowUnixNanoString();
          // KOLYA PATCH (F-001): for MCP tool calls OpenCode passes raw CallToolResult
          // ({content: [{type, text}]}) instead of {title, output, metadata}.
          // Upstream issue anomalyco/opencode#21149 won't be fixed (PR #21150
          // auto-closed 2026-05-15). We fall back to assembling text from
          // content[] so MCP spans land in Workshop instead of crashing the agent.
          let resultOutput = result.output;
          if (resultOutput === void 0 && Array.isArray(result.content)) {
            resultOutput = result.content
              .filter((c) => c && c.type === "text" && typeof c.text === "string")
              .map((c) => c.text)
              .join("\n") || "(empty MCP content)";
          }
          if (resultOutput === void 0) {
            resultOutput = "(no output)";
          }
          const toolResult = boundedStringify(resultOutput);
          // F-013: propagate error status from the SDK's tool result.
          const toolError = (() => {
            if (!result || typeof result !== "object") return void 0;
            const rErr = (result).error;
            if (rErr && typeof rErr === "object" && typeof rErr.message === "string") return rErr.message;
            if (typeof rErr === "string" && rErr.length > 0) return rErr;
            return void 0;
          })();
          if (startInfo.liveSpan) {
            traceShipper.endSpan(startInfo.liveSpan, {
              attributes: [attrString("ai.toolCall.args", toolCallArgs), attrString("ai.toolCall.result", toolResult)],
              ...(toolError ? { error: toolError } : {}),
            });
          } else {
            traceShipper.createSpan({
              name: "ai.toolCall",
              parent: startInfo.parent,
              eventId: startInfo.eventId,
              startTimeUnixNano: startInfo.startTimeUnixNano,
              endTimeUnixNano,
              attributes: [
                attrString("ai.operationId", "ai.toolCall"),
                attrString("ai.toolCall.name", tool),
                attrString("ai.toolCall.id", callID),
                attrString("ai.toolCall.args", toolCallArgs),
                attrString("ai.toolCall.result", toolResult),
              ],
              ...(toolError ? { error: toolError } : {}),
            });
          }
        }
        if (tool === "task") {
          markTaskCallFinished(sessionID, callID);
        }
      } catch (err) {
        rateLimitedErrorLog("tool.execute.after", `[oc-wsp] [error] Error in tool.execute.after hook: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    // ------------------------------------------------------------------
    // experimental.session.compacting — fires before compaction LLM call
    // ------------------------------------------------------------------
// === SECTION: hook: experimental.session.compacting ===
    "experimental.session.compacting": async (input, _output) => {
      try {
        const sessionID = input.sessionID;
        if (!sessionID) return;
        const state = sessions.get(sessionID);
        if (state) {
          state.isCompacting = true;
        }
      } catch (err) {
        rateLimitedErrorLog(
          "experimental.session.compacting",
          `[oc-wsp] [error] Error in experimental.session.compacting hook: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    // ------------------------------------------------------------------
    // experimental.chat.system.transform — capture system prompt (read-only)
    // ------------------------------------------------------------------
// === SECTION: hook: experimental.chat.system.transform ===
    "experimental.chat.system.transform": async (input, output) => {
      try {
        // F-006 sidepanel: prepend a short role/MCP block so the agent
        // understands the Workshop sidepanel context. Only when sidepanelMode.
        if (sidepanelMode) {
          const runId = process.env.RAINDROP_SIDEPANEL_RUN_ID || "<none>";
          output.system = [
            [
              "You are the assistant in the Raindrop Workshop sidepanel — the local trace debugger for AI agents.",
              `Local Workshop MCP server is configured as 'workshop'. Use its tools (workshop__get_current_run, workshop__get_run_outline, workshop__query_traces, workshop__search_run, workshop__get_span_payload, workshop__get_span_context, workshop__annotate, workshop__replay_run, workshop__show_in_ui, workshop__ask_agent) when the user references the focused run, this trace, the current screen, or a captured span.`,
              `Currently focused Workshop run: ${runId}. Treat the user's first message as the in-flight request, not as a context reset.`,
              `Reply in the user's language.`,
            ].join("\n"),
            ...output.system,
          ];
        }
        if (!config.captureSystemPrompt) return;
        const sessionID = input.sessionID;
        if (!sessionID) return;
        let state = sessions.get(sessionID);
        if (!state) {
          state = createSessionState(sessionID);
          sessions.set(sessionID, state);
        }
        const MAX_SYSTEM_PROMPT_LENGTH = 32768;
        const TRUNCATION_MARKER3 = "\n...[truncated]";
        const joined = output.system.join("\n\n");
        state.currentSystemPrompt = joined.length > MAX_SYSTEM_PROMPT_LENGTH ? joined.slice(0, MAX_SYSTEM_PROMPT_LENGTH - TRUNCATION_MARKER3.length) + TRUNCATION_MARKER3 : joined;
      } catch (err) {
        rateLimitedErrorLog(
          "experimental.chat.system.transform",
          `[oc-wsp] [error] Error in experimental.chat.system.transform hook: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}

// src/index.ts
// F-014 (LABEL_FOURTEEN_PLACEHOLDER): capture project / branch / commit
// metadata once at plugin startup so each run can be tagged with the working
// tree state. Failures are tolerated: this is best-effort context, not a
// correctness path. Runs outside a git worktree return nulls.
function collectGitContext(worktreePath) {
  if (!worktreePath) return { project: null, branch: null, commit: null };
  const cp = require("node:child_process");
  const pathModule = require("node:path");
  const safe = (args) => {
    try {
      return cp.execFileSync("git", args, { cwd: worktreePath, encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch (e) {
      return null;
    }
  };
  const commit = safe(["rev-parse", "HEAD"]);
  const branch = safe(["rev-parse", "--abbrev-ref", "HEAD"]);
  const toplevel = safe(["rev-parse", "--show-toplevel"]);
  return {
    project: toplevel ? pathModule.basename(toplevel) : null,
    branch: branch && branch !== "HEAD" ? branch : null,
    commit,
  };
}
async function plugin(input) {
  var _a;
  const config = loadConfig(input.directory);
  // KOLYA PATCH (F-002.6): when trace_only is set, redirect console.log/warn/error
  // to ~/.raindrop/trace.log (append). Keeps TUI stdout clean for the chat.
  // Backwards-compatible: default is to write to stdout (existing behaviour).
  if (config.traceOnly) {
    const TRACE_LOG_PATH = require("node:os").homedir() + "/.raindrop/trace.log";
    const fs = require("node:fs");
    try {
      fs.mkdirSync(require("node:os").homedir() + "/.raindrop", { recursive: true });
    } catch (e) {}
    const stamp = () => new Date().toISOString();
    console.log = (...args) => {
      try {
        fs.appendFileSync(TRACE_LOG_PATH, `[${stamp()}] [log]  ${args.join(" ")}\n`);
      } catch (e) {}
    };
    console.warn = (...args) => {
      try {
        fs.appendFileSync(TRACE_LOG_PATH, `[${stamp()}] [warn] ${args.join(" ")}\n`);
      } catch (e) {}
    };
    console.error = (...args) => {
      try {
        fs.appendFileSync(TRACE_LOG_PATH, `[${stamp()}] [err]  ${args.join(" ")}\n`);
      } catch (e) {}
    };
  }
  function appLog(level, message) {
    console.log(`[oc-wsp] [${level}] ${message}`);
  }
  appLog("info", `Loading ${PLUGIN_NAME} v${PLUGIN_VERSION}`);
  const resolvedLocalUrl = resolveLocalDebuggerBaseUrl(config.localWorkshopUrl);
  const hasLocalDestination = resolvedLocalUrl !== null;
  if (!config.writeKey && !hasLocalDestination) {
    appLog(
      "warn",
      "RAINDROP_WRITE_KEY not set and no local Workshop daemon detected \u2014 Raindrop tracing disabled. Set RAINDROP_WRITE_KEY for cloud, or RAINDROP_LOCAL_WORKSHOP_URL / RAINDROP_LOCAL_DEBUGGER for local-only mode.",
    );
    return {};
  }
  if (config.debug) {
    const destinations = [config.writeKey ? `cloud (${config.endpoint})` : null, resolvedLocalUrl ? `local Workshop (${resolvedLocalUrl})` : null].filter(Boolean);
    appLog("info", `Raindrop tracing enabled \u2014 destinations: ${destinations.join(", ")}`);
  }
  const worktree = (_a = input.worktree) != null ? _a : input.directory;
  const gitContext = collectGitContext(worktree);
  const eventShipper = new EventShipper2({
    writeKey: config.writeKey,
    endpoint: config.endpoint,
    debug: config.debug,
    projectId: config.projectId,
    localDebuggerUrl: config.localWorkshopUrl,
    gitContext,
  });
  const traceShipper = new TraceShipper2({
    writeKey: config.writeKey,
    endpoint: config.endpoint,
    debug: config.debug,
    projectId: config.projectId,
    localDebuggerUrl: config.localWorkshopUrl,
  });
  // === KOLYA PATCH (F-006): sidepanel bootstrap =============================
  // When the local Workshop daemon is the destination and the Workshop chat
  // bridge signals a sidepanel session in flight (RAINDROP_SIDEPANEL_ACTIVE=1,
  // RAINDROP_SIDEPANEL_RUN_ID=<id>), write a small config dir to
  // ~/.cache/workshop-sidepanel/<pid>-<ts> containing opencode.json (which
  // registers the `workshop` stdio MCP server) and export it as
  // OPENCODE_CONFIG_DIR so the spawning opencode process picks it up.
  // Sidepanel system prompt is injected via experimental.chat.system.transform
  // (see above). All errors are silent — bootstrap is best-effort.
  const sidepanelMode = hasLocalDestination && process.env.RAINDROP_SIDEPANEL_ACTIVE === "1";
  let workshopConfigDir = null;
  if (sidepanelMode) {
    appLog("info", `sidepanel bootstrap: run_id=${process.env.RAINDROP_SIDEPANEL_RUN_ID || ""}`);
    try {
      const os = require("node:os");
      const fs = require("node:fs");
      const path = require("node:path");
      const cacheRoot = path.join(os.homedir(), ".cache", "workshop-sidepanel");
      try { fs.mkdirSync(cacheRoot, { recursive: true }); } catch {}
      try {
        const now = Date.now();
        for (const entry of fs.readdirSync(cacheRoot)) {
          try {
            const st = fs.statSync(path.join(cacheRoot, entry));
            if (now - st.mtimeMs > 60 * 60 * 1000) fs.rmSync(path.join(cacheRoot, entry), { recursive: true, force: true });
          } catch {}
        }
      } catch {}
      const dir = path.join(cacheRoot, `${process.pid}-${Date.now()}`);
      fs.mkdirSync(dir, { recursive: true });
      const isCompiled = (process.execPath || "").toLowerCase().endsWith("raindrop");
      const command = isCompiled
        ? [process.execPath, "workshop", "mcp"]
        : ["bun", "/home/gna/workspase/projects/opencode-workshop/src/index.ts", "workshop", "mcp"];
      const oc = {
        $schema: "https://opencode.ai/config.json",
        mcp: {
          workshop: {
            type: "local",
            command,
            enabled: true,
            environment: {
              // Workshop mcp server expects the bare daemon URL (no /v1/).
              RAINDROP_WORKSHOP_URL: (resolvedLocalUrl ?? "http://localhost:5899").replace(/\/v1\/?$/, ""),
              RAINDROP_WORKSHOP_AGENT_PROVIDER: "opencode",
              RAINDROP_WORKSHOP_ANNOTATION_SOURCE: "opencode",
            },
          },
        },
      };
      fs.writeFileSync(path.join(dir, "opencode.json"), JSON.stringify(oc, null, 2) + "\n", "utf8");
      workshopConfigDir = dir;
      appLog("info", `sidepanel bootstrap: OPENCODE_CONFIG_DIR=${dir}`);
    } catch (err) {
      appLog("warn", `sidepanel bootstrap failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (sidepanelMode && workshopConfigDir) {
    try { process.env.OPENCODE_CONFIG_DIR = workshopConfigDir; } catch {}
  }
  const hooks = createHooks(config, worktree, input.directory, eventShipper, traceShipper, resolvedLocalUrl, sidepanelMode);
  return hooks;
}
