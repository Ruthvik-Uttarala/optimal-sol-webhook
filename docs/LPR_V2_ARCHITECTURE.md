# ParkingSol LPR V2 Architecture

ParkingSol v2.0 keeps the existing Firebase/Vercel product flow intact and swaps only the upstream event source.

## Additive path

- `lpr/` is a local Python sidecar that opens the laptop webcam or a replay source.
- Frames go through a real two-stage pipeline:
  - YOLO detector using `yasirfaizahmed/license-plate-object-detection@2632bbf`
  - EasyOCR CRNN recognizer with an uppercase alphanumeric allowlist
- The sidecar does not decide paid or unpaid status.
- It emits a real webhook to `POST /api/v1/webhooks/lpr/events`.
- The Firebase backend still runs the existing `processIncomingEvent` logic for dedupe, payment or permit lookup, rules, vehicle state updates, violations, and notifications.
- Firestore remains the source of truth for the dashboard and the deployed Vercel frontend.

## Backend changes

- New public route: `/api/v1/webhooks/lpr/events`
- New additive payload fields:
  - `sourceType`
  - `cameraName`
  - `cameraId`
  - `detectorConfidence`
  - `frameConsensusCount`
  - `recognitionMetadata`
  - `evidenceRefs`
  - `lprModelInfo`
  - `manualReviewRequired`
  - `demoSessionId`
- LPR route auth accepts:
  - active Firestore `apiClients` of type `lpr`
  - or `LPR_CLIENT_SECRET`
  - or the existing `POSTMAN_CLIENT_SECRET` as a fallback if `LPR_CLIENT_SECRET` is not configured yet
- `processIncomingEvent` now stores LPR metadata on `events`, copies evidence refs into new violations, stores the latest LPR summary on `vehicleStates`, and forces `pending_review` when `manualReviewRequired=true`.
- LPR events dedupe by `sourceId + normalizedPlate + direction + minute`, so unique external IDs from the sidecar do not bypass duplicate suppression.

## Frontend visibility

- Live Events now show source type, camera metadata, OCR and detector confidence, consensus count, and evidence count.
- Event Detail shows LPR metadata, evidence refs, recognition metadata, and webhook status.
- Vehicle Detail shows the latest LPR signal carried on `vehicleStates.latestLprEvent`.
- System Status exposes the latest LPR event, plate, camera, confidence, consensus count, decision, and webhook status.

## Local sidecar responsibilities

- Opens webcam or replay input.
- Downloads and verifies detector weights into a repo-local cache.
- Caches EasyOCR models under `lpr/models/easyocr`.
- Normalizes plate text deterministically.
- Requires multi-frame consensus before emission.
- Suppresses recently emitted duplicate plates.
- Saves full-frame, crop, and metadata evidence under `demo/runtime/evidence/<session>`.
- Writes per-run metrics under `demo/runtime/metrics/<session>.json`.

## What did not change

- Firebase Cloud Functions remain the backend runtime.
- Firestore remains the database and realtime source.
- Firebase Auth remains the auth layer.
- Vercel remains the frontend deployment target.
- Existing Postman and UniFi webhook routes remain intact.
