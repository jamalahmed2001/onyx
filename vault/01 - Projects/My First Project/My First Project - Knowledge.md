---
tags:
  - project-knowledge
  - example
project: My First Project
created: 2026-01-01T00:00:00.000Z
---
## 🔗 Navigation

- [[My First Project - Overview|Overview]]

# My First Project — Knowledge

## Learnings

> Consolidator (P3) appends here after each phase completes.
> Each entry: decisions made, gotchas, patterns to reuse.

(no phases completed yet)


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_


---
_2026-03-30 — [[P1 - Example Phase|Example Phase]]_

### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content** — `printf 'text'` reliably writes content without a trailing newline; `echo` adds one by default and should be avoided when byte-exact output is required.
- **Command chaining (`&&`) caused unexpected exit code 1 failures** — running `pwd` or `touch` in chained commands failed while the same commands succeeded in isolation; prefer single, unchained commands when diagnosing environment issues.
- **Acceptance criteria were repeatedly marked unmet despite tasks completing** — the phase blocked and replanned twice before succeeding, suggesting the acceptance-verification step was not correctly reading the file written in prior runs; verify that file paths used during creation and verification are consistent.
- **`repo_path` configuration is a silent prerequisite** — if the target directory is invalid or unwritable, tasks fail with generic exit code 1 errors and no clear diagnostic; always validate `repo_path` before execution begins.
- **Consolidation ran in an uncontrolled loop** — `consolidate_done` fired 18+ times in a single run, indicating a runaway loop in the post-completion hook that should be guarded with an idempotency check.
- **Commit messages inherited raw checklist syntax** — task descriptions formatted as `- [ ] ...` leaked into commit messages; task metadata should be stripped before being passed to git commit.
### Learnings from Example Phase

