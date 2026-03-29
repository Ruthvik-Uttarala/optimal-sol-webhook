# Emulator Baseline

Local passing is valid only when runs start from committed baseline import.

## Baseline commands

- `npm run emu:start`
- `npm run emu:reset`
- `npm run emu:baseline:refresh`

## Baseline contents

- Auth users (admin/operator/support)
- Firestore seed docs for organizations/lots/users/access/sources/rules/payments/permits/systemConfig/apiClients
- Committed files under `emulator-data/baseline/` are required in git before local flow can be called passing.

## Sign-off requirement

Do not claim local pass if tests were run against ad-hoc state.
