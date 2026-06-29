# RightMind — Learned Knowledge

> Notes captured from reading the codebase. A multi-agent LLM advisory platform: it takes a user's question, routes it through structured multi-model debate workflows, and returns a synthesised verdict.

## What it does (elevator pitch)

One AI gives one perspective. RightMind throws a user's question at **multiple LLMs from different providers** (Anthropic Claude, OpenAI GPT, Google Gemini, DeepSeek R1) running in structured workflows where they debate, stress-test, and synthesise before delivering a final report. Every agent can search the web live. The "argument already happened" — the user just gets the result.

The pipeline a user experiences:
1. **Refine** — a lightweight model asks targeted clarifying questions and classifies the problem type, picking the best strategy automatically ("Smart Refine").
2. **Analyse** — a panel of agents (each on a different model + persona) work the challenge via one of five workflows.
3. **Synthesise** — a Judge reads everything and writes the final report (verdict, agreement/disagreement, next steps).
4. **Follow up** — chained follow-up questions, each re-run through the multi-agent pipeline with full history.

## The five strategies

Each strategy is defined as a Markdown file with YAML frontmatter in `src/strategies/`, parsed by `src/lib/strategies.ts` (uses `gray-matter`). The frontmatter declares `agents` (role/model/color/systemPrompt) and a `judge`.

| Strategy | Workflow type | Orchestrator file | Mechanism |
|---|---|---|---|
| 🏛️ Consensus Board | `parallel_aggregate` | `parallel-aggregate.ts` | 4 specialists analyse in parallel independently → Judge synthesises into Go/No-Go verdict. Fastest (~15–30s). Based on SMoA. |
| 🔬 Deep Dive | `manager_worker` | `manager-worker.ts` | A manager breaks the challenge into sub-tasks; specialists tackle each; integration. Hierarchical decomposition. |
| ⚔️ Stress Tester | `sequential_debate` | `sequential-debate.ts` | Build case → devil's advocate tears it apart → refiner strengthens. **Capped at 2 rounds** (research: debates drift past 2–3 rounds). |
| 🤝 Round Table | `multi_round_consensus` | `multi-round-consensus.ts` | Multi-round discussion; agents score agreement/disagreement + **confidence (0–1)** which feeds forward. Role-anchored (RADAR) so nobody caves to peer pressure. |
| 🔮 All Angles | `all_angles` | `all-angles.ts` | Meta-strategy: runs all four above at once, then a Meta-Judge does cross-strategy analysis and produces a **decision alignment matrix**. Child jobs link via `parentJobId`. |

All four canonical strategies ship research citations (`arxivPapers` in frontmatter) — every design decision maps to published multi-agent research. Key concepts implemented:
- **Drift prevention** — original challenge re-injected at every debate stage.
- **Reasoning alignment check** — Consensus Board judge flags "false consensus" (same answer, contradictory reasoning).
- **Minority dissent flagged, not buried** (conformal social choice theory).

## Architecture / code layout

```
src/
├── app/
│   ├── login/                       # Magic-link auth pages
│   ├── advisor/                     # Authenticated dashboard
│   │   ├── jobs/                    # Job history + live viewer (SSE)
│   │   ├── strategy/[id]/           # Strategy detail pages
│   │   ├── settings/                # User OpenRouter key (BYOK)
│   │   └── why/                     # Explainer + research
│   └── api/
│       ├── auth/                    # Auth.js + /demo instant login
│       ├── advisor/                 # Session-authed internal API
│       │   ├── submit/              # POST create job → kicks off orchestrator
│       │   ├── jobs/                # GET list/[id] detail (+ SSE stream)
│       │   ├── jobs/[id]/follow-up/ # POST chained follow-ups
│       │   ├── jobs/[id]/pdf/       # GET Puppeteer PDF export
│       │   ├── jobs/[id]/reasoning/ # GET raw reasoning traces
│       │   ├── jobs/[id]/transcript/# GET full agent transcript
│       │   ├── refine/              # POST Smart Refine
│       │   ├── apikeys/             # User API key management (for external API)
│       │   └── strategies/           # GET list strategies
│       └── v1/                      # PUBLIC REST API (Bearer auth, rm_live_ keys)
│           ├── jobs/                # POST create job, GET [id] status
│           ├── refine/
│           └── strategies/
├── auth.ts                          # Auth.js v5 config (magic link + Prisma adapter)
├── proxy.ts                         # Next.js 16 Proxy (was "Middleware") — gates /advisor/*
├── components/                      # StrategyDiagram.tsx etc.
├── strategies/                      # 5 strategy .md configs (frontmatter + research notes)
└── lib/
    ├── llm.ts                       # OpenRouter client — ALL model calls go through callModel()
    ├── db.ts                        # Prisma singleton
    ├── strategies.ts                # Parses .md strategy configs (cached in prod)
    ├── types.ts                     # Shared types (StrategyConfig, LLMResponse, etc.)
    ├── api-auth.ts                  # Bearer auth for /v1 (hashes key, looks up ApiKey)
    ├── api-keys.ts                  # generate/hash keys (prefix rm_live_)
    ├── cancellation.ts              # In-memory job cancellation flags
    ├── job-complete.ts              # Post-job hooks (email, webhook)
    ├── email.ts                     # Resend (prod) / console log (dev)
    ├── file-content.ts              # File attachments, model-swap for non-vision models
    ├── webhook.ts                   # HMAC-signed webhook dispatch
    ├── seed-demo.ts / demo-fixtures.json  # Pre-computed demo jobs for new users
    └── orchestrators/               # The 5 strategy execution engines (see table above)
```

