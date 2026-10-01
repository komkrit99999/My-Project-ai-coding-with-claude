# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Teaching example for the CodePassion "AI Coding with Claude" course (Bangkok flood app, Thai-language docs). Station data is fictional; it is not an official flood warning service.

## Commands

Node >= 22, TypeScript run directly with `tsx` (no build step).

```bash
npm test                                      # vitest run (all tests)
npx vitest run tests/app.test.ts              # one file
npx vitest run -t "ignores readings after now" # one test by name
npm run lint                                  # tsc --noEmit (the only linter; strict + noUncheckedIndexedAccess)
npm run dev                                   # tsx watch, http://localhost:3000
```

`npm test` and `npm run lint` must both pass after every change. Imports use explicit `.ts` extensions (`allowImportingTsExtensions`).

## Architecture

- `src/app.ts` — `handle(method, path, body, ctx)` is the whole router. It is pure (no `node:http`), returns `{ status, body }`, and is what tests call directly.
- `src/server.ts` — thin I/O shell: reads the body, parses JSON, calls `handle`, writes JSON. Holds anything that must live for the process (stores, rate limiter). It has no tests.
- **Clock and state are injected through `Context`** (`now`, `reports`, later `ip`/`limiter`). Only `server.ts` (and `handle`'s default arg) calls `new Date()`; everything else takes `now`. Tests pass a fixed `now = 2026-09-30T12:30:00Z` and build a fresh `ReportStore` per test so state never leaks between tests.
- `src/stations.ts` reads `data/stations.json`; `latestReading` ignores readings after `now`. `src/time.ts` formats Bangkok time.

Conventions that span files:
- Depth/level values are **integer centimetres**.
- Times are stored as UTC `Date` and emitted as Bangkok ISO (`+07:00`) via `toBangkokIso`.
- Every response carries `NOTICE` (exported from `src/app.ts`); keep new response shapes additive.

## Flood-reports feature (in progress)

Built step by step from `docs/plans/flood-reports.md`, which implements `docs/specs/flood-reports.md` (RPT-REQ-001–014; the spec is the authority, `docs/intent/` explains why). Work test-first (red, then green), one plan step at a time, tick `[x]` on the step in the plan, then stop for the user.

- Do not edit existing tests in `tests/app.test.ts`; add new `describe` blocks.
- Do not touch `data/stations.json`, `src/stations.ts`, `src/districts.ts`.
- Never read `X-Forwarded-For`; client IP comes only from `req.socket.remoteAddress`.
- Do not store or log personal data (IP, phone); the store keeps only the fields listed in the spec.
- **Never send requests to `flood-api.rooptanjai.com`** (live map people rely on). All curl tests go to `localhost`.
- Some spec numbers have drifted from older drafts (e.g. report expiry is 3 hours, severity boundaries are 9/10/29/30/49/50); check the spec, not memory.

## Agent skills

### Issue tracker

Issues are tracked in this repo's GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.
