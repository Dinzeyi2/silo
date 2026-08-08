# SILO

SILO is a multi-user, multi-agent software workspace. Each member is assigned a specialist role and every generated change is checked against that role's filesystem boundary before it can be applied. The backend persists projects, members, task proposals, generated files, and activity events in SQLite.

## What is implemented

- Adaptive project analysis that selects a language, libraries, security controls, coding style, and an honest code-size range from the product mission.
- Six restricted specialists: database, auth/security, frontend, infrastructure, intelligence/robotics, and billing.
- AI architecture planning before code generation: one versioned registry defines each specialist's private brief, shared schemas/protocols, invariants, build order, and whole-product acceptance criteria.
- Bearer-token project membership with strict role routing.
- Propose/review/apply code workflow with transactional file persistence and boundary enforcement.
- GitHub Git Data API publishing, creating blobs, a tree, a commit, and an atomic branch update.
- Required OpenAI-compatible specialist model orchestration with strict system prompts and output boundary validation. SILO never substitutes canned templates when model credentials are missing; readiness fails and generation returns `AI_NOT_CONFIGURED`.
- Authenticated Server-Sent Events for live member, task, conflict, stack, sandbox, and publish activity.
- Contract-aware War Rooms that open when two domains propose incompatible versions and accept human votes/resolutions.
- Hot-swappable domain stacks that automatically create a scoped migration task and preserve public contracts.
- Docker sandbox test runs with no network, dropped Linux capabilities, a non-root user, CPU/memory/PID limits, output caps, and hard timeouts.
- OIDC identity verification using discovery, cached JWKS, asymmetric signatures, issuer, audience, expiry, and not-before validation.
- Durable leased jobs with retries, exponential backoff, crashed-worker lease recovery, and separately scalable `npm run worker` processes.
- Optional Redis/Redis-TLS event fan-out so connected users receive the same project events across API instances.
- Live npm, PyPI, and crates.io dependency research supplied to coding agents with short-lived caching.
- Prometheus-compatible `/api/metrics`, health probes, security headers, structured worker logs, and external load/security suites.
- Durable specialist conversations, compacted project memory, automatic build checkpoints, code search, checkpoint restore, cancellable queued jobs, and continuation builds that resume from existing files rather than starting over.
- Bounded autonomous repository inspection: specialists receive a complete file manifest and can repeatedly search or read files inside their own domain before returning edits; attempts to inspect another domain are rejected by the same boundary engine.
- Private implementation, shared contracts: each provider payload contains only that specialist's owned files plus the complete sanitized integration-contract registry. Agents understand how their component must interoperate without reading or modifying another role's implementation.
- Real Git coding engine: every specialist works in an isolated `git worktree` and branch, produces a reviewable diff and commit, then merges through Git with conflict detection.
- Model-driven terminal tools with shell-free argument execution, executable allowlists, command classification, human approval inputs, timeouts, and bounded output.
- Continuous build mode that merges specialist commits, executes the selected acceptance-test command, sends failures back to every owning specialist, and repeats through bounded repair rounds.
- JSON APIs for projects, members, tasks, files, events, available domains, health, and publishing.

## Run locally

```bash
npm start
```

Open <http://localhost:4173>.

Data is stored in `data/silo.db`. Set `SILO_DATABASE=:memory:` for an ephemeral instance or provide another path.

Copy `.env.example` into Railway variables and connect OpenAI-compatible planning and coding models. Configure `SILO_PLANNER_BASE_URL`, `SILO_PLANNER_API_KEY`, and `SILO_PLANNER_MODEL`; the planner may use the same endpoint as `SILO_AI_*`. Model output is treated as untrusted: plans are schema-validated and every returned path is checked again by the boundary engine before a task is persisted or applied.

## Railway

1. Deploy this repository as the API service; `railway.toml` builds the Dockerfile and checks `/api/ready`.
2. Attach a persistent volume at `/app/data` and set `SILO_DATABASE=/app/data/silo.db`.
3. Add a second service from the same repository with start command `npm run worker` and the same `SILO_API_URL`, `SILO_WORKER_SECRET`, and model variables. Do not attach the database volume to the worker.
4. Add Railway Redis and set `SILO_REDIS_URL` when scaling realtime connections.
5. Set OIDC variables for production user identities and add the provider and GitHub secrets through Railway variables, never source control.

The readiness endpoint deliberately returns HTTP 503 until the coding model is configured. `/api/health` remains a process-liveness endpoint.

### Specialist provider isolation

Configure `SILO_AI_<DOMAIN>_BASE_URL`, `SILO_AI_<DOMAIN>_API_KEY`, and `SILO_AI_<DOMAIN>_MODEL` for any of `DATABASE`, `AUTH`, `FRONTEND`, `INFRASTRUCTURE`, `INTELLIGENCE`, and `BILLING` that should use a dedicated provider. SILO filters the repository before constructing the request, so an auth provider never receives database implementation files and a database provider never receives auth implementation files. Shared integration occurs through the versioned architecture-contract registry. This is strict role isolation, not a cryptographic zero-knowledge claim.