## Tech stack

- **Framework**: Next.js **16.2.4** (App Router, Turbopack). ⚠️ Per `AGENTS.md`: this is NOT the Next.js in my training data — read `node_modules/next/dist/docs/` before writing code. Notably the auth/protection layer is `proxy.ts` ("Proxy", formerly Middleware).
- **React** 19.2.4
- **Auth**: Auth.js v5 (next-auth 5.0.0-beta) — magic-link email + demo login. Prisma adapter. Sessions 30 days, DB-strategy.
- **DB**: SQLite + Prisma 6 (`prisma/schema.prisma`). Generated client at `src/generated/prisma/`.
- **LLM gateway**: **OpenRouter** (single endpoint, all providers). `callModel()` in `src/lib/llm.ts` is the only path to an LLM.
- **PDF**: Puppeteer-core + Chromium, server-side.
- **Email**: Resend (prod only; dev prints link to terminal).
- **Styling**: Tailwind v4 (via `@tailwindcss/postcss`), ESLint 9 flat config.
- **Markdown**: `gray-matter` (strategy configs), `marked`, `react-markdown` + `remark-gfm`.

## Key design decisions

### Models & providers
- Strategies pin **specific models per agent role** (e.g. Risk Analyst = `anthropic/claude-opus-4-7`, Growth Strategist = `openai/gpt-5.4`). Architectural diversity is the whole point — heterogeneous models surface blind spots a single model can't.
- **File model swap**: when a file is attached, text-only models get swapped to a vision-capable equivalent (e.g. DeepSeek R1 → `google/gemini-3.1-pro-preview`). See `FILE_MODEL_SWAPS` in `llm.ts`.
- **PDF parsing** uses OpenRouter's `file-parser` plugin with Cloudflare-AI engine (chosen to avoid Mistral OCR costs).
- **Privacy**: requests set `provider.data_collection: "deny"`.
- **JSON mode and web search are mutually exclusive** on OpenRouter — JSON mode disables web search. Web search is ON by default for non-JSON calls.
- **Reasoning traces** are extracted from OpenRouter's unified `reasoning` field and stored per agent response (toggleable per job).

### Auth & access
- **Magic link** is the primary login (email-based, 10-min link validity). Demo login at `demo@demo.com` gives instant access.
- **BYOK**: each user stores their own OpenRouter key (`User.openRouterKey`); falls back to server `OPENROUTER_API_KEY` env var.
- **Public API** (`/api/v1/*`) authenticates via Bearer tokens — user-generated API keys with `rm_live_` prefix, SHA-256 hashed and stored in `ApiKey` table. `src/lib/api-auth.ts`.
- **Proxy** (`src/proxy.ts`) gates all `/advisor/*` routes — redirects to `/login` if no session cookie.

### Job lifecycle
- `AdvisorJob` is the central entity. Status: `PENDING` → `RUNNING` → `DONE` | `FAILED` | `CANCELLED`.
- Submit (`/api/advisor/submit` or `/api/v1/jobs`) creates the job row then **fire-and-forgets** the orchestrator (`.catch()` for errors — request returns 202 immediately).
- Every LLM call is persisted as an `AgentResponse` (prompt, response, reasoning, tokens, cost, duration) — full transparency/replayability.
- Live progress via `progress` JSON field (array of `AgentStepProgress`) streamed over SSE.
- Cost & token totals roll up to the job (`totalCostUsd`, `totalTokens`).
- Follow-ups chain via `JobFollowUp` (turn number, prompt, response, model used).
- **Cancellation** is in-memory (per-process flag in `cancellation.ts`) — checked between phases.
- **Completion hooks** (`job-complete.ts`): optional Resend email (`User.emailOnComplete`) and HMAC-signed webhook (`webhookUrl`/`webhookSecret`).

### Resilience
- `parseJSON()` in `llm.ts` is hardened: strips code fences, repairs missing colons, and recovers truncated JSON (closes open strings/brackets) for when models hit `max_tokens` mid-response.

## Deployment

Deployed to **Hetzner Cloud VPS** (`89.167.62.131`, Ubuntu 24.04) via Docker, fronted by **Caddy** (auto-HTTPS via Let's Encrypt). App dir: `/opt/rightmind`. Live URL: `https://www.rightmind.uk`. SQLite persisted via Docker volume at `/app/data/production.db`. Container maps host port `3001` → container `3000` (port 3000 taken by sibling app `rightdata`). See `DEPLOYMENT.md` for the full runbook.

⚠️ Known server quirk: `docker-compose` v1.29.2 on the box crashes recreating existing containers (`KeyError: 'ContainerConfig'`). Workaround: `docker rm -f` before `up`.

⚠️ Auth cookie is `Secure`-flagged — raw `http://IP:3001` won't work; must go through Caddy/HTTPS.

## Conventions to follow when editing

- All LLM calls go through `callModel()` in `src/lib/llm.ts` — never fetch OpenRouter directly.
- Strategy config = Markdown + YAML frontmatter in `src/strategies/`. Cache is dev-hot but prod-cached; call `clearStrategyCache()` if needed.
- Next.js 16 uses **Proxy** (`src/proxy.ts`), not Middleware — verify against `node_modules/next/dist/docs/` before touching routing/auth.
- TypeScript strict; Prisma client is generated into `src/generated/prisma/` (gitignored) — run `npx prisma generate` after schema changes.
- Scripts: `npm run dev` (port 3000), `npm run build`, `npm run start`, `npm run lint`, `npm run db:backup`.
- No code comments unless explicitly asked (per agent rules).
