# Multi-agent CLI workflow for enhancing OpenClaw (Claude Code + Codex CLI + Gemini CLI + Kimi CLI)

This doc is meant to be pasted into Claude (or used as a runbook) to orchestrate 4 CLI coding agents on a shared repo. It assumes:

- You can run each agent in its own terminal/tmux pane.
- You want deterministic, reviewable changes (small PR-sized increments).
- You want to avoid agents stepping on each other’s edits.

---

## 0) High-level principle

**One “planner” + multiple “doers”, with strict lanes and a single merge gate.**

- **Planner / Architect:** Claude Code (design + task decomposition + acceptance criteria)
- **Implementer (fast):** Codex CLI (mechanical edits + straightforward implementations)
- **Repo-wide context + docs:** Gemini CLI (cross-file auditing, docs, CI/log interpretation)
- **Tooling/orchestration hub:** Kimi CLI (command runner, linters/tests, scaffolding, search/grep, mass refactors with guardrails)

**Rule:** Only one agent writes to a branch at a time unless you intentionally shard work into separate branches.

---

## 1) Repo setup (one-time)

### 1.1 Branching strategy

- `main` (protected)
- `dev` (optional integration branch)
- Feature branches:
  - `feat/<topic>-<date>` for new features/refactors
  - `fix/<bug>-<date>` for bugfixes

### 1.2 Guardrails

Add/confirm:

- formatter + linter (e.g., `ruff/black`, `eslint/prettier`, `golangci-lint`, etc.)
- unit tests + smoke tests
- pre-commit hooks (optional but recommended)
- CI workflow that runs: lint → unit → integration (if any)

### 1.3 Shared “agent contract”

Create `AGENTS.md` in repo root (commit it). Contents:

- coding standards
- directory ownership map
- how to run tests
- expected PR format
- how to write changelog entries

---

## 2) Recommended tmux layout (4 panes)

Pane A — Claude Code (planner)  
Pane B — Codex CLI (implementer)  
Pane C — Gemini CLI (auditor/doc/CI)  
Pane D — Kimi CLI (runner/refactor assistant)

Optional: Pane E — human reviewer / git UI.

---

## 3) Roles & responsibilities

### 3.1 Claude Code (Planner)

Primary duties:

- read/understand architecture
- produce a task graph with **acceptance criteria**
- decide scope boundaries
- create implementation notes that reduce ambiguity for implementers
- review diffs and request fixes

Outputs (must be written to files):

- `docs/plans/<topic>.md` (plan + ADRs)
- `docs/tasks/<topic>.yaml` (task list + owners + status)
- `docs/acceptance/<topic>.md` (testable criteria)

### 3.2 Codex CLI (Implementer)

Primary duties:

- implement discrete tasks with clear acceptance criteria
- keep diffs small and focused
- write tests for new behavior
- update docs only when explicitly tasked

### 3.3 Gemini CLI (Auditor/Research)

Primary duties:

- scan repo for duplication, dead code, inconsistent patterns
- validate changes against project conventions
- interpret CI failures, logs, stack traces
- produce/update docs and examples
- propose follow-up tasks (not implement unless asked)

### 3.4 Kimi CLI (Tooling/Execution Hub)

Primary duties:

- run commands: lint/test/build, benchmark, static analysis
- gather “facts” for planner: file maps, grep results, dependency graphs
- perform safe mechanical refactors _after_ planner approves
- enforce branch hygiene: rebase, resolve conflicts, ensure clean state

---

## 4) Workflow: one iteration (repeatable)

### Step 1 — Intake & goal definition (Claude)

**Input:** “Enhance OpenClaw: <goal>”

Claude produces:

1. `docs/plans/<goal>.md`:
   - problem statement
   - constraints (perf, safety, backwards compatibility)
   - non-goals
   - architecture notes
2. `docs/acceptance/<goal>.md`:
   - acceptance criteria (tests, CLI behavior, API behavior)
   - measurable checks (runtime, memory, latency, etc.)
3. `docs/tasks/<goal>.yaml`:
   - tasks with owners: `claude|codex|gemini|kimi|human`
   - dependencies, timeboxes, files likely touched

