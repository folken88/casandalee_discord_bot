@echo off
echo ========================================
echo Docker Force Rebuild - Ensuring New Code
echo ========================================
echo.

echo Step 1: Stopping and removing ALL containers...
docker-compose down
docker container prune -f

echo Step 2: Removing ALL images...
docker image prune -a -f

echo Step 3: Cleaning up Docker system...
docker system prune -a -f
docker volume prune -f

echo Step 4: Building new container with current code...
docker-compose build --no-cache --pull

if %ERRORLEVEL% neq 0 (
    echo ❌ BUILD FAILED! Check the error above.
    echo Common issues: npm lockfile problems, missing dependencies, disk space
    pause
    exit /b 1
)

echo Step 5: Starting container...
docker-compose up -d

if %ERRORLEVEL% neq 0 (
    echo ❌ START FAILED! Check the error above.
    pause
    exit /b 1
)

echo Step 6: Checking status...
docker-compose ps

echo Step 7: Showing recent logs...
docker-compose logs --tail=20 cass-bot

echo.
echo ========================================
echo Force rebuild complete - NEW CODE SHOULD BE RUNNING
echo ========================================
echo.
echo Test the bot now to see if personality system is working!
echo Look for "🎲 Personality roll:" messages in the logs.
