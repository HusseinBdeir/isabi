@echo off
rem ISABI Command Center: switch on phone and desktop notifications for approval requests (owner step, once).
rem Makes the notifications key on this PC and stores it on the Cloudflare Pages project. Prints nothing secret.
rem Extra options can be passed through: --check, --dry-run, --rotate, --help (see build\set_push_key.mjs).
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this PC. Install Node 18 or later, then run this again.
  pause
  exit /b 1
)
node "%~dp0set_push_key.mjs" %*
set RC=%ERRORLEVEL%
echo.
if "%RC%"=="0" (
  echo Finished.
) else (
  echo Stopped with code %RC%. Nothing secret was shown.
)
pause
exit /b %RC%
