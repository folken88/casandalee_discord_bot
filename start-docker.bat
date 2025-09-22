@echo off
SETLOCAL

echo ========================================
echo Starting Casandalee Bot (Docker)
echo ========================================
echo.

echo [%date% %time%] Building and starting Docker container...
docker-compose build --no-cache
docker-compose up -d

if %ERRORLEVEL% equ 0 (
    echo [%date% %time%] ✓ Bot started successfully in Docker!
    echo.
    echo Container Status:
    docker-compose ps
    echo.
    echo To view logs: docker-compose logs -f cass-bot
    echo To stop bot: stop-docker.bat
) else (
    echo [%date% %time%] ✗ Failed to start bot in Docker
    echo Check Docker Desktop is running and try again
)

echo.
echo ========================================
echo Docker bot startup complete
echo ========================================

ENDLOCAL
