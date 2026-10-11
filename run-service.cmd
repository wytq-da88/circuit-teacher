@echo off
cd /d "%~dp0"
title Circuit Teacher - Keep service running
if not exist "node_modules\tsx\dist\cli.mjs" (
  echo Dependencies are missing. Run setup.cmd first.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo The web app is not built. Run setup.cmd first.
  pause
  exit /b 1
)
echo Circuit Teacher: http://127.0.0.1:4317/
echo Keep this window open while using the workbench. You can minimize it.
echo Press Ctrl+C to stop the service.
node "node_modules\tsx\dist\cli.mjs" "server\index.ts" --production
if errorlevel 1 pause
