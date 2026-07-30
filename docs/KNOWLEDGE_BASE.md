# RightMind — Knowledge Base

> Technical reference for the RightMind multi-agent advisory platform.
> Derived from a full source scan on 2026-07-30. Complements `docs/AGENT_LEARNED.md`
> (conventions & lessons) and `README.md` (product pitch & setup).

---

## 1. What the application does

**One-line:** RightMind takes a user's problem, runs it through a panel of AI agents on *different* models from *different* providers in a structured workflow, and returns a synthesised report where the disagreement has already happened.

The premise is that a single LLM gives you a single, unchallenged perspective. RightMind forces structured adversarial and collaborative processes — parallel analysis, hierarchical decomposition, adversarial debate, multi-round negotiation — before anything reaches the user. Model heterogeneity (Anthropic / OpenAI / Google / DeepSeek) is deliberate: different training data and architectures produce genuinely independent reasoning, which is what surfaces blind spots.

### The four-stage user pipeline

| Stage | What happens |
|---|---|
| **1. Refine** | A lightweight model (`google/gemini-3.1-flash-lite-preview`) asks 4–6 clarifying questions, then synthesises a sharpened challenge, classifies the problem type, and auto-selects the best strategy ("Smart Refine"). |
| **2. Analyse** | The challenge goes to a panel of agents on different models, executing one of five workflow topologies. Every non-JSON agent call has live web search enabled. |
| **3. Synthesise** | A Judge agent reads everything the panel produced and writes the final markdown report — agreements, disagreements, verdict, next steps. |
| **4. Follow up** | Threaded follow-up Q&A on `openai/gpt-5.4`, replaying the full conversation history (challenge → report → every prior turn) on each turn. |

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js **16.2.4** (App Router, Turbopack), React **19.2.4** |
| Auth | Auth.js v5 (`next-auth ^5.0.0-beta.31`) — magic link only, database sessions |
| Database | SQLite + Prisma **^6.19.3** (client generated to `src/generated/prisma/`, gitignored) |
| LLM gateway | **OpenRouter** (sole gateway — Claude, GPT, Gemini, DeepSeek) |
| Graph UI | `@xyflow/react` **^12.11.1** (ReactFlow) |
| PDF | `puppeteer-core` **^25.1.0** + `marked` **^18.0.4**, system Chromium |
| Email | Resend **^6.12.2** (prod only; dev prints magic link to terminal) |
| Markdown | `react-markdown` + `remark-gfm`; strategy configs via `gray-matter` |
| Styling | Vanilla CSS + CSS variables, mostly inline `style` objects |

**Scripts:** `dev`, `build`, `start`, `lint`, `db:backup`. There is **no test script**.

**`next.config.ts`:** `devIndicators: false`, `allowedDevOrigins: ["192.168.178.58"]`, `serverExternalPackages: ["pdf-parse", "resend"]`.

⚠️ **`AGENTS.md` warns: "This is NOT the Next.js you know."** Next 16 has breaking changes vs. training data — notably **Proxy (`src/proxy.ts`) replaces Middleware**. Read `node_modules/next/dist/docs/` before touching routing/auth.

---

## 3. The five strategies

Strategies are **data, not code**: Markdown files with YAML frontmatter in `src/strategies/`, parsed by `src/lib/strategies.ts` via `gray-matter`. Frontmatter defines agents, models, colours, system prompts, judge, cost/latency estimates and arXiv citations. Cached in production, re-read every call in development (`clearStrategyCache()` to invalidate).

| | 🏛️ Consensus Board | 🔬 Deep Dive | ⚔️ Stress Tester | 🤝 Round Table | 🔮 All Angles |
|---|---|---|---|---|---|
| `id` | `consensus-board` | `deep-dive` | `stress-tester` | `round-table` | `all-angles` |
| `workflow` | `parallel_aggregate` | `manager_worker` | `sequential_debate` | `multi_round_consensus` | `all_angles` |
| Topology | 4 parallel → judge | decompose → K workers → review | proposer→critic→refiner ×2 → judge | 4 agents × up to 3 rounds → judge | all four + meta-judge |
| Rounds / tasks | 1 | `maxSubTasks: 5` | `maxRounds: 2` | `maxRounds: 3`, `consensusThreshold: 0.8` | 1 |
| LLM calls | 5 | 2 + K (K≤5) | 7 | ≤13 (early exit) | ~27–30 + 1 |
| Est. latency | ~15–30 s | ~30–60 s | ~45–90 s | ~60–120 s | ~3–5 min |
| Est. cost | £0.50–£2.00 | £1.00–£3.00 | £1.00–£4.00 | £1.50–£5.00 | £5.00–£15.00 |
| Best for | Open-ended strategy | Complex, many-dimensioned | Pressure-testing a plan | Nuanced negotiation | High-stakes decisions |

