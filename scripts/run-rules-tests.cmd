@echo off
setlocal

set FIRESTORE_RULES_PORT=54101
set XDG_CONFIG_HOME=%CD%\.firebase-config
set APPDATA=%CD%\.firebase-config

if not exist "%XDG_CONFIG_HOME%" mkdir "%XDG_CONFIG_HOME%"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr :%FIRESTORE_RULES_PORT% ^| findstr LISTENING') do (
  taskkill /F /PID %%p >nul 2>nul
)

npx firebase emulators:exec --config firebase.rules-test.json --project parking-sol-local --only firestore "cd functions && npm run test:rules:unit"
set RULES_EXIT=%ERRORLEVEL%

for /f "tokens=5" %%p in ('netstat -ano ^| findstr :%FIRESTORE_RULES_PORT% ^| findstr LISTENING') do (
  taskkill /F /PID %%p >nul 2>nul
)

exit /b %RULES_EXIT%
