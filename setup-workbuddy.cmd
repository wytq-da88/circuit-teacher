@echo off
cd /d "%~dp0"
node scripts\setup-workbuddy.cjs
if errorlevel 1 (
  pause
  exit /b 1
)
pause
