@echo off
title YouTube Automation Agent
cd /d "%~dp0"
if not exist logs mkdir logs
echo ================================
echo  YouTube Automation Agent
echo  Dashboard: http://localhost:3456
echo ================================
echo.
echo Starting... output is logged to logs\app.log
echo Press Ctrl+C to stop.
echo.
node index.js >> logs\app.log 2>&1
echo.
echo Agent stopped. See logs\app.log for details.
pause