- **Use `printf` instead of `echo` for exact file content** — `echo` appends a trailing newline by default; `printf 'ONYX is running.' > hello.txt` reliably produces content with no newline.
- **Chained shell commands (`&&`) caused repeated exit-code-1 failures** — running commands in isolation (e.g., `pwd` alone) was more reliable than chaining them; avoid command chaining when the environment's shell behaviour is uncertain.
- **Acceptance criteria were failing despite tasks reporting done** — the file was being written to the wrong directory; always verify the target path matches `repo_path` before writing files.
- **Byte-level verification (`xxd`) is the correct tool for exact-content checks** — `cat` alone can mask hidden characters or newlines; use `xxd` when content must match precisely.
- **`consolidate_done` fired in an uncontrolled loop** — the consolidation step triggered 17+ times in a single run, suggesting a loop condition that needs a guard to prevent redundant appends to `Knowledge.md`.
- **Replanning consumed both replan slots before the root cause was identified** — environment/path issues should be diagnosed in the first replan rather than retrying the same write commands with minor variations.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content**: `printf 'ONYX is running.' > hello.txt` reliably avoids trailing newlines; `echo` appends one by default and caused repeated acceptance failures.
- **Chained shell commands are fragile in this environment**: Commands joined with `&&` repeatedly exited with code 1 even when individual commands (e.g. `echo "shell ok"`) succeeded — issue commands atomically where possible.
- **Byte-level verification catches hidden characters early**: Using `xxd` to inspect file content is a reliable acceptance check for exact-match file tasks and should be standard practice.
- **Acceptance criteria failures triggered excessive replanning**: Two full replan cycles were consumed before the root cause (environment/command execution constraints) was identified — diagnose the environment first before retrying task logic.
- **`consolidate_done` ran in an uncontrolled loop**: The consolidation step fired 17+ times in a single run, indicating a loop bug that should be investigated and guarded against in the orchestration layer.
- **Commit messages inherited raw checklist syntax**: Task descriptions (`- [ ]`) leaked into commit messages; a formatting/sanitisation step is needed before committing.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content**: `printf 'ONYX is running.' > hello.txt` reliably produces no trailing newline; `echo` appends one by default and caused repeated acceptance failures.
- **Chained shell commands (`&&`) can cause exit-code failures**: Several tasks blocked with `Process exited with code 1` when commands were chained; running single, isolated commands proved more reliable in this environment.
- **Acceptance criteria verification should be explicit and automated**: Early runs completed all tasks but still hit `phase_blocked` because verification was informal; a direct shell assertion (`[ "$(cat file)" = "expected" ] && echo PASS`) makes pass/fail unambiguous.
- **`repo_path` misconfiguration silently breaks file operations**: The mid-session environment failures (exit code 1 on `pwd`, `ls`, `touch`) suggest the working directory was not correctly resolved; validating `repo_path` before execution would catch this early.
- **Replanning loops are costly — root-cause before replanning**: The phase triggered multiple replan cycles that repeated similar tasks without resolving the underlying issue; diagnosing the environment problem first would have shortened execution significantly.
- **`consolidate_done` fired in an uncontrolled loop**: The event was logged 16+ times in rapid succession after phase completion, indicating a runaway consolidation trigger that should be guarded with a deduplication check.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content**: `printf 'ONYX is running.' > hello.txt` reliably produces no trailing newline; `echo` appends one by default and caused repeated acceptance failures.
- **Chaining commands with `&&` can mask failures**: Several tasks blocked with exit code 1 when commands were chained; running commands individually (e.g., `pwd` alone) is more reliable for diagnosing environment issues.
- **Acceptance criteria failures triggered costly replan loops**: Two full replan cycles were exhausted before the root cause (file content mismatch / environment access) was resolved; verifying the execution environment early would have short-circuited this.
- **Byte-level verification (`xxd`) is the right tool for exact-content checks**: Using `xxd` to inspect for hidden characters or trailing newlines is more trustworthy than `cat` alone when strict content matching is required.
- **`repo_path` misconfiguration silently breaks file operations**: Tasks blocked immediately with exit code 1 in one run, indicating the target directory was invalid or inaccessible; validating `repo_path` before execution is a necessary pre-flight check.
- **Consolidation loops should be guarded against repetition**: The `consolidate_done` event fired 15+ times in a single run, suggesting the consolidation step lacked an idempotency guard and should only execute once per phase completion.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content** — `printf 'ONYX is running.'` reliably omits trailing newlines; `echo` adds one by default and caused repeated acceptance failures.
- **Chained shell commands (`&&`) caused unexpected exit code 1 failures** — running commands in isolation (e.g., `pwd` alone) was more reliable than chaining them in this environment.
- **Acceptance criteria failures triggered costly replan loops** — two full replan cycles were exhausted before the root cause (file content/path mismatch) was resolved; earlier byte-level verification (`xxd`) would have diagnosed the issue faster.
- **Verify the target `repo_path` is valid before execution** — several blocked runs appeared to stem from the agent writing to the wrong or inaccessible directory; confirming the path upfront prevents wasted cycles.
- **`consolidate_done` fired excessively in a loop** — the consolidation step triggered 14 times in a single run, suggesting a runaway loop bug that should be guarded against in the consolidation logic.
- **Commit messages inherited raw checklist syntax (`- [ ]`)** — task descriptions should be sanitised before being used as commit messages to avoid polluting git history.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content**: `printf 'ONYX is running.'` reliably writes content without a trailing newline; `echo` appends one by default and caused repeated acceptance failures.
- **Chained shell commands (`&&`) caused unexpected exit code 1 failures**: Running `pwd` or `touch` in isolation succeeded where chained commands failed, suggesting the shell executor does not support command chaining reliably.
- **Byte-level verification (`xxd`) is the right tool for strict content checks**: Using `xxd` alongside `cat` caught hidden characters and newline issues that string comparison alone might miss.
- **Acceptance criteria failures triggered wasteful replan loops**: Three separate blocked cycles occurred before the file was written correctly; earlier byte-level verification would have short-circuited the replanning.
- **The `repo_path` config must be valid before execution**: All shell tool failures in the 19:31 run appear rooted in an inaccessible working directory, confirming that environment prerequisites must be validated before a phase is started.
- **Consolidation ran excessively after phase completion**: `consolidate_done` fired 13 times in a single run, indicating a loop bug in the post-completion consolidation step that should be investigated and capped.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content** — `printf 'ONYX is running.' > hello.txt` reliably avoids trailing newlines; `echo` appends one by default.
- **Chained shell commands caused repeated failures** — commands like `pwd && ls -la` exited with code 1 in this environment; run each command as a single, unchained call.
- **Byte-level verification catches hidden characters early** — using `xxd` to inspect file content prevented silent mismatches that would have failed acceptance criteria later.
- **Acceptance criteria failures triggered costly replan loops** — two full replan cycles were consumed before the root cause (shell command chaining) was identified; diagnose the environment first before retrying task logic.
- **Verify write permissions before attempting file creation** — an early `touch test_write.tmp` probe would have surfaced the environment issue immediately rather than after multiple blocked runs.
- **Commit messages should not contain raw checklist syntax** — task descriptions (`- [ ] ...`) leaked into commit messages; sanitise or summarise before committing.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content**: `printf 'ONYX is running.' > hello.txt` reliably avoids trailing newlines; `echo` appends one by default and caused repeated acceptance failures.
- **Chained shell commands (`&&`) can silently fail**: Several tasks blocked with exit code 1 when commands were chained; running single, isolated commands proved more reliable for diagnosing and executing in this environment.
- **Byte-level verification catches hidden characters early**: Using `xxd` to inspect file content is a strong pattern for strict-match acceptance criteria — adopt this as a standard verification step for file content tasks.
- **Acceptance criteria failures should trigger environment diagnosis first**: Multiple replans were wasted re-attempting the same write approach; checking write permissions and working directory *before* the primary task would have shortened the failure loop.
- **Repeated `consolidate_done` events suggest a runaway loop**: The consolidation step fired 11 times in succession, indicating a loop bug that should be investigated and guarded against in the consolidation logic.
- **Commit messages should not contain raw checklist syntax**: The phase review flagged `- [ ]` appearing in commit messages — task descriptions must be sanitised before use in git commits.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content** — `printf 'ONYX is running.'` reliably omits trailing newlines, whereas `echo` appends one by default; this distinction matters when acceptance criteria require byte-exact output.
- **Acceptance criteria failures triggered repeated replan cycles** — the phase blocked and replanned at least three times before succeeding, suggesting acceptance verification logic was not correctly reading or locating the file produced by earlier runs.
- **`pwd` and chained commands failed intermittently with exit code 1** — certain shell commands or command chains were unreliable in this environment; isolating commands (no `&&` chaining) proved more stable.
- **Environment assumptions should be validated before task execution** — the `repo_path` configuration dependency was a silent prerequisite; early environment probing (write-permission checks, directory confirmation) would have surfaced misconfiguration faster.
- **Consolidation ran redundantly in a tight loop** — `consolidate_done` fired ten times in rapid succession after phase completion, indicating a loop or retry bug in the post-phase consolidation step that should be guarded against.
- **Commit messages inherited raw checklist syntax** — task descriptions formatted as `- [ ] …` leaked directly into commit messages; a sanitisation step is needed before using task text in git metadata.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content** — `printf 'ONYX is running.'` reliably omits trailing newlines, whereas `echo` appends one by default; this distinction matters when acceptance criteria require byte-exact output.
- **Acceptance criteria failures can stem from environment issues, not logic errors** — multiple replans were triggered because the working directory or write permissions were misconfigured, not because the file-creation command was wrong; validating the environment first saves significant retry cycles.
- **Chained shell commands can mask individual failures** — `pwd && ls -la` style chains caused exit code 1 errors that blocked tasks; running commands individually makes failures easier to isolate and diagnose.
- **Byte-level verification (`xxd`) is a reliable acceptance check for exact-content files** — visual `cat` output can hide trailing newlines or hidden characters; `xxd` or a shell equality test (`[ "$(cat file)" = "expected" ]`) provides a definitive pass/fail signal.
- **Replanning without fixing the root cause loops indefinitely** — the phase hit its replan limit twice before the underlying environment problem was resolved; replans should begin with a root-cause hypothesis, not a repeat of the same tasks.
- **Commit messages should not contain raw checklist syntax** — task descriptions copied verbatim into commit messages (`- [ ] ...`) reduce readability; summaries should be written in plain prose before committing.
### Learnings from Example Phase

