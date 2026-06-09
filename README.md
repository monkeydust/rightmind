# RightMind

**One AI gives you one perspective. RightMind makes them argue first.**

You know when you ask ChatGPT something and it gives you a confident, polished answer? It's usually pretty good. But nobody pushed back on it. Nobody said "hang on, what about..." or "you're ignoring the fact that...". You just got one model's take and that was it.

RightMind takes your question and throws it at multiple AI models (Claude, GPT, Gemini, DeepSeek) running in structured workflows. They debate, stress-test, and synthesise before anything reaches you. The argument already happened. You just get the result.

## See it in action

https://github.com/user-attachments/assets/91ec217e-3f54-434e-bc2f-a0661a6f1a06

🔊 **[Watch with voiceover walkthrough →](https://streamable.com/e49cgt)**

## How it works

**1. Refine** - You describe your problem roughly. A lightweight model asks you targeted questions (budget? timeline? constraints?) and figures out what type of problem you have. It picks the best strategy for you automatically.

**2. Analyse** - Your challenge goes to a panel of AI agents, each on a different model. Depending on the strategy, they might work independently, argue adversarially, negotiate towards consensus, or break the problem into pieces. Every agent can search the web.

**3. Synthesise** - A Judge reads everything the agents produced and writes the final report. Where they agreed, where they disagreed, what the verdict is, and what you should actually do next.

**4. Follow up** - Read the report, then ask follow-up questions. Want to drill into something specific? Challenge a conclusion? Each follow-up runs through the same multi-agent pipeline and sees the full conversation history.

## Four strategies

Different problems need different approaches.

| Strategy | How it works | Good for |
|---|---|---|
| 🏛️ **Consensus Board** | Four specialists analyse independently, then a judge pulls it together. Based on [Mixture-of-Agents](https://arxiv.org/abs/2411.03284). | Open-ended strategic questions |
| 🔬 **Deep Dive** | A manager breaks your challenge into sub-tasks, specialists tackle each one in depth, then it's all integrated. Based on [hierarchical decomposition](https://arxiv.org/abs/2604.08931). | Complex problems with lots of dimensions |
| ⚔️ **Stress Tester** | Someone builds the case, a devil's advocate tears it apart, a refiner strengthens what survives. Capped at 2 rounds so it doesn't [go off the rails](https://arxiv.org/abs/2502.19559). | When you've already got a plan and want it pressure-tested |
| 🤝 **Round Table** | Multi-round discussion where agents score how much they agree or disagree with each other. Confidence scores feed forward into the next round. [Role-anchored](https://arxiv.org/abs/2604.19005) so nobody just caves to peer pressure. | Nuanced stuff that needs genuine negotiation |

**🔮 All Angles** runs all four at once, then a Meta-Judge does cross-strategy analysis. It produces a decision alignment matrix showing where strategies agree (probably right) and where they don't (genuine uncertainty you need to think about).

## Why different models matter

This uses models from **four different providers**: Anthropic Claude, OpenAI GPT, Google Gemini, and DeepSeek R1. Each was trained on different data, with different architectures, by different teams with different priorities. [Research shows](https://arxiv.org/abs/2505.16997) that this kind of architectural diversity produces genuinely independent reasoning. That's what you want when you're trying to surface blind spots.

## Things worth knowing about

- **Smart Refine** classifies your problem type and picks the strategy, so you don't need to know anything about multi-agent AI
- **Follow-up conversations** that chain together, each one seeing the full history
- **Live web search** on every agent so you get current data, not stale training knowledge
- **PDF export** for any analysis
- **Reasoning traces** so you can see what each model was actually thinking, not just the polished output
- **Drift prevention** re-injects the original challenge at every debate stage so agents don't wander off topic
- **Role anchoring** so a Financial Analyst stays a Financial Analyst even when three other agents disagree
- **Confidence scoring** in Round Table where agents score their certainty and those scores feed into the next round
- **Minority dissent gets flagged, not buried**. Consensus doesn't equal correctness. Informed by [conformal social choice theory](https://arxiv.org/abs/2604.07667)
- **File attachments** for PDFs, images, documents. Every agent in the strategy sees the file
- **Demo mode** if you just want to poke around. Type `demo@demo.com` on the login page

## The research behind it

Every design decision maps to published multi-agent AI research:

- [SMoA: Sparse Mixture-of-Agents](https://arxiv.org/abs/2411.03284) - Sparse agent selection beats dense all-to-all
- [X-MAS: Heterogeneous LLMs](https://arxiv.org/abs/2505.16997) - Diverse architectures outperform same model with different prompts
- [More Agents Is All You Need](https://arxiv.org/abs/2402.05120) - More agents improves accuracy through majority-vote convergence
- [The Crowd Without People](https://link.springer.com/article/10.1007/s10726-026-09993-w) - Agent heterogeneity and structured collaboration outperform stronger individual models
- [Topologies of Reasoning](https://arxiv.org/abs/2401.14295) - No single topology dominates; different structures suit different tasks
- [ReConcile](https://arxiv.org/abs/2309.13007) - Multi-round agree/disagree produces better outputs than parallel-only
- [RADAR](https://arxiv.org/abs/2604.19005) - Role anchoring prevents conformity under social pressure
- [Multi-Agent Adversarial Debate](https://arxiv.org/abs/2401.05998) - Adversarial debate improves reasoning robustness
- [Problem Drift in Debate](https://arxiv.org/abs/2502.19559) - Debates beyond 2-3 rounds drift; re-inject the original problem
- [Conformal Social Choice](https://arxiv.org/abs/2604.07667) - Consensus across independent methods gives statistical confidence
- [Tutor-Student Interaction](https://arxiv.org/abs/2604.08931) - Hierarchical decomposition outperforms flat debate for complex problems
- [Consistency Illusion](https://arxiv.org/) - Agents can agree on answers while reasoning diverges; grounded debate protocols fix this
- [Confidence-Modulated Debate](https://arxiv.org/) - Calibrated confidence levels improve debate outcomes vs uniform belief updates

---

## Getting started

### You'll need

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

# OpenRouter - your LLM gateway key
OPENROUTER_API_KEY="sk-or-v1-..."

# Auth.js - generate with: npx auth secret
AUTH_SECRET="<random-secret>"
AUTH_URL="http://localhost:3000"

# (Optional) Resend - for production email delivery
# AUTH_RESEND_KEY="re_..."
```

### 3. Database setup

```bash
npx prisma migrate dev
npx prisma generate
npx tsx --tsconfig tsconfig.json prisma/seed.ts  # edit prisma/seed.ts with your email first
```

### 4. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Authentication

Magic link login via Auth.js (NextAuth v5):

1. Hit any `/advisor` route and you'll get redirected to `/login`
2. Enter your email, click **Send magic link**
3. **In dev**: the link prints to terminal
4. **In prod**: emailed via [Resend](https://resend.com) (needs `AUTH_RESEND_KEY`)
5. **Demo**: type `demo@demo.com` for instant access, no email needed
6. Sessions last 30 days

### BYOK (Bring Your Own Key)

Each user has their own OpenRouter API key stored against their account:
- You pay for your own usage
- Keys persist across sessions
- Falls back to the server's `OPENROUTER_API_KEY` if no user key is set

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
│   │       ├── submit/     # POST - create a new analysis job
│   │       ├── jobs/       # GET - list jobs; GET [id] - job detail + SSE
│   │       ├── jobs/[id]/follow-up/   # POST - follow-up conversations
│   │       ├── jobs/[id]/pdf/         # GET - PDF export
│   │       ├── jobs/[id]/reasoning/   # GET - raw reasoning traces
│   │       ├── jobs/[id]/transcript/  # GET - full agent transcript
│   │       ├── refine/     # POST - AI-powered challenge refinement
│   │       └── strategies/ # GET - list available strategies
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
- **Auth**: Auth.js v5 (magic link + demo login)
- **Database**: SQLite + Prisma ORM
- **LLM Gateway**: OpenRouter (Claude, GPT, Gemini, DeepSeek)
- **PDF**: Puppeteer + Chromium (server-side)
- **Email**: Resend (production only)
- **Styling**: Vanilla CSS
