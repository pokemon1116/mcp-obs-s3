# Contributing to mcp-obs-s3

Thanks for contributing to the MCP Server for Huawei Cloud OBS! This document explains the
review and merge process — modeled after [openai/codex](https://github.com/openai/codex).

## Roles

| Role | Members |
|------|---------|
| **Maintainer** | `@trublion1116` |
| **Committer** | `@trublion1116`, `@Q-Bug4` |

- **Committers** open pull requests and review changes.
- **Maintainers** hold the final merge decision. Source code (`/src/`) is owned by the
  maintainer, so any source change requires maintainer approval.

Ownership per path is declared in [`.github/CODEOWNERS`](.github/CODEOWNERS) and enforced by
the [branch protection rules](docs/branch-protection.md).

## How to contribute

1. **Open an issue** first for bugs or feature requests (use the issue templates) so the change
   can be discussed before you write code.
2. Create a branch from `main`, keep changes focused.
3. Make sure it builds: `npm ci && npm run build`.
4. Open a pull request — fill in the PR template and the self-check list.
5. **Never hard-code credentials.** OBS AK/SK must come from environment variables only; ensure
   logs and error messages never leak secrets.
6. Request review. The required Code Owner review is enforced automatically per `CODEOWNERS`.

## What happens on a pull request

- **CI** (`ci / build`) runs `npm ci` + `tsc` on every PR and on `main`. It must pass.
- **AI Code Review (Zhipu GLM)** runs automatically and posts a review comment. It is advisory —
  it does not block the merge unless you add it as a required status check.
- Pushing new commits re-runs the review automatically. You can also comment `/glm-review`
  (or `@zhipu`) on the PR to re-review on demand — only maintainers/committers can trigger it.
- A **Code Owner** approval is required before merging (see `CODEOWNERS`).

## Commit style

- Use **squash merge** (enforced) to keep a linear history.
- Conventional commit prefixes are appreciated: `feat:`, `fix:`, `chore(deps):`, `docs:`, etc.

## Reporting security issues

Do **not** open a public issue for security problems. Rotate any exposed credentials
(AK/SK) immediately and contact a maintainer privately.
