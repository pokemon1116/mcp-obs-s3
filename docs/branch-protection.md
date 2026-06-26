# Branch Protection & Merge Policy

Branch protection rules are **not** configurable via a file in `.github/` — they live in the
repository settings on GitHub. This document is the single source of truth for the intended
rules. Apply them via **one** of:

- **Recommended (file-driven):** install the [probot-settings](https://github.com/repository-settings/app)
  app, then `.github/settings.yml` is applied automatically on push.
- **Manual:** follow the steps below in the GitHub UI.
- **CLI:** with `gh` installed and authenticated, run the command at the end of this doc.

## Roles

| Role | Members | Can do |
|------|---------|--------|
| **Maintainer** | `@trublion1116` | Final merge decision; approves source changes |
| **Committer** | `@trublion1116`, `@Q-Bug4` | Open PRs; review changes |

The committer/maintainer split is enforced through [`CODEOWNERS`](../.github/CODEOWNERS) +
branch protection:

- `/src/` is owned **only** by `@trublion1116` (maintainer) → every source change requires
  maintainer approval before it can merge.
- `/.github/`, `/docs/`, `/README.md`, `/CONTRIBUTING.md` are owned by **both** committers →
  governance changes need both to be aware.
- Anything else falls back to `*` (both committers).

## Rules to enable on `main`

GitHub → **Settings → Branches → Branch protection rules → Add rule**, branch name `main`:

1. **Require a pull request before merging**
   - Required approving reviews: **1**
   - Dismiss stale pull request approvals when new commits are pushed: ✅
   - **Require review from Code Owners**: ✅ _(this is what makes CODEOWNERS enforceable)_
2. **Require status checks to pass before merging**
   - Require branches to be up to date before merging: ✅
   - Status checks: `ci / build`
   - _(Optional)_ `AI Code Review (Zhipu GLM) / glm-review` — only if you want AI review to be a hard gate
3. **Require linear history**: ✅
4. **Do not allow force pushes**, **do not allow deletions**.
5. **Do not enable "Restrict who can push"** — it requires a private repo or paid plan. The
   committer/maintainer split is already enforced via CODEOWNERS + required code-owner reviews.

## One-shot via `gh` CLI (optional)

```bash
gh api -X PUT repos/pokemon1116/mcp-obs-s3/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks[strict]=true \
  -f required_status_checks[checks][][context]="ci / build" \
  -f required_pull_request_reviews[required_approving_review_count]=1 \
  -f required_pull_request_reviews[dismiss_stale_reviews]=true \
  -f required_pull_request_reviews[require_code_owner_reviews]=true \
  -f enforce_admins=false \
  -f restrictions= \
  -f required_linear_history=true \
  -f allow_force_pushes=false \
  -f allow_deletions=false
```

> The exact status-check context name (`ci / build`) must match what GitHub Actions reports.
> After the first CI run, verify it in **Settings → Branches** and adjust if it differs.

## Prerequisites

- **AI review** needs `ZHIPUAI_API_KEY` in
  **Settings → Secrets and variables → Actions** (a Zhipu API key from open.bigmodel.cn).
  Optionally set `ZHIPU_MODEL` (default `glm-4.6`) under **Settings → Secrets and variables → Variables**.
  Without the key, the `AI Code Review (Zhipu GLM)` workflow will skip; `ci / build` still gates merges.
