# External Blockers

## 1) Node runtime below locked MVP requirement

- Blocker: Host runtime is `Node v20.11.1` / `npm 10.2.4`; contract requires `Node 20.19.0` / `npm 10.8.2`.
- Why external: Runtime toolchain installation is machine-level and outside repo code.
- Required permission/value: Install/activate Node `20.19.0` (or newer compatible `22.12+`) and npm `10.8.2`.
- Exact command or console path:
  - Use `nvm`/`nvm-windows` or installer to switch runtime.
  - Verify with `node -v` and `npm -v`.
- Verification steps:
  - Run `npm run build` and `npm run test:e2e`.
  - Expected: Vite/Playwright web server starts without `styleText` import error.

## 2) Java runtime missing for Firebase Emulator Suite

- Blocker: `firebase emulators:start` and `firebase emulators:exec` fail with `spawn java ENOENT`.
- Why external: Java installation/PATH configuration is machine-level dependency.
- Required permission/value: Install Java (JRE/JDK 17+) and add to system `PATH`.
- Exact command or console path:
  - Install Temurin/OpenJDK.
  - Verify with `java -version`.
- Verification steps:
  - Run `npm run emu:start`, `npm run emu:baseline:refresh`, and `npm run test:rules`.
  - Expected: Firestore/Auth emulators boot and rules tests execute.

## 3) Cloud deployment execution (if required now)

- Blocker: Actual deploy run to Firebase/Vercel not completed in this environment.
- Why external: Requires project-level deploy permissions and environment secret values.
- Required permission/value:
  - Firebase deploy IAM on `parking-sol-dev` / `parking-sol-staging` / `parking-sol-prod`.
  - Vercel project access + configured env vars per `docs/SECRETS_MATRIX.md`.
- Exact command or console path:
  - Firebase: `firebase deploy --only functions,firestore:rules,firestore:indexes --project <alias>`
  - Vercel: `vercel --prod` (or CI linked project deployment)
- Verification steps:
  - `GET /api/v1/health`
  - Run Newman smoke
  - Load dashboard and violations pages on deployed frontend.