- **Use `printf` over `echo` for exact file content**: `printf 'ONYX is running.'` reliably omits trailing newlines, whereas `echo` appends one by default — critical when acceptance criteria require byte-exact output.
- **Acceptance criteria failures looped repeatedly despite correct shell execution**: The phase blocked multiple times even after the file was correctly created, suggesting the acceptance-check mechanism was reading from the wrong path or working directory — always confirm the target directory matches where the file was written.
- **Chained shell commands (`&&`) caused exit code 1 failures in some runs**: Simple commands like `pwd` failed when chained but succeeded alone; avoid command chaining when the environment's shell behaviour is uncertain.
- **Byte-level verification (`xxd`) is a reliable acceptance pattern**: Using `xxd` to inspect raw file content caught hidden characters and newline issues that `cat` alone would miss — include it as a standard verification step for exact-content tasks.
- **Replanning without diagnosing root cause wastes cycles**: The phase triggered multiple replans that repeated similar tasks without resolving the underlying directory/path mismatch; a single diagnostic step confirming the repo path early would have short-circuited the loop.
- **Commit messages inherited raw checklist syntax**: The final commit message contained `- [ ]` task syntax, indicating the commit step needs a cleanup or formatting pass before writing the message.
### Learnings from Example Phase

- **`printf` is the correct tool for exact-content file creation** — `printf 'ONYX is running.' > hello.txt` reliably produces a file with no trailing newline, unlike `echo` which appends one by default.
- **Acceptance criteria failures can persist even after tasks report done** — the phase blocked twice with all tasks marked complete, indicating a disconnect between task execution and criteria verification that requires explicit shell-level validation (e.g. `[ "$(cat file)" = "expected" ] && echo PASS`).
- **Chained shell commands (`&&`) caused repeated exit-code-1 failures** — `pwd` alone succeeded but `pwd && ...` chains failed, suggesting the execution environment has restrictions on command chaining that must be accounted for in task design.
- **Byte-level verification (`xxd`) is a reliable pattern for exact-content checks** — using `xxd` to inspect hex output catches hidden characters, encoding issues, or unexpected newlines that `cat` alone may not surface.
- **Replanning consumed both allowed attempts without resolving the root cause** — the replan mechanism added more diagnostic tasks rather than fixing the underlying environment issue; diagnosing write permissions and shell constraints should be the first replan step, not a later one.
- **The phase ultimately succeeded when run in a fresh execution context** — the final run (`onyx-1774899169389`) completed the single task cleanly, implying earlier failures were environment- or session-specific rather than logic errors.
### Learnings from Example Phase

