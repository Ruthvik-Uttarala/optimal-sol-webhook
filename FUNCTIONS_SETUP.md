# Firebase Functions Setup (Webhook + Auth + Notifications + S3 Abstraction)

## What works now without AWS
- UniFi webhook ingestion (`unifiWebhook`) and parking entry flow.
- Protected auth endpoints:
  - `adminDiagnostics` (admin required)
  - `registerDeviceToken` (staff/admin required)
  - `getViolationImageUrl` (staff/admin required)
- Violation notification path:
  - device-token-first delivery
  - optional topic fallback (`staff`) when enabled
- S3 abstraction in mock mode (`ENABLE_S3=false`) with deterministic object keys and mocked signed-url responses.

## Environment variables (`functions/.env`)
Use `functions/.env.example` as baseline.

Required for core tests:
- `COLLECTION_PREFIX=test`
- `AUTH_CHECK_REVOKED=true`
- `ENABLE_TOPIC_FALLBACK=true`

Required tomorrow for live AWS:
- `ENABLE_S3=true`
- `AWS_REGION=<your-aws-region>`
- `AWS_BUCKET=<your-s3-bucket>`
- `VIOLATION_URL_TTL_SECONDS=600`
- `DEFAULT_LOT_ID=<lot-id>`

## Collection names (shared Firebase project safety)
Only new collections are prefixed by `COLLECTION_PREFIX`:
- `<prefix>_deviceTokens`
- `<prefix>_notificationDedupe`
- `<prefix>_staffUsers`

Existing collections remain unchanged:
- `events`, `violations`, `parkingEntries`, `paidSessions`, `plateIndex`, `unifi_webhook_events`

## Endpoint examples
Set variables first:
- `BASE_URL=https://<region>-<project>.cloudfunctions.net`
- `ID_TOKEN=<firebase-id-token>`

### 1) adminDiagnostics (admin only)
```bash
curl -i "$BASE_URL/adminDiagnostics" \
  -H "Authorization: Bearer $ID_TOKEN"
```

### 2) registerDeviceToken (staff/admin)
```bash
curl -i -X POST "$BASE_URL/registerDeviceToken" \
  -H "Authorization: Bearer $ID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token":"<fcm-device-token>","platform":"android"}'
```

### 3) getViolationImageUrl (staff/admin)
```bash
curl -i "$BASE_URL/getViolationImageUrl?violationId=<violation-id>" \
  -H "Authorization: Bearer $ID_TOKEN"
```

### 4) unifiWebhook (secret optional)
```bash
curl -i -X POST "$BASE_URL/unifiWebhook" \
  -H "Content-Type: application/json" \
  -H "x-unifi-secret: <secret-if-configured>" \
  -d '{
    "cameraId":"cam-1",
    "cameraName":"Gate A",
    "plate":"ABC123",
    "timestamp":"2026-03-11T10:30:00Z",
    "snapshotUrl":"https://example.com/image.jpg",
    "lotId":"lot-01"
  }'
```

## Live validation checklist required for full story closure

### SCRUM-20 (push notification)
Required live proof:
1. Real Firebase-authenticated test user.
2. Real FCM token registered through `registerDeviceToken`.
3. Unpaid webhook test that creates violation.
4. Observed push delivery on device.

### SCRUM-22 (auth hardening)
Required live proof:
1. `401` for missing/invalid token.
2. `401` for revoked token (with `AUTH_CHECK_REVOKED=true`).
3. `403` for valid token with insufficient role.
4. `200` for authorized role.

### SCRUM-15 / SCRUM-16 / SCRUM-18 (AWS)
Until credentials are available, status is:
- implementation complete, mock path validated, live AWS validation pending.

Full closure requires live proof:
1. Real S3 upload from webhook evidence path.
2. Real signed URL from `getViolationImageUrl`.
3. Signed URL fetch returns the uploaded image.

## Remaining external dependencies
- Live AWS credentials, bucket, and IAM permissions.
- Live Firebase auth users/claims/staff docs for role tests.
- Real device token + device connectivity for push delivery.
- Real UniFi snapshot retrieval availability for full end-to-end unpaid evidence upload path.
