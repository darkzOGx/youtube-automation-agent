@echo off
title YouTube Automation Agent
cd /d E:\Office\Youtube_Automation
if not exist logs mkdir logs
echo ================================
echo  YouTube Automation Agent
echo  Dashboard: http://localhost:3456
echo ================================
echo.
echo Starting... (logs saved to logs\app.log)
echo Press Ctrl+C to stop.
echo.
node index.js >> logs\app.log 2>&1
echo.
echo Agent stopped. Check logs\app.log for details.
pause
