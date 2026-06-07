# RightMind

**A single AI gives you a single perspective. RightMind gives you the debtate through a Multi Agent approach using many LLM models**

When you ask ChatGPT or Claude a question, you get one answer from one model. It's often good. But it's never been challenged. Nobody played devil's advocate. Nobody checked the assumptions. Nobody asked *"what did you miss?"*

RightMind orchestrates multiple AI models — each with genuinely different reasoning architectures — into structured analytical workflows. Your question gets debated, stress-tested, and synthesised before the answer reaches you.

## See it in action

https://github.com/user-attachments/assets/91ec217e-3f54-434e-bc2f-a0661a6f1a06

## What happens when you submit a challenge

**1. Refine** — A lightweight model analyses your rough description and generates targeted clarifying questions: budget ranges, timelines, constraints. It classifies your problem type (Decision, Strategy, Diagnosis, Exploration) and recommends the best strategy automatically.

**2. Analyse** — Your challenge goes to a team of AI agents, each running on a different model (Claude, GPT, Gemini, DeepSeek). Depending on your chosen strategy, they work in parallel, debate adversarially, negotiate consensus, or decompose the problem into sub-tasks. Every agent has live internet access.

**3. Synthesise** — A Judge model reads all agent outputs and produces the final report: agreements, tensions, a verdict, and concrete next steps. One clear recommendation, backed by multiple independent analyses.

**4. Follow up** — Once you've read the report, ask follow-up questions. A refine step generates targeted clarifying questions so your follow-up is precise, then it runs through the same multi-agent pipeline. Conversations chain — each follow-up sees the full history.

## Four strategies, four reasoning topologies

Not every problem needs the same analytical approach.

