# GroundZeroOS — Agent Setup Guide

This file tells Claude (or any AI agent) exactly how to set up GroundZeroOS on a new machine. Follow these steps in order. Do not skip steps.

---

## What you are setting up

GroundZeroOS (`gzos`) is a local CLI that runs AI coding agents against a repo, phase by phase, using an Obsidian vault as the source of truth. After setup, the operator runs `gzos run` and agents execute development phases autonomously.

---

## Step 1 — Prerequisites check

Run each of these and confirm they pass before continuing:

```bash
node --version      # must be 18+
npm --version       # must be 8+
claude --version    # must be installed (npm install -g @anthropic-ai/claude-code)
```

If `claude` is not installed:
```bash
npm install -g @anthropic-ai/claude-code
```

If Node is not installed, tell the operator: install Node 18+ from https://nodejs.org and re-run setup.

---

## Step 2 — Install dependencies and build

```bash
cd /path/to/groundzeroOS-starter
npm install
```

`npm install` triggers `postinstall` which runs `tsc` automatically. The build output goes to `dist/`. After this, `gzos` is available as a local binary.

Verify the build succeeded:
```bash
node dist/cli/gzos.js --version 2>/dev/null || node dist/cli/gzos.js --help | head -5
```

If TypeScript errors appear, report them to the operator — do not proceed.

---

## Step 3 — Configure environment

```bash
cp .env.example .env
```

Open `.env` and set these two required values:

| Variable | What to set |
|---|---|
| `GROUNDZERO_VAULT_ROOT` | Absolute path to the operator's Obsidian vault (e.g. `/Users/alice/Obsidian/MyVault`). If they do not have a vault yet, use the bundled starter vault: `$(pwd)/vault` |
| `OPENROUTER_API_KEY` | Their OpenRouter API key from https://openrouter.ai — ask the operator for this |

**Agent driver keys are not required if the operator is already logged in:**
- Claude Code uses `claude login` session auth — no `ANTHROPIC_API_KEY` needed if already logged in
- Cursor uses Cursor account session — no key needed if already logged in

Only set `ANTHROPIC_API_KEY` if the operator explicitly has no `claude login` session on this machine.

All other variables are optional. Do not fill in optional variables unless the operator explicitly asks.

---

## Step 4 — Configure groundzero.config.json

Open `groundzero.config.json`. It ships with a blank `vault_root`. Set it to match `GROUNDZERO_VAULT_ROOT` from `.env`:

```json
{
  "vault_root": "/Users/alice/Obsidian/MyVault",
  ...
}
```

If the operator wants to use the bundled starter vault (no existing Obsidian vault), set:
```json
{
  "vault_root": "/absolute/path/to/groundzeroOS-starter/vault",
  ...
}
```

The bundled vault at `./vault/` is a fully working starter with example project, templates, and documentation. It is ready to use immediately.

---

## Step 5 — Make gzos available globally

Add `gzos` to the shell PATH so the operator can run it from any directory:

```bash
# Option A: npm link (recommended)
npm link

# Option B: alias (add to ~/.bashrc or ~/.zshrc)
echo 'alias gzos="node /absolute/path/to/groundzeroOS-starter/dist/cli/gzos.js"' >> ~/.bashrc
source ~/.bashrc
```

Verify:
```bash
gzos --help
```

You should see the command list. If not, debug the PATH and retry.

---

## Step 6 — Run doctor

```bash
gzos doctor
```

This checks every dependency and prints a green ✓ or a red ✗ with the exact fix command. Fix everything red before proceeding. Common issues:

| Error | Fix |
|---|---|
| `vault_root not set` | Set it in `.env` and `groundzero.config.json` as per Step 4 |
| `claude CLI not found` | `npm install -g @anthropic-ai/claude-code` |
| `OPENROUTER_API_KEY missing` | Set it in `.env` |
| `vault_root path does not exist` | Create the directory or correct the path |

---

## Step 7 — Create first project (optional)

If the operator wants to try it immediately with a new project:

```bash
gzos init "My App"
```

This will prompt for the repo path. Enter the absolute path to the codebase the operator wants to work on. GZOS will auto-detect the stack and create a full vault bundle.

If using the bundled starter vault, there is already a "My First Project" example to explore in Obsidian.

---

## Step 8 — Verify the run loop

Run a dry status check:
```bash
gzos status
```

Should print the project list and their phase states. If you see an error, check:
1. Is `vault_root` correct in both `.env` and `groundzero.config.json`?
2. Does the vault directory exist and contain markdown files?
3. Did the build in Step 2 complete without errors?

---

## Setup complete

Tell the operator:
- `gzos run` — starts the execution loop (picks up `phase-ready` phases, spawns agents)
- `gzos status` — shows all projects and their current state
- `gzos heal` — fixes vault drift, stale locks, broken links
- `gzos doctor` — re-run any time something feels wrong

For full documentation, open the vault in Obsidian and read:
- `00 - Dashboard/What is GroundZeroOS.md`
- `00 - Dashboard/Getting Started.md`

---

## Troubleshooting reference

**`gzos run` exits immediately with no output**
- No `phase-ready` phases found. Open Obsidian, find a phase note, and add `phase-ready` to its `tags` array in frontmatter.

**`gzos run` errors on spawn**
- The agent driver (`claude`) is not installed or not in PATH. Run `claude --version` to confirm.

**Phase stuck as `phase-active` with no agent running**
- Run `gzos heal`. The healer detects locks older than 5 minutes and clears them automatically.

**`pnpm` errors on install**
- This project uses `npm`, not `pnpm`. Use `npm install`.

**TypeScript build fails**
- Run `npm run build` and share the full error output with the operator.
