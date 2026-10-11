@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org/ then run setup.cmd again.
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)"
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  pause
  exit /b 1
)
if not exist ".cache\tmp" mkdir ".cache\tmp"
set "TEMP=%CD%\.cache\tmp"
set "TMP=%CD%\.cache\tmp"
set "npm_config_cache=%CD%\.cache\npm"
set "PUPPETEER_CACHE_DIR=%CD%\.cache\puppeteer"
set "PUPPETEER_SKIP_DOWNLOAD=true"
set "DO_NOT_TRACK=1"
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto failed
call npm.cmd run build
if errorlevel 1 goto failed
echo Setup complete. Double-click start.cmd to open Circuit Teacher.
pause
exit /b 0
:failed
echo Setup failed. Review the message above before retrying.
pause
exit /b 1
