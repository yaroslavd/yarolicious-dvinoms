# Environment & CI/CD Pipeline

## Four-Stage Branch Model

| Branch  | Environment        | Purpose                           | Deploy Gate          |
| ------- | ------------------ | --------------------------------- | -------------------- |
| (any branch) | Alpha (personal sandbox) | Feature dev on any branch  | CI only (no deploy)  |
| `beta`  | Beta               | Stable personal testing           | CI passes → auto-deploy |
| `gamma` | Gamma              | Friends & family preview          | CI passes + manual approval |
| `main`  | Production         | Public release                    | CI passes + manual approval |

Every push to any branch triggers the **Alpha** workflow (typecheck, unit tests, lint).
Merging into `beta`, `gamma`, or `main` triggers progressively stricter pipelines.

## CI Quality Gates

All pipelines run:
- `pnpm install --frozen-lockfile`
- TypeScript typecheck (`pnpm run typecheck`)
- Unit tests (`pnpm run test`)
- Lint (`pnpm exec prettier --check`)

Beta, Gamma, and Production additionally run:
- Playwright e2e tests (`pnpm run test:e2e`)

## GitHub Secrets to Configure

Go to **Settings → Secrets and variables → Actions → Repository secrets** and add:

| Secret Name                | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `REPLIT_BETA_DEPLOY_HOOK`  | Webhook URL that triggers a Replit deployment to the beta environment |
| `REPLIT_GAMMA_DEPLOY_HOOK` | Webhook URL that triggers a Replit deployment to the gamma environment |
| `REPLIT_PROD_DEPLOY_HOOK`  | Webhook URL that triggers a Replit deployment to the production environment |

Also add **repository variables** (Settings → Secrets and variables → Actions → Variables).
These are required for e2e tests to run against the correct environment:

| Variable Name    | Description                                              |
| ---------------- | -------------------------------------------------------- |
| `BETA_APP_URL`   | Base URL of the beta app (used by Playwright e2e tests)  |
| `GAMMA_APP_URL`  | Base URL of the gamma app (used by Playwright e2e tests) |
| `PROD_APP_URL`   | Base URL of the prod app (used by Playwright e2e tests)  |

## Setting Up GitHub Environments

Gamma and Production deployments require **manual approval** via GitHub Environments.

### Gamma Environment

1. Go to **Settings → Environments → New environment**
2. Name it `gamma`
3. Check **Required reviewers** and add one or more team members
4. Under **Deployment branches and tags**, select **Selected branches** and add `gamma`
5. Click **Save protection rules**

### Production Environment

1. Go to **Settings → Environments → New environment**
2. Name it `production`
3. Check **Required reviewers** and add one or more team leads / stakeholders
4. Under **Deployment branches and tags**, select **Selected branches** and add `main`
5. Click **Save protection rules**

## Branch Protection Rules

For each of the main branches, configure protection rules under **Settings → Branches → Add branch protection rule**:

### `beta` branch
- **Require a pull request before merging**: Recommended but optional
- **Require status checks to pass before merging**: Enable and add the `ci` job from the Alpha workflow
- **Do not allow bypassing the above settings**: Recommended

### `gamma` branch
- **Require a pull request before merging**: Yes
- **Require status checks to pass before merging**: Enable and add the `ci` job from the Alpha workflow
- **Require approvals**: At least 1 reviewer
- **Do not allow bypassing the above settings**: Recommended

### `main` branch
- **Require a pull request before merging**: Yes
- **Require status checks to pass before merging**: Enable and add the `ci` job from the Alpha workflow
- **Require approvals**: At least 1-2 reviewers
- **Do not allow bypassing the above settings**: Yes
- **Restrict who can push**: Only release managers

## Docker

A `Dockerfile` is provided for the API server at `artifacts/api-server/Dockerfile`.
A `docker-compose.yml` at the repo root brings up both the API server and recipe-agent frontend for local dev or staging use:

```bash
docker compose up --build
```

The API server will be available at `http://localhost:3000` and the frontend at `http://localhost:5173`.
