# Realtime LPR Troubleshooting

## Webcam does not open

- Symptom: `Unable to open webcam index 0`
- Fix:
  - close any app already using the camera
  - allow camera access in Windows privacy settings
  - rerun with a different device index:

```cmd
npm run lpr:demo -- --config demo\lpr.demo.local.json --device-index 1
```

## Detector weights fail to download or checksum fails

- Symptom: startup fails while preparing `best.pt`
- Fix:
  - confirm outbound network access on first setup
  - rerun `npm run lpr:setup`
  - delete the bad cached file under `lpr\models\detector\`

## EasyOCR model download fails

- Symptom: startup fails while initializing EasyOCR
- Fix:
  - rerun `npm run lpr:setup`
  - keep the first successful download in `lpr\models\easyocr\`
  - use Python 3.12, not Python 3.14

## LPR is reading too many false positives

- Increase consensus and confidence thresholds in `demo\lpr.demo.local.json`
- Set `emit_pending_review` to `false`
- Improve lighting and keep the plate centered and close to the webcam

## LPR is too slow

- Lower webcam resolution in `demo\lpr.demo.local.json`
- Increase `frame_skip`
- Disable the preview window
- Keep the printed plate closer so the detector crop is clearer

## Webhook delivery fails

- Confirm:
  - `PARKINGSOL_API_BASE_URL`
  - `PARKINGSOL_LPR_SECRET`
  - the Firebase backend is deployed and reachable
- If production deploys fail before the demo:
  - `npx firebase login:list` should show an authorized account
  - `vercel whoami` should return your Vercel user instead of starting device login
- Use:

```cmd
npm run demo:validate -- demo\demo-plates.local.json
```

## UI does not update after a successful emit

- Confirm the event is visible in `GET /api/v1/events`
- Confirm the live frontend is pointed at the correct backend
- Check System Status for the latest LPR event and webhook status

## Duplicate suppression is too aggressive for repeat demos

- Lower `cooldown_seconds` in `demo\lpr.demo.local.json`
- Or run the scoped cleanup helper before the next demo cycle:

```cmd
npm run demo:seed -- demo\demo-plates.local.json
```
