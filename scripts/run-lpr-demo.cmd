@echo off
setlocal
set VENV_PATH=lpr\.venv
if not exist "%VENV_PATH%\Scripts\python.exe" (
  echo Python environment missing. Run npm run lpr:setup first.
  exit /b 1
)
set CONFIG_PATH=demo\lpr.demo.local.json
if not exist "%CONFIG_PATH%" set CONFIG_PATH=demo\lpr.demo.example.json
"%VENV_PATH%\Scripts\python.exe" -m lpr --config "%CONFIG_PATH%" %*

