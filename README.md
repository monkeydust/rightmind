# RightMind

Multi-agent LLM advisory platform for complex decision-making. Submit a challenge, choose an intelligence strategy, and receive a comprehensive report synthesised from multiple AI models debating, critiquing, and refining each other's perspectives.

## Architecture

```
src/
├── app/
│   ├── login/              # Magic link auth pages
│   ├── advisor/            # Main dashboard, strategy pages, job viewer
│   │   ├── jobs/           # Job history (per-user)
│   │   ├── strategy/[id]/  # Strategy detail pages
│   │   └── why/            # Platform explainer & research
│   ├── api/
│   │   ├── auth/[...nextauth]/  # Auth.js route handler
│   │   └── advisor/
│   │       ├── submit/     # POST — create a new analysis job
│   │       ├── jobs/       # GET — list user's jobs; GET [id] — job detail + SSE
│   │       ├── refine/     # POST — AI-powered challenge refinement
│   │       └── strategies/ # GET — list available strategies
│   ├── providers.tsx       # SessionProvider wrapper
│   └── layout.tsx          # Root layout
├── lib/
│   ├── llm.ts              # OpenRouter API client (BYOK support)
│   ├── db.ts               # Prisma client singleton
│   ├── strategies.ts       # Strategy loader (reads markdown configs)
│   ├── types.ts            # Shared TypeScript types
│   └── orchestrators/      # Strategy execution engines
│       ├── multi-round-consensus.ts  # Consensus Board
│       ├── manager-worker.ts         # Deep Dive
│       ├── parallel-aggregate.ts     # Round Table
│       ├── sequential-debate.ts      # Stress Tester
│       └── all-angles.ts            # All Angles (meta)
├── strategies/             # Strategy config files (markdown + frontmatter)
│   ├── consensus-board.md
│   ├── deep-dive.md
│   ├── round-table.md
│   ├── stress-tester.md
│   └── all-angles.md
├── auth.ts                 # Auth.js config (magic link + Prisma adapter)
├── proxy.ts                # Route protection (Next.js 16 proxy)
└── generated/prisma/       # Prisma generated client (gitignored)
```

## Intelligence Strategies

| Strategy | Workflow | What it does |
|---|---|---|
| 🏛️ **Consensus Board** | Multi-round consensus | Multiple models debate across rounds until convergence |
| 🔬 **Deep Dive** | Manager-worker | A manager delegates sub-tasks to specialist worker models |
| 🤝 **Round Table** | Parallel aggregate | All models respond in parallel, then a synthesiser merges |
| ⚔️ **Stress Tester** | Sequential debate | Models critique and refine each other's responses in sequence |
| 🔮 **All Angles** | Meta-orchestrator | Runs all four strategies, then synthesises a final report |

## Prerequisites

- **Node.js** 20+
- **npm** 9+
- An **OpenRouter API key** from [openrouter.ai](https://openrouter.ai)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/monkeydust/rightmind.git
cd rightmind
npm install
```

### 2. Environment variables

Create a `.env` file (or edit the existing one):

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
# Run migrations to create all tables
npx prisma migrate dev

# Generate the Prisma client
npx prisma generate

# Seed your user account (edit prisma/seed.ts with your email first)
npx tsx --tsconfig tsconfig.json prisma/seed.ts
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Authentication

RightMind uses **Magic Link** authentication via Auth.js (NextAuth v5):

1. Visit any `/advisor` route — you'll be redirected to `/login`
2. Enter your email address and click **Send magic link**
3. **In development**: the magic link URL is printed to the terminal — copy and paste it into your browser
4. **In production**: the link is emailed via [Resend](https://resend.com) (requires `AUTH_RESEND_KEY`)
5. Sessions last 30 days

### BYOK (Bring Your Own Key)

Each user's OpenRouter API key is stored in the database linked to their email. This means:
- Each user pays for their own LLM usage
- Keys persist across sessions — set it once, use it forever
- The platform falls back to the `OPENROUTER_API_KEY` env var if no per-user key is set

## Database Management

### Backup

```bash
npm run db:backup
```

Creates a timestamped copy in `prisma/backups/`.

### Restore

```bash
copy prisma\backups\dev-2026-05-04T15-42-00.db prisma\dev.db
```

### Reset (⚠️ destructive)

```bash
npx prisma migrate reset --force
```

This wipes all data and re-applies migrations. Always backup first.

### View data

```bash
npx prisma studio
```

Opens a browser UI to inspect and edit database records.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (port 3000) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:backup` | Backup SQLite database |

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Auth**: Auth.js v5 (magic link email)
- **Database**: SQLite + Prisma ORM
- **LLM Gateway**: OpenRouter (Claude, GPT, Gemini, DeepSeek)
- **Email**: Resend (production only)
- **Styling**: Vanilla CSS + Tailwind CSS

## Project Conventions

- **Proxy** (`src/proxy.ts`): Next.js 16 renamed middleware to proxy. Protects `/advisor/*` routes.
- **Strategies** are defined as markdown files with YAML frontmatter in `src/strategies/`. The frontmatter configures agents, models, and workflow type.
- **Orchestrators** in `src/lib/orchestrators/` implement the execution logic for each workflow type.
- **LLM calls** go through `src/lib/llm.ts` which handles OpenRouter API calls, web search, JSON mode, and reasoning traces.
- **Jobs** are tracked in the database with real-time progress via Server-Sent Events (SSE).
