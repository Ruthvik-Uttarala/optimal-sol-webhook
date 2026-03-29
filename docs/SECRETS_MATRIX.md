# Secrets And Config Source Of Truth

| Variable | Owner | Set In | Rotated By | Public/Secret |
|---|---|---|---|---|
| `VITE_FIREBASE_API_KEY` | Frontend Lead | Vercel envs | Frontend Lead + Platform Admin | Public |
| `VITE_FIREBASE_AUTH_DOMAIN` | Frontend Lead | Vercel envs | Frontend Lead | Public |
| `VITE_FIREBASE_PROJECT_ID` | Platform | Vercel envs | Platform Admin | Public |
| `VITE_FIREBASE_STORAGE_BUCKET` | Platform | Vercel envs | Platform Admin | Public |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Platform | Vercel envs | Platform Admin | Public |
| `VITE_FIREBASE_APP_ID` | Platform | Vercel envs | Platform Admin | Public |
| `VITE_API_BASE_URL` | Backend Lead | Vercel envs | Backend Lead + Platform Admin | Public |
| `VITE_ENV_LABEL` | Platform | Vercel envs | Platform Admin | Public |
| `FIREBASE_PROJECT_ID` | Platform | Firebase config and local `.env.<project>` | Platform Admin | Secret-ish |
| `ENV_LABEL` | Platform | Firebase params and local `.env.<project>` | Platform Admin | Secret-ish |
| `POSTMAN_CLIENT_SECRET` | Backend Lead | Firebase Secret Manager (`defineSecret`) | Backend Lead + Platform Admin | Secret |
| `INTERNAL_TEST_KEY` | Backend Lead | Firebase Secret Manager (`defineSecret`) | Backend Lead + Platform Admin | Secret |

## Notes

- Frontend variables are injected only via Vercel project environments.
- Backend-only secrets stay server-side and must never be bundled in frontend code.
- For Firebase Functions, sensitive values use parameterized secrets; project-specific `.env` files are local convenience only.
