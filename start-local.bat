@echo off
SETLOCAL

echo ========================================
echo Starting Casandalee Bot (Local Node.js)
echo ========================================
echo.

echo [%date% %time%] Starting bot with Node.js...
echo [%date% %time%] Press Ctrl+C to stop the bot
echo.

npm start

echo.
echo [%date% %time%] Bot stopped
echo ========================================

ENDLOCAL