### Agent rosters (model diversity is the point)

**Consensus Board** — Risk Analyst `claude-opus-4-7` · Growth Strategist `gpt-5.4` · Operations Manager `gemini-2.5-flash` · Technical Feasibility Assessor `deepseek-r1` → Judge: Chief Executive Synthesiser `claude-opus-4-8`

**Deep Dive** — Manager `gpt-5.4` (phase `plan`) · Specialist Worker `gemini-2.5-flash` (phase `execute`) → Judge: Manager — Final Review `gpt-5.4`

**Stress Tester** — Proposer `claude-opus-4-7` (`draft`) · Devil's Advocate `gpt-5.4` (`critique`) · Refiner `claude-opus-4-7` (`refine`) → Judge: Hardened Solution Synthesiser `gemini-2.5-flash`

**Round Table** — Market Strategist `gpt-5.4` · Financial Analyst `claude-opus-4-7` · Industry Expert `gemini-2.5-flash` · Human Factors Analyst `deepseek-r1` → Judge: Consensus Aggregator `claude-opus-4-7`

**All Angles** — no own agents; Meta-Judge `claude-opus-4-8`

---

## 4. Orchestration engine

All five orchestrators live in `src/lib/orchestrators/` and share an identical contract:

```ts
async function orchestrateX({
  jobId, strategy, challenge, promptOverrides?, includeReasoning?, file?
}): Promise<void>
```

They are **fire-and-forget** — never awaited by the route, errors swallowed into DB status. Shared private helpers are *duplicated* in each file (not imported): `updateProgress()`, `getPrompt()`, `getModel()`, `reasoningOpts()`.

### 4.1 Consensus Board — `parallel-aggregate.ts`
Phase `analyse`: one `Promise.all` over 4 agents (temp 0.6). Phase `synthesise`: 1 judge call (temp 0.5, `max_tokens: 16384`) receiving `# Original Challenge` + each agent's output under `## {role}`. No JSON intermediates. Report = raw judge markdown.

### 4.2 Deep Dive — `manager-worker.ts`
1. **`decompose`** — Manager call with `json: true`, temp 0.4, wrapped in a **2-attempt retry** on `parseJSON` failure. Returns `ManagerDecomposition`:
   ```ts
   { challenge_summary, decomposition_rationale, sub_tasks: SubTask[] }
   SubTask = { id, title, description, expertise_needed, expected_output }
   ```
   Requires 3–5 MECE sub-tasks; throws if zero; sliced to `maxSubTasks`.
2. **`execute`** — `Promise.all` over K workers. **Workers deliberately do NOT see the original challenge** — only their own sub-task spec. This is intentional isolation, the inverse of the drift-prevention pattern used elsewhere.
3. **`review`** — judge gets challenge + decomposition summary/rationale + all worker outputs.

Progress steps are rebuilt after decomposition so the UI grows worker nodes dynamically.

### 4.3 Stress Tester — `sequential-debate.ts`
Fully sequential, no parallelism. Per round: Proposer (`draft`) → Devil's Advocate (`critique`) → Refiner (`refine`). Round 2's Proposer revises against the **Refiner's** output, not its own round-1 draft. Judge receives the *entire* debate history (every turn of every round), not just the last.

Capped at 2 rounds by design — debates beyond 2–3 rounds drift (arXiv 2502.19559).

### 4.4 Round Table — `multi-round-consensus.ts`
The most elaborate. Rounds are sequential; within a round all 4 agents run via `Promise.all`.
- Round 1: bare challenge, plain markdown.
- Rounds 2+: `json: true`, returning `RoundTableResponse`:
  ```ts
  { agree_with: string[], disagree_with: string[], revised_answer: string, confidence: number }
  ```
