@echo off
setlocal
set VENV_PATH=lpr\.venv
if not exist "%VENV_PATH%\Scripts\python.exe" (
  py -3.12 -m venv "%VENV_PATH%"
)
"%VENV_PATH%\Scripts\python.exe" -m pip install --upgrade pip
"%VENV_PATH%\Scripts\python.exe" -m pip install -r lpr\requirements.txt