### Step 2 — Repo reconnaissance (Kimi + Gemini)

Kimi runs commands and writes results to `docs/recon/<goal>.md`:

- `rg`/`grep` findings
- module boundaries
- key entrypoints
- existing tests coverage map
- build/lint commands and their runtime

Gemini produces `docs/audit/<goal>.md`:

- code smells
- duplicated patterns
- risky areas
- suggested minimal-change path

### Step 3 — Shard work into branches (human or Kimi)

Option A (simplest): single branch, sequential edits.  
Option B (parallel): multiple branches by module/area.

For parallel:

- `feat/<goal>-core`
- `feat/<goal>-cli`
- `feat/<goal>-docs`
- `feat/<goal>-tests`

**Rule:** each branch has a single “writer” agent at a time.

### Step 4 — Implementation (Codex)

Codex picks a task from `docs/tasks/<goal>.yaml` and:

- creates a feature branch (or uses assigned branch)
- implements only that task
- adds/updates tests
- runs local checks (via Kimi runner)
- opens a PR or provides a patch summary

### Step 5 — Verification (Kimi)

Kimi runs:

- formatter/linter
- unit tests
- smoke/integration tests
- optional benchmarks
  and writes `docs/verify/<goal>-<branch>.md` including:
- commands executed
- pass/fail summary
- any regressions
- suggested fixes

### Step 6 — Review & integration (Claude + human)

Claude reviews diffs:

- validates acceptance criteria alignment
- checks for architectural drift
- requests follow-ups if needed

Human merges after:

- CI green
- acceptance criteria met
- docs updated as required

---

## 5) “Task file” format (docs/tasks/<goal>.yaml)

Use this schema:

```yaml
goal: "<goal>"
branch_strategy: "single|parallel"
owners:
  planner: "claude"
  implementer: "codex"
  auditor: "gemini"
  runner: "kimi"
tasks:
  - id: T1
    title: "Identify entrypoints and extension points"
    owner: "kimi"
    status: "todo|doing|done|blocked"
    depends_on: []
    files_hint: ["src/", "lib/"]
    acceptance:
      - "docs/recon/<goal>.md updated with entrypoints"
  - id: T2
    title: "Refactor X to Y"
    owner: "codex"
    status: "todo"
    depends_on: ["T1"]
    files_hint: ["src/foo.py", "src/bar.py"]
    acceptance:
      - "All unit tests pass"
      - "New test: tests/test_<x>.py covers Y"
```

---

## 6) Prompt templates (copy/paste)

### 6.1 Claude Code — Planner prompt

Use when starting a new goal:

```text
You are the planner/architect for enhancing the OpenClaw repo.
Goal: <GOAL>

Constraints:
- Keep diffs small and reviewable.
- Do not change public interfaces without documenting migration.
- Prefer minimal-change, high-signal improvements.
- Every behavioral change must have a test.
- Write your outputs to:
  - docs/plans/<GOAL>.md
  - docs/acceptance/<GOAL>.md
  - docs/tasks/<GOAL>.yaml

First, map the architecture at a module level, identify critical paths, and propose an incremental plan.
Then produce the YAML task list with owners (claude/codex/gemini/kimi/human) and explicit acceptance criteria.
```

### 6.2 Kimi CLI — Recon runner prompt

```text
Act as a terminal operations agent. Do not implement features.
Goal: <GOAL>
Tasks:
1) Identify entrypoints, CLI commands, and main execution path.
2) Map module boundaries and cross-module dependencies.
3) List the exact commands to lint/test/build/benchmark.
4) Write results to docs/recon/<GOAL>.md with commands and findings.

Avoid speculation; run commands and report results.
```

### 6.3 Gemini CLI — Repo audit prompt

```text
Act as a codebase auditor and documentation assistant.
Goal: <GOAL>
Please:
- Scan the repo for duplicated code, inconsistent patterns, and risky areas.
- Suggest the smallest-change path that meets acceptance criteria.
- Flag any API stability concerns and missing tests.
Write output to docs/audit/<GOAL>.md with actionable bullets and file references.
Do not implement changes unless explicitly assigned.
```

### 6.4 Codex CLI — Implementer prompt