- **Early exit:** after each round >1, if mean confidence ≥ `consensusThreshold` (0.8), remaining steps are marked done and the loop breaks.
- **Confidence-weighted debate rules** are injected into every round-2+ prompt (ConfMAD-style): resist changing position if prior confidence ≥0.8; be more open if <0.6; high-confidence disagreement deserves engagement; agents must state whether they agree for the *same or different reasons* — *"Same-answer-different-reasoning is a flag, not a consensus."*
- **Role anchoring** lives in the system prompts themselves: *"YOUR ROLE IS FIXED. Even if other agents disagree with you… Do not abandon your expertise to agree with others."* (RADAR, arXiv 2604.19005)
- Peer analyses are shown with confidence scores attached, self excluded.
- Parse failures degrade gracefully (`confidence = 0.5`, raw text retained).

### 4.5 All Angles — `all-angles.ts`
Meta-strategy. Phases `launching` → `running` → `meta-synthesis` → `done`.

1. Creates 4 child `AdvisorJob` rows with `parentJobId` set to the parent.
2. All 4 parent steps flip to `running` at once so the UI shows them active.
3. `Promise.all` calling the four child orchestrator functions **directly, in-process**. (The file's header comment says "polls for completion" — it doesn't. The `sleep()` helper at line 60 is dead code.)
4. Per-child try/catch: one failure marks that step failed, doesn't abort the run.
5. **Quorum gate:** needs ≥3 of 4 successful, else throws.
6. **Meta-Judge** — the only call in the codebase using `reasoning.effort: "high"`, and the only judge with `json: true`. Temp 0.4.

**Meta-Judge output schema** (the decision alignment matrix):
```ts
{
  alignment_score: number,           // 0.0–1.0
  alignment_label: "Strong" | "Moderate" | "Weak" | "Divided",
  strategy_verdicts: [{ strategy_id, strategy_name, icon, verdict, one_liner }],
  key_dimensions:   [{ question, positions: { <strategy_id>: { stance, reason } } }],
  convergence_points: string[],
  divergence_points:  string[],
  blind_spots:        string[],
  meta_verdict: "GO" | "MODIFY" | "HOLD" | "NO-GO",
  meta_verdict_rationale: string,
  meta_recommendation: string        // 3–5 paragraph narrative — the main output
}
```
Alignment bands are prescriptive: 4/4 same verdict → 0.85–1.0 Strong; 3/4 → 0.60–0.84 Moderate; 2/2 split → 0.30–0.59 Weak; all different → 0.0–0.29 Divided. Stance vocabulary: `for | against | modify | defer`. The prompt explicitly forbids the word "conditional" and states `meta_verdict` is the judge's own conclusion, *"not a popularity vote"*.

**Report is a JSON envelope** — unique among the five:
```ts
JSON.stringify({ _type: "all-angles", childJobIds, metaSynthesis: {...} })
```

**Cost rollup:** parent totals = Meta-Judge usage + `prisma.advisorJob.aggregate` sum over child jobs.

### 4.6 Cross-cutting orchestrator facts

| | Consensus Board | Deep Dive | Stress Tester | Round Table | All Angles |
|---|---|---|---|---|---|
| Parallelism | 1 × `Promise.all` | 1 × `Promise.all` | none | per round | over 4 children |
| `json: true` | never | manager only | never | rounds ≥2 | meta-judge only |
| Judge temp / max_tokens | 0.5 / 16384 | 0.5 / 16384 | 0.5 / 16384 | 0.5 / 16384 | 0.4 / 16384 |
| Cancel checks | 1 | 2 | per round + 1 | per round + 1 | 2 |
| Report format | markdown | markdown | markdown | markdown | JSON envelope |
| Calls `onJobFailed` | ❌ **no** | ✅ | ❌ **no** | ✅ | ✅ |

**Drift prevention** — the original challenge is re-injected under an explicit `# Original Challenge` header at the top of nearly every downstream prompt. Exceptions: round-1 openers (which *are* the challenge) and Deep Dive workers (deliberate isolation).

**Reasoning traces** — only attached when `includeReasoning` is set; effort `"medium"` everywhere except the All Angles Meta-Judge (`"high"`). Persisted to `AgentResponse.reasoning`.

---

## 5. Data model (`prisma/schema.prisma`)

