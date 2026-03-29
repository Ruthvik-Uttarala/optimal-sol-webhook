# Environment Matrix

## Deployment Targets

| Environment | Branch | Frontend Target | Backend Target | Validation Gate |
|---|---|---|---|---|
| Local | any | Vite local dev | Firebase Emulator Suite | lint + typecheck + test + newman + playwright |
| Development | `develop` | Vercel Development env | Firebase alias `dev` | Preview checks passed |
| Staging/Preview | PR branches + `staging` | Vercel Preview / staged promotion | Firebase alias `staging` | health + Newman core + frontend smoke + RBAC checks |
| Production | `main` | Vercel Production | Firebase alias `prod` | Manual release approval + verification |

## Promotion Flow

1. Feature branch opens PR and gets Vercel preview.
2. Merge into `develop` after CI and preview checks pass.
3. Promote `develop` to `staging` for integration validation.
4. Promote `staging` to `main` for production deployment.

## Rollback Flow

### Frontend

1. Open Vercel Deployments.
2. Promote previous known-good deployment.
3. Verify `/dashboard` and `/violations` load.

### Backend

1. Checkout prior good git SHA/tag.
2. Run `firebase deploy --only functions,firestore:rules,firestore:indexes --project <env alias>`.
3. Verify `GET /api/v1/health` and Newman smoke subset.

### Full stack rollback

1. Rollback frontend deployment first.
2. Redeploy backend prior SHA to matching environment alias.
3. Verify health + event ingest + violation list.