- **`printf` is the correct tool for exact-content file creation** — `printf 'ONYX is running.' > hello.txt` reliably produces a file with no trailing newline, unlike `echo` which appends one by default.
- **Acceptance criteria failures can persist even after tasks report done** — the phase blocked twice despite individual tasks completing, suggesting the acceptance check runs independently and must be explicitly satisfied, not just implied by task completion.
- **Chaining shell commands with `&&` can cause unexpected exit code 1 failures** — `pwd` alone succeeded in isolation but failed when chained; prefer single, unchained commands when diagnosing environment issues.
- **Environment/path misconfiguration was the root blocker** — early runs failed because `repo_path` or working directory context was not correctly resolved; verifying the target directory before any write operation would have saved multiple replan cycles.
- **Replanning consumed the full budget before resolving the core issue** — two separate runs each exhausted their replan limits (2/2) without succeeding; a faster diagnostic step (write-permission check first) would reduce wasted cycles.
- **Byte-level verification with `xxd` is a reliable acceptance pattern** — using `xxd` to inspect file content catches hidden characters and newline issues that `cat` alone may not surface visually.
### Learnings from Example Phase

- **`printf` is the correct tool for no-newline file creation** — `printf 'text' > file.txt` reliably avoids trailing newlines; avoid `echo` which appends a newline by default.
- **Acceptance criteria verification must be explicit and tool-confirmed** — the phase blocked repeatedly because tasks completed without the agent actually confirming output against criteria; a shell-level assertion (`[ "$(cat file)" = "expected" ] && echo PASS`) should be standard practice.
- **Command chaining (`&&`) caused unexpected exit-code failures** — `pwd` alone failed when chained but succeeded in isolation; keep diagnostic commands as single, unchained calls to avoid masking the real failure source.
- **Replanning without fixing the root cause wastes cycles** — two full replan rounds were exhausted before the environment issue was resolved; diagnose write-permission and shell-access problems before retrying file-creation tasks.
- **Byte-level verification (`xxd`) is a useful but late-stage check** — adding `xxd` verification earlier in the task sequence would have caught content mismatches before acceptance criteria were evaluated.
- **Commit messages should not contain raw checklist syntax** — task descriptions copied verbatim into commit messages (`- [ ] ...`) degrade repo history readability; commit messages need a cleanup step before finalisation.
### Learnings from Example Phase

- **`printf` is the correct tool for no-newline file creation** — `printf 'text' > file.txt` reliably avoids trailing newlines; `echo` should not be used when exact byte content is required.
- **Acceptance criteria were repeatedly marked unmet despite tasks completing** — the agent successfully executed file creation multiple times but failed verification checks, suggesting the acceptance check was reading from the wrong directory or a stale state.
- **`pwd` and chained commands (`&&`) caused exit code 1 failures in some run contexts** — certain shell commands or command chains are unreliable in this execution environment; simple, unchained commands are safer.
- **Replanning without diagnosing root cause wastes cycles** — the phase triggered multiple replans that repeated the same steps rather than investigating *why* acceptance criteria were failing, delaying resolution significantly.
- **Environment/path misconfiguration is the most likely culprit for persistent acceptance failures** — the phase only succeeded after a fresh run (`onyx-1774899169389`), implying `repo_path` or working directory context was incorrect in earlier runs.
- **Commit messages should not contain raw checklist syntax** — task descriptions used as commit messages carry `- [ ]` markers; a cleanup or formatting step should be applied before committing.
### Learnings from Example Phase

