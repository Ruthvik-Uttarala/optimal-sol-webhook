# ParkingSol MVP

ParkingSol is a parking operations intelligence layer that ingests parking events, evaluates paid/unpaid/exempt decisions, creates violations and notifications, and powers an operator/admin dashboard.

## Stack

- Frontend: Vite + React + TypeScript (deployed on Vercel)
- Backend: Firebase Cloud Functions + Express + TypeScript
- Database: Firestore
- Auth: Firebase Authentication

## Repository layout

```text
apps/web        # Frontend app
functions       # Firebase backend
shared          # Shared types/constants/schemas
postman         # Postman collection + environment
docs            # Environment, secrets, baseline runbooks
```

## Required environment variables

### Frontend (`apps/web/.env`)

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_API_BASE_URL`
- `VITE_ENV_LABEL`

### Backend (`functions/.env.<project>` or environment)

- `FIREBASE_PROJECT_ID`
- `ENV_LABEL`
- `POSTMAN_CLIENT_SECRET`
- `INTERNAL_TEST_KEY`
- `DEFAULT_ORGANIZATION_ID`
- `DEFAULT_LOT_ID`
- `DEFAULT_DUPLICATE_WINDOW_SECONDS`
- `DEFAULT_GRACE_PERIOD_MINUTES`
- `TEST_DATA_RETENTION_DAYS`
- `ALLOW_TEST_HEADERS`

See [docs/SECRETS_MATRIX.md](docs/SECRETS_MATRIX.md) for ownership and rotation.

## Setup

1. Install Node `20.19.0` and npm `10.8.2`.
2. `npm install`
3. Copy templates:
   - `cp apps/web/.env.example apps/web/.env`
   - `cp functions/.env.example functions/.env.local`
4. Set local `POSTMAN_CLIENT_SECRET` and `INTERNAL_TEST_KEY` values.

## Local development

### Start emulators with deterministic baseline

- `npm run emu:start`

### Reset to baseline

- `npm run emu:reset`

### Refresh committed baseline (Auth + Firestore)

- `npm run emu:baseline:refresh`

### Start frontend

- `npm run dev --workspace apps/web`

## Seed data and support endpoints

Use authenticated admin/support headers and internal test key:

- `POST /api/v1/test/seed-payment`
- `POST /api/v1/test/seed-permit`
- `POST /api/v1/test/reset-lot`

## Tests

### Full local checks

- `npm run lint`
- `npm run typecheck`
- `npm run test` (includes security-rules gate)
- `npm run build`
- `npm run test:api` (or `npm run newman`)
- `npm run test:e2e`

### Rules tests (standalone)

- `npm run test:rules`

## Newman

- `npm run newman`

Postman assets:

- `postman/ParkingSol.postman_collection.json`
- `postman/ParkingSol.postman_environment.json`

## Deployment

### Firebase backend

- `npm run build --workspace functions`
- `firebase deploy --only functions,firestore:rules,firestore:indexes --project <dev|staging|prod alias>`

### Vercel frontend

- `npm run build --workspace apps/web`
- Import repo in Vercel and set root to repository root with `vercel.json`.
- Configure frontend env vars in Vercel environments (`development`, `preview`, `production`).

See [docs/ENVIRONMENT_MATRIX.md](docs/ENVIRONMENT_MATRIX.md) for promotion and rollback.

## Role source of truth

- Firestore `users` + `userLotAccess` is authoritative for authorization.
- Firebase custom claims are optional optimization metadata only.
- See `docs/RBAC_POLICY.md`.

## Test data cleanup policy

- Scheduled backend job deletes test artifacts in non-production using retention days (`TEST_DATA_RETENTION_DAYS`, default 14).
- Production cleanup is disabled by default.
- See `docs/TEST_DATA_CLEANUP.md`.