```text
You are implementing a single task from docs/tasks/<GOAL>.yaml: <TASK_ID>.
Rules:
- Touch only files needed for this task.
- Add/modify tests to cover behavior changes.
- Keep changes minimal and consistent with existing style.
- Run relevant checks (or ask Kimi to run them).
Output:
- Provide a brief PR summary: what changed, why, tests run, risks.
```

---

## 7) Conflict avoidance & merge discipline

### 7.1 File ownership lanes

Define ownership in `AGENTS.md`, e.g.:

- `docs/**` → Gemini (unless plan/acceptance/tasks, which is Claude)
- `scripts/**` and CI → Kimi
- `src/**` / core code → Codex
- `architecture decisions` → Claude

### 7.2 Locking

When an agent is assigned a branch, it “locks” it by writing:

- `docs/locks/<branch>.lock` with:
  - agent name
  - start time
  - task ID
  - expected completion criteria

Only the lock owner edits that branch until unlocked.

---

## 8) Quality gates (minimum)

A PR is mergeable only if:

- lint/format passes
- tests pass
- acceptance criteria checkboxes are satisfied
- changelog/release notes updated if user-facing
- no “drive-by” refactors unrelated to the task

---

## 9) Useful command checklist (adapt to repo)

Kimi should maintain `docs/commands.md` with exact commands, e.g.:

- `make lint`
- `make test`
- `make test-integration`
- `make bench`
- `npm test`
- `pytest -q`
- `ruff check .`
- `black .`

---

## 10) Suggested “best result” orchestration (default)

If you want the best overall outcome (quality + velocity):

1. **Claude** writes plan + acceptance + tasks
2. **Kimi** runs recon + produces command map + confirms baseline green
3. **Gemini** audits and suggests minimal-change path + doc plan
4. **Codex** implements tasks sequentially, with Kimi running verification each time
5. **Claude** reviews diffs + enforces architecture consistency
6. **Human** merges only green PRs with acceptance criteria met

---

## 11) If you want parallelism (safe version)

Parallelize by module boundary, not by arbitrary tasks.

Example:

- Branch A: core engine changes (Codex)
- Branch B: CLI UX + wiring (Codex or Gemini if docs-heavy)
- Branch C: tests (Codex)
- Branch D: docs + examples (Gemini)

Kimi manages merges into `dev` and resolves conflicts, then Claude reviews integrated diff.

---

## 12) Metrics to track (to keep agents honest)

Create `docs/metrics/<goal>.md` and track:

- PR count, average diff size
- time-to-green CI
- test coverage deltas (if available)
- bug regression count
- performance deltas (benchmarks)

---

## 13) Minimal “kickoff” sequence (copy/paste)

Run these commands (adjust for repo):

```bash
git checkout main
git pull --rebase
git checkout -b feat/<goal>-$(date +%Y%m%d)
# Baseline
<lint command>
<test command>
# Save baseline results
mkdir -p docs/recon docs/audit docs/verify docs/plans docs/acceptance docs/tasks docs/locks
```

Then:

- Claude generates plan/tasks/acceptance
- Kimi generates recon
- Gemini generates audit
- Codex executes tasks

---

## 14) Notes specific to OpenClaw-style repos (common pitfalls)

- Agent changes that “improve architecture” but silently break edge cases.
- Over-refactors: rename storms, mass formatting changes without value.
- Missing tests for CLI I/O contracts.
- Concurrency/async changes without deterministic tests.
- Non-deterministic tooling outputs in CI.

Mitigation:

- enforce small diffs
- require contract tests for CLI + API boundaries
- run reproducible seed for any randomized logic
- isolate behavior changes behind flags if needed

---

## 15) Optional: automated “task runner” script (pattern)

If you want to formalize orchestration, add a `scripts/agent_runner.sh` that:

- validates branch clean
- checks lock status
- runs lint/tests
- writes verification report to `docs/verify/`

(Keep it simple; avoid introducing more moving parts than needed.)

---

## Appendix A — Example PR template

Create `.github/pull_request_template.md`:

- What changed:
- Why:
- Tests run:
- Acceptance criteria checklist:
- Risks/rollout notes:
- Docs updated:

---

End.