**Auth.js models:** `User`, `Account`, `Session`, `VerificationToken`.

**`User`** — adds `openRouterKey` (BYOK) and `emailOnComplete`.

**`AdvisorJob`** — the central entity:
`id`, `userId`, `challenge`, `fileName`, `strategyId`, `executionMode`, `status`, `progress` (JSON string), `report`, `error`, **`parentJobId`** (All Angles children), `webhookUrl`, `webhookSecret`, `totalCostUsd`, `totalTokens`, timestamps.

**`AgentResponse`** — one row per LLM call: `agentRole`, `agentModel`, `round`, `phase`, `prompt`, `response`, `reasoning`, token counts, `costUsd`, `durationMs`. This is the transparency/debug backbone.

**`JobFollowUp`** — `turnNumber`, `prompt`, `response`, `model`, tokens, cost, duration.

**`ApiKey`** — `keyHash` (unique), `prefix`, `lastUsedAt`.

**Job statuses:** `PENDING → RUNNING → DONE | FAILED | CANCELLED`.
⚠️ `CANCELLED` is written by the cancel route but is **not** in the `JobStatus` union in `src/lib/types.ts`, and is not a terminal case in the SSE switch.

**Progress JSON shape:**
```ts
{ currentPhase, currentRound?, totalRounds?,
  steps: [{ agentRole, agentModel, status, startedAt?, completedAt?, error? }] }
```

---

## 6. LLM layer — `src/lib/llm.ts`

**Every model call goes through `callModel()`.** Never fetch OpenRouter directly.

- Endpoint `https://openrouter.ai/api/v1/chat/completions`; headers `HTTP-Referer: https://rightmind.app`, `X-Title: RightMind Advisory Platform`.
- **Privacy:** `provider: { data_collection: "deny" }` on every request.
- Defaults: `temperature 0.7`, `max_tokens 4096`.
- **JSON mode and web search are mutually exclusive on OpenRouter.** Web search (`tools: [{ type: "openrouter:web_search" }]`) is **on by default** for non-JSON calls.
- **PDF parsing:** when any message contains a `file` part, adds `plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }]` — Cloudflare AI is free, avoiding Mistral OCR costs.
- Returns `{ id, model, content, reasoning, usage: { …, costUsd }, _durationMs }`. Cost comes straight from OpenRouter's `usage.cost`.