- **`printf` is the correct tool for no-newline file creation** — `printf 'text' > file.txt` reliably avoids trailing newlines; `echo` should not be used when exact byte content is required.
- **Acceptance criteria failures were caused by environment/path issues, not task logic** — multiple `phase_blocked` cycles occurred because the agent couldn't confirm the working directory or write target, not because the file content was wrong.
- **`pwd` as a standalone command failed repeatedly in some run contexts** — chained commands like `pwd && ls` also failed; simpler commands like `echo "shell ok"` succeeded, suggesting a shell execution constraint that should be diagnosed before relying on diagnostic tasks.
- **Replanning without resolving the root cause wastes cycles** — the phase blocked and replanned 4+ times with structurally similar task lists; earlier escalation or environment validation would have shortened the loop significantly.
- **Byte-level verification with `xxd` is a reliable acceptance pattern** — using `xxd` alongside a shell equality check (`[ "$(cat file)" = "expected" ]`) provides strong confidence in exact file content.
- **A fresh run (`onyx-1774899169389-18f39b`) succeeded where prior runs failed** — this suggests the environment state or `repo_path` configuration was the blocking variable, and confirming that config before execution would prevent most of the observed failures.
### Learnings from Example Phase

- **`printf` is the correct tool for no-newline file creation** — `printf 'text' > file.txt` reliably avoids trailing newlines; `echo` should not be used when exact byte content is required.
- **Acceptance criteria verification must check the actual repo path** — multiple blocked cycles occurred because the agent was writing files to the wrong working directory; always confirm `repo_path` resolves correctly before executing write tasks.
- **Command chaining (`&&`) caused repeated exit-code-1 failures** — issuing commands individually rather than chained resolved the blocking pattern; avoid multi-command chains when the environment's shell behaviour is uncertain.
- **Replanning without diagnosing root cause wastes cycles** — the agent replanned twice with structurally similar task lists before the underlying path/permission issue was identified; replan tasks should explicitly target the diagnosed failure mode.
- **Byte-level verification (`xxd`) is a reliable acceptance check** — using `xxd` to inspect file content caught hidden characters and confirmed exact byte output, making it a reusable pattern for strict content-equality requirements.
- **A passing shell `echo` test does not guarantee write access** — `echo "shell ok"` succeeded while `pwd` and file writes failed, showing that basic shell access and working-directory write permissions must be tested independently.
### Learnings from Example Phase

- **`printf` is the correct tool for no-newline file creation** — `echo` appends a trailing newline by default; always use `printf 'content' > file.txt` when exact byte content is required.
- **Acceptance criteria failures were caused by an incorrect `repo_path`, not bad commands** — the agent repeatedly produced correct output but wrote files to the wrong directory; verifying the target path before execution would have resolved this in the first run.
- **`pwd` as a standalone command failed consistently in some run contexts** — certain shell execution environments block or exit on specific builtins; test environment viability with a simple `echo` before relying on diagnostic commands.
- **Replanning without fixing the root cause wastes cycles** — two full replan sequences were exhausted before the underlying path misconfiguration was addressed; blockers should trigger environment diagnosis, not just task reformulation.
- **Byte-level verification with `xxd` is a reliable acceptance pattern for exact-content files** — pairing `cat` output checks with `xxd` hex inspection catches hidden characters and trailing newlines that string comparison alone may miss.
- **Commit messages should not contain raw checklist syntax** — task descriptions used as commit messages carry `- [ ]` markers into version history; a cleanup step or summary template should be applied before committing.
### Learnings from Example Phase

- **`printf` is the correct tool for no-newline file creation** — `echo` appends a trailing newline by default; always use `printf 'text' > file.txt` when exact byte content is required.
- **Acceptance criteria verification must be tied to the actual repo path** — multiple runs completed tasks successfully in the wrong directory, causing repeated `phase_blocked` events despite correct file content.
- **Command chaining (`&&`) can mask exit codes and cause false failures** — `pwd` alone failed with exit code 1 when chained, but succeeded in isolation; keep diagnostic commands atomic during debugging.
- **Replanning without fixing the root cause wastes replan budget** — two full replan cycles were consumed iterating on file-creation logic before the real issue (wrong working directory) was identified.
- **A write-permission probe early in execution saves significant time** — the environment's write access was only confirmed late; a single `touch test_write.tmp` at the start of any file-creation phase should be standard practice.
- **`xxd` byte-level verification is a reliable acceptance check** — using `xxd` to inspect raw hex output removes ambiguity about hidden characters or newlines and should be included in acceptance tasks for exact-content requirements.
## Key Decisions

(none yet)
