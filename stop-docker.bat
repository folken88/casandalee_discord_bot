@echo off
SETLOCAL

echo ========================================
echo Stopping Casandalee Bot (Docker)
echo ========================================
echo.

echo [%date% %time%] Stopping and removing Docker container...
docker-compose down

if %ERRORLEVEL% equ 0 (
    echo [%date% %time%] ✓ Docker bot stopped and removed successfully!
    echo.
    echo Remaining containers:
    docker ps -a
) else (
    echo [%date% %time%] ✗ Failed to stop Docker bot
)

echo.
echo ========================================
echo Docker bot stop complete
echo ========================================

ENDLOCAL