**`parseJSON<T>()` — hardened three-pass recovery:**
1. Strip ```` ```json ```` fences, try parse.
2. Structural repair — fix missing colons (`"key""value"` → `"key": "value"`).
3. Truncation recovery — close unterminated strings, balance open braces/brackets, strip trailing commas. Handles models hitting `max_tokens` mid-object.

**`FILE_MODEL_SWAPS`** — when a file is attached, text-only models are swapped for vision-capable ones:
```ts
{ "deepseek/deepseek-r1": "google/gemini-3.1-pro-preview" }
```
Applied via `resolveModel(model, hasFile)`. ⚠️ `AgentResponse.agentModel` records the **unresolved** configured model, not the swapped one.

**`src/lib/file-content.ts` — `buildUserContent(text, file?)`:**
- no file → plain string
- `image/*` → `[{type:"text"}, {type:"image_url"}]`
- `application/pdf` → extracted locally via `pdf-parse` (module-level cache), appended as `# Attached Document: {name}`
- else → `{ type: "file", file: { filename, file_data } }` content part

---

## 7. API surface

### 7.1 Session API — `/api/advisor/*`
Cookie session via `auth()`, then per-job ownership check (`job.userId !== session.user.id → 403`). camelCase contract.

| Method | Path | Purpose |
|---|---|---|
| POST | `/submit` | Create job + fire orchestrator. 403 if user has no `openRouterKey`. |
| GET | `/jobs` | List top-level jobs (`parentJobId: null`) |
| GET / DELETE | `/jobs/[id]` | Job detail (+ follow-ups) / delete job + children |
| GET | `/jobs/[id]/stream` | **SSE** progress stream |
| GET | `/jobs/[id]/agents` | Agent responses for the graph inspector |
| GET | `/jobs/[id]/reasoning` | Reasoning traces only |
| GET | `/jobs/[id]/transcript` | Full transcript |
| POST | `/jobs/[id]/cancel` | Cancel (propagates parent ↔ children) |
| GET | `/jobs/[id]/pdf` | PDF export |
| POST | `/jobs/[id]/follow-up` | Threaded follow-up |
| POST | `/jobs/[id]/follow-up/refine` | Context-aware follow-up refinement |
| POST | `/refine` | Challenge refinement + strategy classification |
| GET | `/strategies`, `/strategies/[id]` | Strategy cards / detail — ⚠️ **no auth check** |
| GET/POST | `/settings` | BYOK key, email pref, OpenRouter balance |
| GET/POST | `/apikeys`, DELETE `/apikeys/[id]` | Developer API key management |
| POST | `/demo` | Resolve a pre-seeded demo job id |

### 7.2 Public API — `/api/v1/*`
Bearer API key via `authenticateApiRequest()`. **snake_case** contract, returns **202** on submit.

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/jobs` | `{strategy_id, challenge, include_reasoning?, webhook_url?, webhook_secret?, file?}` → 202 `{job_id, status}` |
| GET | `/v1/jobs/[id]` | Poll status; parses `report` to JSON |
| GET | `/v1/strategies` | Bare array `[{id, name, description, best_for}]` |
| POST | `/v1/refine` | Two-step refinement (built for OpenClaw integration) |

**v1-only capability: webhooks.** On completion `sendJobWebhook()` POSTs `{job_id, status, report}` (or `{…, error}`), with header `x-rightmind-signature` = HMAC-SHA256 of the exact body keyed by `webhookSecret`. No retries, no backoff, no timeout — failures are logged only.

No SSE, follow-up, PDF, cancel or delete under `/v1`.

### 7.3 API keys — `src/lib/api-keys.ts` / `api-auth.ts`
- Format: `rm_live_` + 32 random bytes hex = **72 chars**.
- `prefix` stored for display = `plainKey.slice(0, 16)` (schema comment says 8 — the code says 16).
- Hash: **unsalted single-round SHA-256**, unique-indexed, so lookup is a direct `findUnique`.
- Plaintext returned exactly once, from `POST /api/advisor/apikeys`.
- `lastUsedAt` updated fire-and-forget. **No expiry, no scopes, no rate limiting.**

### 7.4 Job submission flow
1. `auth()` → 401.
2. BYOK gate → 403 if no `openRouterKey`.
3. Validate challenge / strategyId / strategy resolves.
4. Create `AdvisorJob` (`PENDING`). ⚠️ `executionMode` is **hard-coded `"instant"`** — an `"overnight"` request is silently downgraded.
5. `switch (strategy.workflow)` → call orchestrator, **not awaited**, only `.catch(console.error)`. No queue, no worker process.
6. Respond immediately; client opens SSE.

### 7.5 SSE stream
- Format `event: <name>\ndata: <JSON>\n\n`.
- Recursive `setTimeout(poll, 1500)` — **1.5 s DB poll**, deduped on `` `${status}:${progress}` ``.
- Events: `progress`, `done`, `failed`, `error`. `controller.close()` on terminal; `cancel()` stops polling on client disconnect.
- ⚠️ No heartbeat frame, no max duration, and `CANCELLED` isn't terminal — a cancelled job's stream polls until the client closes it.

### 7.6 Refine (Smart Refine)
Model **`google/gemini-3.1-flash-lite-preview`**, two steps:
- `"questions"` — 4–6 clarifying questions, types `multi | yesno | scale`, with pre-defined options.
- `"synthesise"` — returns `{ refined, category, recommended_strategy, rationale }`. Newly-inferred detail is wrapped in `[[double brackets]]` so the UI can highlight it.

**Classification map:**

| Category | → Strategy |
|---|---|
| Decision | `stress-tester` |
| Strategy | `deep-dive` |
| Diagnosis | `round-table` |
| Exploration | `all-angles` (or `consensus-board` if simpler) |

`callAndParse()` retries once on parse failure.

### 7.7 Follow-ups
Model **`openai/gpt-5.4`**, temp 0.5, `max_tokens: 16384`. Message array replays the entire history every turn:
`system` → `user: challenge` → `assistant: report` → each prior `{user prompt, assistant response}` → new prompt. **Nothing is summarised or truncated.**

⚠️ Attachment handling here is weaker than the main pipeline: PDFs/text are base64-decoded as UTF-8 (mojibake for real binary PDFs), and images become a `[Attached image: name]` placeholder only.

### 7.8 PDF export
`puppeteer-core` + `marked`. Branches on report type: All Angles JSON → verdict badge, strategy-verdicts table, decision alignment matrix, convergence/divergence/blind-spot blocks; otherwise markdown. Appends the follow-up conversation. A4, `@page` margins, print CSS. Chromium resolved from `PUPPETEER_EXECUTABLE_PATH` → Windows Chrome path → `/usr/bin/chromium`.

---

## 8. Auth & access

**`src/auth.ts`** — `PrismaAdapter`, session strategy `"database"`, `maxAge` **30 days**. One provider: an inline email/magic-link provider with **10-minute** link validity, delegating to `sendMagicLinkEmail()`. No OAuth. The `signIn` callback fire-and-forgets `seedDemoJobs(user.id)`. The `session` callback copies `user.id` onto `session.user.id` — every advisor route depends on this.

**`src/proxy.ts`** (Next 16 Proxy, replaces Middleware) — `matcher: ["/advisor/:path*"]`. Checks only for *presence* of the `authjs.session-token` / `__Secure-authjs.session-token` cookie; redirects to `/login?callbackUrl=…`. It **never runs for `/api/*`** — API protection is entirely per-route.

**BYOK** — each user stores their own `openRouterKey`; `callModel` falls back to `process.env.OPENROUTER_API_KEY`. Users pay for their own usage; no billing proxy or markup.

**Demo mode** — `POST /api/auth/demo` deliberately bypasses Auth.js: find-or-create `demo@demo.com`, back-fill the server's OpenRouter key, write a real `Session` row (`crypto.randomUUID()`, **24 h**), set the cookie manually, seed fixtures. Because it's a real session row, `auth()` / adapter / proxy all treat it as a normal login.
⚠️ **Any visitor can call this endpoint and land in the shared `demo@demo.com` account, which holds the server's OpenRouter key.**

**Demo fixtures** — `src/lib/demo-fixtures.json` (~491 KB, 2 entries: a Deep Dive "Bristol bakery" job and an All Angles "London family housing" job with 4 children). `seedDemoJobs()` no-ops if the user already has jobs, and rewrites `childJobIds` in the parent's report to point at freshly-created child rows. Selecting a built-in example on the submit page sets `demoMode`, which routes to `/api/advisor/demo` instead of `/submit` — **no LLM call, no tokens used**.

---

## 9. Frontend

### Routes

| Route | Purpose |
|---|---|
| `/` | Server redirect → `/advisor` |
| `/login`, `/login/check-email` | Magic link + demo button |
| `/advisor` | **Submit page** — challenge, Refine, strategy pick, file attach |
| `/advisor/jobs` | Job history; All Angles rows expand to children |
| `/advisor/jobs/[id]` | **Job detail** — live SSE progress, report, follow-ups |
| `/advisor/strategy/[id]` | Strategy detail — diagram, agents, cost, arXiv papers |
| `/advisor/settings` | BYOK, balance, API keys, email toggle, privacy |
| `/advisor/why` | Static explainer + research bibliography |

`advisor/layout.tsx` is an async server component computing `hasKey`, rendering the masthead and a `KeyBanner` nag when no key is set.

### Submit page (`advisor/page.tsx`, ~1147 lines)
- **Refine state machine:** `idle → loading → questions → synthesising → preview → done`. Answer pills + optional free-text detail; preview highlights `[[inferred]]` spans in teal; accepting strips brackets and applies the recommendation (auto-selecting the strategy + showing "Why we picked this").
- Challenge persisted to `sessionStorage["rightmind_challenge"]`; `?strategy=` deep-link supported.
- **File upload:** 10 MB max; PDF, PNG/JPEG/WebP/GIF, TXT/CSV/MD. Read as data-URL. Warns the file goes to *every* agent and that DeepSeek R1 will be swapped for Gemini 3.1 Pro.
- **Advanced:** per-agent system-prompt override textareas (with Modified marker + Reset) and a `includeReasoning` checkbox.
- 10 rotating fable-themed placeholders (tortoise/hare, Solomon's baby, Trojan horse, Ship of Theseus…).

### Job detail page (`advisor/jobs/[id]/page.tsx`, ~2107 lines)
- **SSE** via `EventSource` with `progress` / `done` / `failed` / `error` listeners; on `done` it closes and re-fetches the job for follow-ups and final totals.
- **Progress** with a Graph ⇄ List toggle, progress bar (`done/total · %`, `Round n/m`), live elapsed seconds, phase labels.
- Actions: Cancel, Re-run, Delete, PDF download, **"💬 Copy for discussion"** (builds a paste-ready prompt containing challenge + strategy description + report + follow-ups + optional reasoning, ending with 4 review questions).
- **All Angles report view:** alignment score % with colour thresholds, verdict chip, 4-column verdict strip, **clickable decision alignment matrix** (rows = key dimensions, columns = the four strategies, stance pills expanding to show each strategy's reason), convergence/divergence side-by-side, blind spots, then collapsible child strategy reports.
- **Follow-up thread** with its own Refine flow and file attach.

### ReactFlow live visualizer (`src/components/flow/`)
Built and wired in; `plans/reactflow-live-visualizer.md` is the forward-looking plan (Phases 1–6, now implemented).

`buildStrategyGraph(strategy, steps, jobFinished, childJobIds)` switches on `workflow`:
- **Consensus Board** — agents column → judge at x=420.
- **Stress Tester** — Proposer/Advocate/Refiner chain per row, dashed loop edge labelled `Round N`, → judge.
- **Round Table** — round columns, dashed cross-connections between every agent pair within a round, same-agent arrows across rounds.
- **Deep Dive** — Manager → workers (derived dynamically from live steps) → judge; canvas re-runs `fitView` whenever node count changes, which is how worker expansion is handled.
- **All Angles** — fixed 2×2 strategy grid → meta-judge; strategy nodes carry `jobId` so clicking navigates to the child job.

Edge states: idle `#CCC1B7` @0.4 → active `#0D7680` @1.0 → done `#333333` @0.85, 0.4 s transition. Canvas is non-interactive (no drag/connect/select) except node clicks on completed nodes, which open the **`AgentInspector`** — a 440 px slide-out with a metadata strip and Response/Reasoning tabs. Its `matchResponse()` has five fallbacks (exact role → round-suffix → Deep Dive sub-task title mapped via the Manager's decomposition JSON → emoji-stripped → substring).

---

## 10. Operations

**Docker** — `node:20-bookworm`, apt-installs `chromium` + Liberation/Noto-emoji fonts for PDF rendering, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`, `npm ci` → `prisma generate` → `npm run build`. `start.sh` runs `prisma db push --skip-generate` then `npm start`.

**docker-compose** — single service, ports **3001:3000**, `shm_size: 512m` (Chromium), named volume `sqlite_data:/app/data`.

**Hosting** — a Linux VPS running Docker, fronted by Caddy as a reverse proxy with automatic Let's Encrypt HTTPS → `localhost:3001`. Port 3000 is taken by a sibling app. Host details, credentials and the deployment runbook are kept out of this repo; see the private `deploy` skill.

⚠️ **Two recorded gotchas:**
1. `docker-compose` v1.29.2 on Ubuntu 24.04 fails to recreate containers (`KeyError: 'ContainerConfig'`). Workaround: `docker rm -f $(docker ps -q -f name=rightmind)` before `up`.
2. The auth cookie is `Secure`-flagged — reaching the app over plain HTTP by IP and port will **never** log you in. Must go through HTTPS on the real domain.

**Scripts** — `scripts/backup-db.js` (timestamped copy to `prisma/backups/`), `scripts/export-demo.mjs` (rebuilds `demo-fixtures.json` from live DB via `better-sqlite3`), `prisma/seed.ts` (upserts the owner user with the env OpenRouter key).

---

## 11. Project conventions (from `AGENTS.md` / `docs/AGENT_LEARNED.md`)

1. **Read `node_modules/next/dist/docs/` before writing code.** Next.js 16 differs from training data. Proxy ≠ Middleware.
2. **All LLM calls go through `callModel()`.** Never fetch OpenRouter directly.
3. **Strategy config is Markdown + YAML frontmatter**, not code. Add a strategy by adding a file.
4. **No code comments unless explicitly asked.**
5. TypeScript strict. Run `npx prisma generate` after schema changes (client is gitignored).
6. Models are **pinned per agent role** deliberately — architectural diversity is the product, not an accident.

---

## 12. Known issues, dead code & gaps

**Correctness / robustness**
- `parallel-aggregate.ts` and `sequential-debate.ts` **do not call `onJobFailed()`** in their catch blocks — no failure email or webhook for Consensus Board / Stress Tester failures.
- **Cancellation is an in-memory `Set`** (`src/lib/cancellation.ts`) — does not survive a process restart and does not work across multiple instances.
- `CANCELLED` is missing from the `JobStatus` union and from the SSE terminal switch.
- `executionMode: "overnight"` is accepted by the API but hard-coded to `"instant"` in both submit routes; there is no UI picker. The overnight cost/latency estimates are surfaced but unreachable.
- `/api/advisor/strategies` and `/strategies/[id]` have **no auth check** and the summary endpoint returns full agent + judge system prompts.
- `/api/v1/refine` verifies the user has an `openRouterKey` but then calls the model **without passing it** — those calls run on the server env key.
- Deep Dive's failure path persists the original 3-step array rather than the expanded worker steps, losing per-worker detail.
- Follow-up PDF/text attachments are base64-decoded as UTF-8 (mojibake for binary PDFs); images are placeholder-only.
- `AgentResponse.agentModel` records the configured model, not the `FILE_MODEL_SWAPS`-resolved one.
- API keys have no expiry, no scopes and no rate limiting; SHA-256 is unsalted.
- Demo login is unauthenticated and shares one account holding the server's OpenRouter key.
- SSE has no heartbeat and no max duration.

- ⚠️ **`demo-fixtures.json` has an inconsistent `progress` type**: fixture 0 stores it as a JSON *string*, fixture 1 and all four children store it as a parsed *object*. `AdvisorJob.progress` is a `String` column, so seeding crashed with `PrismaClientValidationError` and demo login returned 500. Fixed 2026-07-30 by normalising via `toProgressString()` in `seed-demo.ts` — but `scripts/export-demo.mjs` can regenerate the mixed shape, and the `DemoFixture` interface's `as` cast hides it from the compiler. Because seeding is not transactional, a mid-loop failure leaves the user partially seeded and `existingCount > 0` then makes it no-op forever.

**Dead / orphaned code**
- `AllAnglesVisualView.tsx` (935 lines — radar chart, similarity matrix, stance heatmap) is fully built but **imported nowhere**; it survived the revert commit `d46e41f`.
- `AnimatedEdge.tsx` and `JudgeNode.tsx` are built but never registered (`nodeTypes = { agent: AgentNode }` only; edges use built-in `smoothstep`).
- `sleep()` in `all-angles.ts`; unused `StrategyDiagram` import and `WORKFLOW_LABELS` in `advisor/page.tsx`.
- All-angles header comment claims polling; it calls orchestrators in-process.

**Missing**
- No test suite, no test script.
- No job queue — orchestration is fire-and-forget in the web process, so a restart mid-job orphans it in `RUNNING`.
- Error UX is `alert()` / `window.confirm()` throughout; no toast system.

---

## 13. Research foundations

Every design decision maps to published work. Load-bearing ones:

| Paper | What it drives |
|---|---|
| [SMoA: Sparse Mixture-of-Agents](https://arxiv.org/abs/2411.03284) | Consensus Board topology |
| [X-MAS: Heterogeneous LLMs](https://arxiv.org/abs/2505.16997) | Why models are pinned per role across four providers |
| [ReConcile](https://arxiv.org/abs/2309.13007) | Round Table multi-round agree/disagree |
| [RADAR](https://arxiv.org/abs/2604.19005) | Role anchoring — "YOUR ROLE IS FIXED" |
| [Problem Drift in Debate](https://arxiv.org/abs/2502.19559) | 2-round cap + challenge re-injection |
| [Conformal Social Choice](https://arxiv.org/abs/2604.07667) | All Angles cross-strategy alignment; minority dissent flagged not buried |
| [Tutor-Student Interaction](https://arxiv.org/abs/2604.08931) | Deep Dive hierarchical decomposition |
| [Topologies of Reasoning](https://arxiv.org/abs/2401.14295) | Why five strategies exist rather than one |
| Confidence-Modulated Debate | Round Table confidence-weighted update rules |

Full bibliography in `README.md` and `/advisor/why`.
