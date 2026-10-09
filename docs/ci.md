# Testing, code quality and deployment

Everything runs on the Mac that hosts progressx.ca: SonarQube in its own container, a self-hosted
GitHub Actions runner, and Ansible deploying to the same Docker Compose stack.

```
pull request -> Build images -> Tests -> SonarQube Quality Gate                       (all required to merge)
push to main -> Build images -> Tests -> SonarQube Quality Gate -> Publish images -> Deploy
```

## Images (GitHub Container Registry)

Each commit gets two images, built once by CI from the clean checkout (no env files, so nothing
secret can be inside them) and tagged with the commit sha:

- `ghcr.io/colebranston/progressx-app:<sha>` (the Next.js app, `progressx/dockerfile`)
- `ghcr.io/colebranston/progressx-search-backend:<sha>` (`data/search_backend/Dockerfile`)

The tests run against those exact images: the end-to-end suite starts the app image, and the
search-backend tests use the search-backend image. Only after the quality gate passes on `main` are
they pushed (plus a `:main` tag for the newest), and the deploy pulls and runs them by sha, so what
was tested is byte-for-byte what runs. Nothing is built on the server.

Solr, Redis, nginx and Ollama use upstream images from `docker-compose.yml` (Solr pinned to 10.0.0).
`docker compose up --build` in a working copy still builds the two images locally, as before.

- The packages are linked to this repository and start out with its visibility (public). They hold
  only what's already in the public repo, but they can be made private under GitHub > your profile >
  Packages > (package) > Package settings. CI and deploys log in with the job's own token either way.
- CI uses a temporary Docker login per job (`ci/docker-config.sh`), never your keychain.
- The deploy keeps the newest 3 releases' images on this machine for rollbacks; old versions in GHCR
  can be deleted from the package page.
- Deploying by hand: `docker login ghcr.io` (a personal token with `read:packages`) if the packages are
  private, then the playbook below.

## Test suites

| Suite | What it covers | Command |
| --- | --- | --- |
| Unit | Next.js libraries and components: ID document checks, ID encryption, sessions, diet assistant parsing, workout/diet maths, video checks, validation, components (Vitest + Testing Library) | `cd progressx && npm run test:unit` |
| Integration | API route handlers run for real (auth, validation, ownership) against an in-memory database; food search against a real Solr; `/api/search` through the real search backend + Redis | `npm run test:services` then `npm run test:integration` |
| Regression | One test per bug fixed in the past (`tests/regression`), plus screenshots of the public pages (`e2e/visual.spec.ts`) | `npm run test:regression`, `npx playwright test --project regression` |
| End-to-end | Production build in a real browser (desktop + phone): public pages, redirects, robots/sitemap, and the full signed-in journey (sign up, onboard, research search, ID gating, export, delete account) | `npm run test:e2e` (signed-in journey: `E2E_AUTH=1`) |
| Python | Search backend (unit + against real Solr/Redis), ingestion DAGs, food importer, Solr schema and ranking | `docker compose -f ci/test/docker-compose.yml run --rm python-tests` |

The integration, Python and end-to-end tests use throwaway services from `ci/test/docker-compose.yml`
(Solr on 8984, Redis on 6380, search backend on 8001) built from the committed Solr configs in
`data/db/configsets` and loaded with the made-up data in `ci/test/fixtures`. They never touch the live
Solr, Redis or search backend. Stop them with `npm run test:services:down`.

The signed-in end-to-end journey uses the real Supabase project: it creates a `zz-e2e-*@example.com`
account (no email is sent) and deletes it through the app's own "Delete account"; a teardown removes
any left behind. Turn it off in CI with the repository variable `E2E_AUTH=0`.

After an intended visual change to the login, terms or privacy pages, refresh the screenshots:
`npx playwright test --project regression --update-snapshots`.

## SonarQube

- Runs separately from the app: `docker compose -f ci/sonarqube/docker-compose.yml up -d`, at
  http://127.0.0.1:9000 (this machine only). Sign in as `admin` with the password in
  `~/.progressx/sonarqube-admin-password`.
- `bash ci/sonarqube/setup.sh` (re-runnable) sets the admin password, creates the projects, the
  quality gate and the CI token (`~/.progressx/sonar-token`, also the `SONAR_TOKEN` repository secret).
  `bash ci/sonarqube/api.sh GET <api path>` calls the API without putting the password on a command line.
- Projects: `progressx` (main) and `progressx-pr` (pull requests). The free Community Build can't
  analyse branches or PRs separately, so PRs get their own project instead of rewriting main's history.
- Quality gate "ProgressX", on the whole code base: security, reliability and maintainability ratings A
  (no vulnerabilities, no bugs), every security hotspot reviewed, at most 5% duplication, and coverage
  at least 20% (today's level). Raise the floor as tests are added: `COVERAGE_MIN=25 bash ci/sonarqube/setup.sh`.
- Scan locally after the tests: `SONAR_TOKEN=$(cat ~/.progressx/sonar-token) npx @sonar/scan`.

## GitHub Actions (`.github/workflows/ci.yml`)

- Runs on the self-hosted runner (labels `self-hosted, macOS, progressx`), installed as a launchd
  service by `ansible/runner.yml` in `~/actions-runner/progressx`.
- The repository is public, so code from forks must never run on this machine: fork PRs need a
  maintainer's approval to run any workflow (repository setting: all outside contributors), and the
  jobs refuse to run for them anyway. To take a fork's change, push it to a branch here.
- Branch protection on `main` requires the `Build images`, `Tests` and `SonarQube Quality Gate` checks
  for pull requests (all three, since GitHub counts a skipped required check as passed). Admins can still push directly (that push still runs CI, and deploys only if it passes).

## Deploying (`ansible/`)

- `ansible/deploy.yml` checks out the commit's config (compose file, nginx template) into
  `~/deploy/progressx` (never your working copy), installs the secrets from `~/.progressx/app` (mode
  600), points Solr at the live index in `data/db/var/solr` of the main checkout, pulls that commit's
  images from GHCR, restarts the Compose project `progressx` with them, and waits for the app, search
  backend, Solr and nginx to answer. If they don't, it switches back to the previous commit's images
  and fails.
- The Deploy job runs it after both checks pass on `main`, only while the repository variable
  `DEPLOY_ENABLED` is `true`: `gh variable set DEPLOY_ENABLED --body true`.
- Secrets: `ansible-playbook -i ansible/inventory.yml ansible/setup-secrets.yml -e source_dir=<checkout>`
  copies `.env`, `progressx/.env.local` and `nginx/solr-ingest.htpasswd` into `~/.progressx/app`.
  After changing a secret, update the copy there (`-e overwrite=true`), or the next deploy uses the old one.
- By hand: `cd ansible && ansible-playbook deploy.yml -e git_sha=$(git rev-parse origin/main)`; add
  `--check` for a dry run.

## CodeRabbit (AI review)

The CodeRabbit GitHub App reviews every pull request into `main` for free (public repository):
a summary, line comments, and its own linters (ESLint, Ruff, ShellCheck, Hadolint, actionlint, zizmor,
gitleaks, TruffleHog). `.coderabbit.yaml` tells it what matters here: user scoping in API routes, the
ID verification and its encryption, sessions, accessibility, Solr input, and the self-hosted CI/deploy.
It's advisory, not a required check: the merge gate stays Build images / Tests / SonarQube. Talk to
it in a PR comment with `@coderabbitai` (e.g. `@coderabbitai review`, or ask why it flagged something).
It runs on CodeRabbit's servers, never on the self-hosted runner, so fork PRs get reviewed safely too.