Set `SILO_OIDC_ISSUER` and `SILO_OIDC_AUDIENCE` to enable identity-provider JWT validation. Project invitations may bind a member to the provider's immutable `sub` claim. Legacy project tokens remain available for local development and are stored only as SHA-256 digests.

## Core API flow

1. `POST /api/projects` with `{ "mission": "...", "ownerRole": "database" }`.
2. Use the returned credential as `Authorization: Bearer <token>`.
3. `POST /api/projects/:id/members` to create one role-scoped teammate credential.
4. `POST /api/projects/:id/builds` to turn the description into a coordinated six-specialist whole-project build, or `POST /api/projects/:id/tasks` for work inside one member's domain.
5. `GET /api/projects/:id/architectures` to inspect the exact versioned domain briefs and integration contracts used by the latest build.
6. `POST /api/projects/:id/tasks/:taskId/apply` to transactionally apply reviewed changes.
7. `POST /api/projects/:id/publish` with a GitHub token, owner, repository, and branch.

Additional collaboration APIs:

- `GET /api/projects/:id/stream?access_token=...` opens the live SSE channel.
- `GET /api/projects/:id/war-rooms` lists cross-agent contract conflicts.
- `POST /api/projects/:id/war-rooms/:roomId/vote` and `/resolve` provide human governance.
- `POST /api/projects/:id/stacks/:domain/swap` creates a sealed migration proposal.
- `POST /api/projects/:id/runs` executes the applied workspace using the allowlisted `node`, `python`, `rust`, or `go` test runner.
- `GET /api/projects/:id/jobs/:jobId` observes queued agent or sandbox work.
- `POST /api/projects/:id/jobs/:jobId/cancel` cancels queued or leased work.
- `GET|POST /api/projects/:id/conversations` and `POST /conversations/:id/message` preserve long-running specialist context.
- `POST /api/projects/:id/builds/:buildId/continue` resumes a previous build with its current files and durable memory.
- `GET /api/projects/:id/checkpoints` and `POST /checkpoints/:id/restore` provide project rollback.
- `GET /api/projects/:id/files?search=query` performs repository-wide code search.
- `GET /api/projects/:id/files?ecosystem=npm&research=query` performs live dependency research.
- `GET /api/metrics` exposes Prometheus metrics.

Start any number of dedicated workers with `npm run worker`. They use authenticated leases rather than holding public project credentials. For GitHub review workflows, publish with a distinct `branch`, `baseBranch`, and `pullRequest` object; SILO creates the branch, commit, and pull request without force-pushing.

The whole-project orchestrator first asks the planning model for domain briefs and explicit cross-domain contracts, validates them, and persists the architecture version. It then delegates in the planned dependency order. Every specialist receives its own brief, its own implementation files, and the shared contracts; every result is independently boundary-checked, persisted as a reviewable task, and applied transactionally. Later conversations, role tasks, stack swaps, repair loops, and continuation builds reuse the latest architecture so agents do not lose the product context. With `runTests: true`, a sandbox test loop sends failures back to every owning specialist for bounded repairs before marking the build `ready` or `needs_review`.

Build requests may include `repositoryUrl` and `baseRef` to clone and modify an existing Git repository. The coding engine creates a separate branch/worktree for every specialist, commits its changes, captures the diff, merges into the integration branch, runs tests, and repeats repairs. Potentially destructive or dependency-mutating commands return an approval requirement unless the project owner explicitly includes the exact `{ domain, executable, args }` tuple in `approvedCommands`. `SILO_MAX_TOOL_ROUNDS` bounds model/tool iteration. Keep dependency and network mutation disabled on the public API; enable it only on a dedicated isolated worker.

`deploy/kubernetes.yaml` intentionally runs one API writer because the bundled durable store is SQLite, while agent workers scale independently. Redis event fan-out is already supported for a multi-instance API topology; before increasing API replicas, replace the store with a transactional PostgreSQL implementation rather than placing SQLite on shared network storage. Sandbox workers must run on dedicated Docker-capable hosts or be replaced with your cluster's ephemeral-job adapter.

## Container deployment

```bash
docker build -t silo .
docker run --env-file .env -p 4173:4173 -v silo-data:/app/data silo
```

The API container should **not** receive a Docker socket in a public deployment. Route sandbox requests to dedicated ephemeral workers (Kubernetes Jobs, Firecracker, gVisor, or a similarly isolated runtime). The included Docker runner defines the security and resource policy and is suitable for a dedicated worker host, but mounting a host Docker socket into the public API would defeat that isolation.

Run black-box checks against a deployed environment with `node scripts/security-test.mjs` and `node scripts/load-test.mjs`. Configure `SILO_TARGET`, `CONCURRENCY`, and `DURATION_SECONDS` for the target environment.

GitHub credentials are accepted only for the publish request and are never stored. In a public deployment, put SILO behind TLS and replace the returned development credentials with short-lived identity-provider sessions stored in a secret manager. Use a managed database or a single persistent SQLite writer, rate limiting at the ingress, centralized logs, backups, and separately autoscaled sandbox workers.

## Test

```bash
npm test
```
