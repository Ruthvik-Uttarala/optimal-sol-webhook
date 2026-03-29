# RBAC Source Of Truth

- Firestore is authoritative for authorization.
- `users.globalRole` and `userLotAccess` determine effective access.
- Firebase custom claims are optional metadata and are not used as authoritative lot scope in rules.

## Required rules tests

Before sign-off, run:

- `npm run test` (includes `npm run test:rules`)
- `npm run test:rules` (standalone)

Coverage includes:

- operator allowed lot-scoped reads and denied admin writes
- admin allowed protected writes
- support allowed diagnostics reads and denied restricted writes
