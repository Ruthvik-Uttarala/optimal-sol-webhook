# LPR Demo Runbook

These commands are written for Windows CMD from the repo root.

## 1. Install JavaScript dependencies

```cmd
npm install
```

## 2. Authenticate deployment CLIs if you are deploying from this machine

```cmd
firebase login
vercel login
```

## 3. Configure local demo files

```cmd
copy demo\demo-plates.example.json demo\demo-plates.local.json
copy demo\lpr.demo.example.json demo\lpr.demo.local.json
```

Set these environment variables in the same CMD session before running the seed or LPR scripts:

```cmd
set PARKINGSOL_API_BASE_URL=https://<your-firebase-api-base>
set PARKINGSOL_LPR_SECRET=<lpr-client-secret-or-postman-secret>
set PARKINGSOL_BEARER_TOKEN=<admin-or-support-firebase-id-token>
set PARKINGSOL_INTERNAL_TEST_KEY=<internal-test-key>
```

## 4. Install the Python 3.12 LPR runtime

```cmd
npm run lpr:setup
```

## 5. Deploy backend and frontend updates

```cmd
npx firebase deploy --only functions,firestore:rules,firestore:indexes --project prod
vercel --prod --yes
```

## 6. Seed the demo plates and webcam source

```cmd
npm run demo:seed -- demo\demo-plates.local.json
```

This does three things:

- upserts the dedicated `webcam_lpr` source for the chosen lot
- clears old artifacts only for the configured demo session and demo plates
- seeds the paid and permit plates while leaving the unpaid plate intentionally unseeded

## 7. Validate backend state before the live camera run

```cmd
npm run demo:validate -- demo\demo-plates.local.json
```

## 8. Start the real webcam LPR pipeline

```cmd
npm run lpr:demo -- --config demo\lpr.demo.local.json --preview
```

Press `q` in the OpenCV preview window to stop.

## 9. Run the paid demo

- Show the configured paid plate from `demo\demo-plates.local.json` to the webcam.
- Wait for the sidecar to log an `[emit]` line.
- Open the deployed frontend and confirm:
- the event appears in Live Events
- the vehicle state resolves to `paid`
- no new violation is created

## 10. Run the unpaid demo

- Show the configured unpaid plate from `demo\demo-plates.local.json` to the webcam.
- Wait for the sidecar to log an `[emit]` line.
- Confirm in the deployed frontend:
  - the event appears in Live Events
- the vehicle state resolves to `unpaid`
- a violation is present
- notifications update

## 11. Verify duplicate suppression

- Keep the same unpaid plate in view after the first emit.
- The sidecar should suppress re-emission during the cooldown window.
- Backend duplicate suppression still prevents repeat LPR events within the same minute from opening extra violations.

## 12. Optional replay mode

```cmd
npm run lpr:replay -- --config demo\lpr.demo.local.json --video demo\runtime\sample.mp4 --max-events 2
```

Use replay mode only for iteration or automated checks. Tomorrow’s demo path is the live webcam command.
