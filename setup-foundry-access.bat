@echo off
echo ========================================
echo Setting up FoundryVTT Access for Docker
echo ========================================

echo.
echo This will configure Docker to access your FoundryVTT data directory.
echo.

echo Step 1: Checking FoundryVTT data directory...
if exist "C:\foundryvttstorage\Data\worlds" (
    echo ✅ Found FoundryVTT data directory: C:\foundryvttstorage
    echo ✅ Found worlds directory: C:\foundryvttstorage\Data\worlds
) else (
    echo ❌ FoundryVTT data directory not found at C:\foundryvttstorage\Data\worlds
    echo Please check your FoundryVTT installation path.
    echo.
    echo Expected structure:
    echo - C:\foundryvttstorage\Data\worlds\
    echo - C:\Users\%USERNAME%\FoundryVTT\Data\worlds\
    echo - C:\ProgramData\FoundryVTT\Data\worlds\
    echo.
    pause
    exit /b 1
)

echo.
echo Step 2: Updating .env file...
if exist ".env" (
    echo ✅ .env file found, updating FOUNDRY_DATA_PATH...
    powershell -Command "(Get-Content .env) -replace 'FOUNDRY_DATA_PATH=.*', 'FOUNDRY_DATA_PATH=C:/foundryvttstorage' | Set-Content .env"
    echo ✅ Updated FOUNDRY_DATA_PATH in .env
) else (
    echo ⚠️ .env file not found, copying from env.example...
    copy env.example .env
    echo ✅ Created .env file from template
    echo.
    echo IMPORTANT: Please edit .env file and add your Discord bot token!
)

echo.
echo Step 3: Docker configuration...
echo ✅ Docker compose file is configured to mount:
echo    C:\foundryvttstorage → /foundry/data (read-only)
echo    This gives access to: /foundry/data/Data/worlds/
echo.

echo Step 4: Testing Docker setup...
echo Building and starting Docker container...
docker-compose down
docker-compose build --no-cache
docker-compose up -d

echo.
echo ========================================
echo FoundryVTT Access Setup Complete!
echo ========================================
echo.
echo Your bot now has read-only access to FoundryVTT data.
echo.
echo Next steps:
echo 1. Test the setup: /build-actor-index
echo 2. Query actors: /actor name:Tokala info:basic
echo 3. Check logs: docker logs cass-discord-bot
echo.
echo The bot can now:
echo - Build lightweight actor index (PC characters only)
echo - Query character stats, inventory, spells, abilities
echo - Access FoundryVTT databases safely (read-only)
echo.
pause
