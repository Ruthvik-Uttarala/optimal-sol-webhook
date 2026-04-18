# External Blockers

## 1) Firebase production deploy auth is missing

- Blocker: the backend cannot be deployed to Firebase `prod` (`payment-yveiv5`) from this machine because the Firebase CLI has no authorized account.
- Evidence:
  - Command: `npx firebase deploy --only functions,firestore:rules,firestore:indexes --project prod`
  - Result: `Error: Failed to authenticate, have you run firebase login?`
  - Command: `npx firebase login:list`
  - Result: `No authorized accounts, run "firebase login"`
- Impact:
  - the new `POST /api/v1/webhooks/lpr/events` route is not deployed to production from this environment
  - Firestore index changes for LPR visibility are not deployed to production from this environment
- Exact manual step needed:
  - run `firebase login` on this machine, or provide application default credentials with deploy access to `payment-yveiv5`
  - then rerun:

```cmd
npx firebase deploy --only functions,firestore:rules,firestore:indexes --project prod
```

## 2) Vercel production deploy auth is missing

- Blocker: the updated frontend cannot be deployed to the live Vercel project from this machine because the Vercel CLI is not authenticated.
- Evidence:
  - Command: `vercel --prod --yes`
  - Result: `Error: The specified token is not valid. Use "vercel login" to generate a new token.`
  - Command: `vercel whoami`
  - Result: device-login flow started and waited for manual approval
- Impact:
  - the LPR event metadata UI changes are not deployed to `parksol-five.vercel.app` from this environment
- Exact manual step needed:
  - run `vercel login` or provide a valid Vercel token for project `parksol`
  - then rerun:

```cmd
vercel --prod --yes
```

## 3) Production ParkingSol secrets and operator auth are not present in the shell

- Blocker: the live demo seed path and the live webcam webhook path cannot run end to end against production from this shell because the required ParkingSol secrets are not set.
- Missing values:
  - `PARKINGSOL_LPR_SECRET`
  - `PARKINGSOL_BEARER_TOKEN`
  - `PARKINGSOL_INTERNAL_TEST_KEY`
  - `PARKINGSOL_API_BASE_URL`
- Impact:
  - cannot seed the paid / permit demo plates on the main live lot
  - cannot emit a live authenticated LPR webhook from the sidecar into the deployed backend
  - cannot run `npm run demo:seed` or `npm run demo:validate` against production
- Exact manual step needed:
  - set those values in the same CMD session before running the demo commands

```cmd
set PARKINGSOL_API_BASE_URL=https://<your-firebase-api-base>
set PARKINGSOL_LPR_SECRET=<lpr-client-secret-or-postman-secret>
set PARKINGSOL_BEARER_TOKEN=<admin-or-support-firebase-id-token>
set PARKINGSOL_INTERNAL_TEST_KEY=<internal-test-key>
```

## Verified Non-Blockers

- Webcam hardware access works on this machine.
  - Command: direct OpenCV webcam probe on April 17, 2026
  - Result: `OPENED True`, `READ True`, `SHAPE (480, 640, 3)`
- The live detector + OCR loop runs against webcam frames on this machine.
  - Command: 5-frame live webcam inference probe on April 17, 2026
  - Result: average processing time `119.34 ms/frame` on CPU, with zero plate detections because no readable plate was present in view during the automated probe
- AWS credentials are currently available.
  - Command: `aws sts get-caller-identity`
  - Result: authenticated as `arn:aws:iam::025387296018:user/nova-architect-dev`
- The current production frontend is reachable.
  - URL: `https://parksol-five.vercel.app/`
  - Result: HTTP `200 OK`
