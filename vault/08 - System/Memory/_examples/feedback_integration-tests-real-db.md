---
name: Integration tests must hit a real database
description: For this codebase's integration tests, never mock the database — always run against a real Postgres test instance.
type: feedback
---

Integration tests in this codebase must hit a real database (the project's test Postgres instance, set up via `make test-db`). Mock databases are forbidden for integration-level tests; unit tests can mock anything they want.

**Why.** A prior incident: a passing integration test against a mocked database masked a broken migration. The mock didn't enforce the foreign-key constraint that production did, so the test passed and the deploy failed. The user spent half a day rolling back. Mocked tests feel cheaper but they let real schema-level bugs through.

**How to apply.** When writing or reviewing integration tests, check for `mock` / `stub` / `Fake<...>` against any database client. If you find one, replace it with a real-DB test fixture — the codebase's `testdb` package handles setup/teardown.
