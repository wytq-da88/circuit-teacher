@echo off
cd /d "%~dp0"
node scripts\launcher.cjs
if errorlevel 1 pause
