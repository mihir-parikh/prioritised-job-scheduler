# Prioritised Job Scheduler

A lightweight TypeScript library for scheduling work against a rate-limited downstream
service. Callers submit `Job`s with a priority; the scheduler guarantees high-priority
jobs start before lower-priority ones, and never runs more than 10 jobs concurrently.

The library owns scheduling and queueing only — it has no idea what a job actually
*does*. Execution logic is supplied by the caller via a `JobExecutor`.

## Features

- **Prioritisation** — `High` / `Medium` / `Low` priority jobs, with strict priority
  ordering and FIFO ordering within the same priority level.
- **Concurrency control** — never more than 10 jobs execute at once, regardless of how
  many are submitted.
- **No execution logic** — the scheduler only calls `executor.execute()` and waits for
  it to settle; what that does (an HTTP call, a DB write, anything) is entirely up to
  the caller.

## Usage

```ts
import { Scheduler } from "./src/Scheduler.js";
import { Job, JobPriority, JobExecutor } from "./src/types.js";

const scheduler = new Scheduler();

const checkoutExecutor: JobExecutor = {
  execute: () => paymentGateway.checkout(orderId),
};

const syncProfileExecutor: JobExecutor = {
  execute: () => paymentGateway.syncProfile(userId),
};

const checkoutJob: Job = { priority: JobPriority.HIGH, executor: checkoutExecutor };
const syncProfileJob: Job = { priority: JobPriority.LOW, executor: syncProfileExecutor };

// submit() returns a promise that resolves/rejects with that specific job's outcome.
await scheduler.submit(checkoutJob);
scheduler.submit(syncProfileJob).catch((err) => console.error("sync failed", err));
```

If the system is busy, `checkoutJob` (High) will always be started before
`syncProfileJob` (Low), and at most 10 jobs will be active across all callers at once.

## API

- `enum JobPriority { LOW, MEDIUM, HIGH }`
- `interface JobExecutor { execute(): Promise<void> }` — implemented by the caller.
- `interface Job { priority: JobPriority; executor: JobExecutor }`
- `class Scheduler { submit(job: Job): Promise<void> }`

## Development

Requires Docker.

```bash
docker compose build          # build the dev image
docker compose up             # run tests in watch mode, live-reloading on file changes
docker compose run --rm scheduler-test npm test   # run the test suite once
```

Other scripts (run via `npm run <script>` inside the container, or `docker compose run --rm scheduler-test npm run <script>`):

- `typecheck` — type-check without emitting JS
- `build` — compile to `dist/`

## Design notes

- No persistence — job state lives in memory only. Nothing in the requirements calls
  for surviving a process restart, so a database would be unnecessary complexity.
- No external queue infrastructure (e.g. Redis/BullMQ) — the whole scheduler runs
  in-process, so a plain in-memory queue is sufficient; there's no distributed or
  multi-process use case here.
- Priority is implemented as three FIFO buckets (`High`/`Medium`/`Low`) rather than a
  general-purpose priority heap — simpler, and gives correct FIFO-within-priority
  ordering for free.