| Strategy | What it does | Best for |
|---|---|---|
| 🏛️ **Consensus Board** | Four specialists analyse independently, then a judge synthesises. Based on the [Mixture-of-Agents](https://arxiv.org/abs/2411.03284) paradigm. | Open-ended strategic questions |
| 🔬 **Deep Dive** | A manager decomposes your challenge into sub-tasks, specialists solve each in depth, then it integrates. Based on [hierarchical decomposition](https://arxiv.org/abs/2604.08931). | Complex multi-dimensional problems |
| ⚔️ **Stress Tester** | A proposer builds the case, a devil's advocate attacks it, a refiner strengthens it. Capped at 2 rounds to [prevent drift](https://arxiv.org/abs/2502.19559). | Testing an existing idea or plan |
| 🤝 **Round Table** | Multi-round collaborative discussion where agents assess each other's arguments with structured agree/disagree scoring. Confidence scores from each round are fed back to agents in the next. [Role-anchored](https://arxiv.org/abs/2604.19005) so agents can't cave to social pressure. | Nuanced problems requiring negotiation |

**🔮 All Angles** runs all four simultaneously, then a Meta-Judge performs cross-strategy analysis — producing a decision alignment matrix that shows where strategies converge (high confidence) and where they diverge (genuine uncertainty).

## Why different models matter

RightMind deliberately uses models from **four different providers**: Anthropic Claude, OpenAI GPT, Google Gemini, and DeepSeek R1. This isn't arbitrary. Each model family was trained on different data, with different architectures, by different teams with different priorities. [Research confirms](https://arxiv.org/abs/2505.16997) that this architectural diversity produces genuinely independent reasoning paths — which is what you want when the goal is to surface blind spots and build confidence through convergence.

## The details that compound

- **Smart Refine** classifies your problem type and auto-selects the best strategy, so you don't need to understand multi-agent AI.
- **Follow-up conversations** — drill deeper into specific findings, challenge conclusions, or explore tangents. Each follow-up sees the full conversation history.
- **Live web search** on every agent — recommendations grounded in current data, not stale training.
- **PDF export** — download any analysis as a formatted PDF. Includes the full report, agent details, and strategy metadata.
- **Reasoning traces** — toggle to see the raw thinking process of each model, not just the polished output.
- **Drift prevention** — the original challenge is re-injected at every debate stage.
- **Role anchoring** — a Financial Analyst stays a Financial Analyst even when three other agents disagree.
- **Confidence scoring** — Round Table agents score their confidence on each point, and those scores feed into subsequent rounds.
- **Minority dissent is flagged, not suppressed** — consensus ≠ correctness, informed by [conformal social choice theory](https://arxiv.org/abs/2604.07667).
- **File attachments** — upload PDFs, images, or documents. Every agent in the strategy receives the file alongside the challenge.
- **Demo mode** — type `demo@demo.com` to explore pre-loaded examples without an API key.

## Built on research

Every architectural decision is grounded in peer-reviewed multi-agent AI research:

- [SMoA: Sparse Mixture-of-Agents](https://arxiv.org/abs/2411.03284) — Sparse agent selection beats dense all-to-all
- [X-MAS: Heterogeneous LLMs](https://arxiv.org/abs/2505.16997) — Diverse architectures outperform single models with different prompts
- [More Agents Is All You Need](https://arxiv.org/abs/2402.05120) — Scaling agent count improves accuracy via majority-vote convergence
- [Topologies of Reasoning](https://arxiv.org/abs/2401.14295) — No single topology dominates; different structures excel at different tasks
- [ReConcile](https://arxiv.org/abs/2309.13007) — Structured multi-round agree/disagree produces richer outputs than parallel-only
- [RADAR](https://arxiv.org/abs/2604.19005) — Strict role anchoring prevents conformity under social pressure
- [Multi-Agent Adversarial Debate](https://arxiv.org/abs/2401.05998) — Adversarial debate significantly improves reasoning robustness
- [Problem Drift in Debate](https://arxiv.org/abs/2502.19559) — Debates beyond 2–3 rounds cause drift; re-inject the original problem
- [Conformal Social Choice](https://arxiv.org/abs/2604.07667) — Consensus across independent methods provides statistical confidence
- [Tutor-Student Interaction](https://arxiv.org/abs/2604.08931) — Hierarchical decomposition outperforms flat debate for complex problems

---

## Getting started

### Prerequisites

- **Node.js** 20+
- **npm** 9+
- An **OpenRouter API key** from [openrouter.ai](https://openrouter.ai)

### 1. Clone and install

```bash
git clone https://github.com/monkeydust/rightmind.git
cd rightmind
npm install
```

### 2. Environment variables

Create a `.env` file:

```env
# Database (SQLite, default path)
DATABASE_URL="file:./dev.db"

# OpenRouter — your LLM gateway key
OPENROUTER_API_KEY="sk-or-v1-..."

# Auth.js — generate with: npx auth secret
AUTH_SECRET="<random-secret>"
AUTH_URL="http://localhost:3000"

# (Optional) Resend — for production email delivery
# AUTH_RESEND_KEY="re_..."
```

### 3. Database setup

```bash
npx prisma migrate dev
npx prisma generate
npx tsx --tsconfig tsconfig.json prisma/seed.ts  # edit prisma/seed.ts with your email first
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Authentication

Magic link authentication via Auth.js (NextAuth v5):

1. Visit any `/advisor` route — you'll be redirected to `/login`
2. Enter your email and click **Send magic link**
3. **Development**: the magic link URL is printed to the terminal
4. **Production**: emailed via [Resend](https://resend.com) (requires `AUTH_RESEND_KEY`)
5. **Demo mode**: type `demo@demo.com` for instant access — no email required
6. Sessions last 30 days

### BYOK (Bring Your Own Key)

Each user's OpenRouter API key is stored in the database linked to their email:
- Each user pays for their own LLM usage
- Keys persist across sessions
- Falls back to the `OPENROUTER_API_KEY` env var if no per-user key is set

## Architecture

```
src/
├── app/
│   ├── login/              # Magic link auth pages
│   ├── advisor/            # Dashboard, strategy pages, job viewer
│   │   ├── jobs/           # Job history (per-user)
│   │   ├── strategy/[id]/  # Strategy detail pages
│   │   └── why/            # Platform explainer & research
│   ├── api/
│   │   ├── auth/
│   │   │   ├── [...nextauth]/  # Auth.js route handler
│   │   │   └── demo/           # Instant demo login endpoint
│   │   └── advisor/
│   │       ├── submit/     # POST — create a new analysis job
│   │       ├── jobs/       # GET — list jobs; GET [id] — job detail + SSE
│   │       ├── jobs/[id]/follow-up/   # POST — follow-up conversations
│   │       ├── jobs/[id]/pdf/         # GET — PDF export
│   │       ├── jobs/[id]/reasoning/   # GET — raw reasoning traces
│   │       ├── jobs/[id]/transcript/  # GET — full agent transcript
│   │       ├── refine/     # POST — AI-powered challenge refinement
│   │       └── strategies/ # GET — list available strategies
│   ├── providers.tsx       # SessionProvider wrapper
│   └── layout.tsx          # Root layout
├── lib/
│   ├── llm.ts              # OpenRouter API client (BYOK)
│   ├── db.ts               # Prisma client singleton
│   ├── strategies.ts       # Strategy loader (markdown configs)
│   ├── types.ts            # Shared TypeScript types
│   ├── seed-demo.ts        # Demo fixture seeder
│   ├── demo-fixtures.json  # Pre-computed demo job results
│   └── orchestrators/      # Strategy execution engines
│       ├── multi-round-consensus.ts  # Consensus Board
│       ├── manager-worker.ts         # Deep Dive
│       ├── parallel-aggregate.ts     # Round Table
│       ├── sequential-debate.ts      # Stress Tester
│       └── all-angles.ts            # All Angles (meta)
├── components/
│   └── StrategyDiagram.tsx  # Visual strategy workflow diagrams
├── strategies/             # Strategy configs (markdown + frontmatter)
├── auth.ts                 # Auth.js config (magic link + Prisma adapter)
├── proxy.ts                # Route protection (Next.js 16 proxy)
└── generated/prisma/       # Prisma generated client (gitignored)
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:backup` | Backup SQLite database |

## Tech stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Auth**: Auth.js v5 (magic link email + instant demo login)
- **Database**: SQLite + Prisma ORM
- **LLM Gateway**: OpenRouter (Claude, GPT, Gemini, DeepSeek)
- **PDF**: Puppeteer + Chromium (server-side rendering)
- **Email**: Resend (production only)
- **Styling**: Vanilla CSS
