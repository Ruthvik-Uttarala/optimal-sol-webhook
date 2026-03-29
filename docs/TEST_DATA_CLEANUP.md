# Test Data Cleanup Policy

- Applies to non-production environments only.
- Scheduled job `cleanupTestArtifactsJob` runs daily at 02:00 America/New_York.
- Default retention: 14 days (`TEST_DATA_RETENTION_DAYS`).
- Removes old test `events` (`isTestEvent=true`) and related stale `notifications` and `auditLogs` older than retention.
- Manual lot-scoped purge endpoint is available for admin/support:
  - `POST /api/v1/test/reset-lot` (requires auth + internal test key)
- Production cleanup remains disabled unless explicitly enabled through secure server config.
