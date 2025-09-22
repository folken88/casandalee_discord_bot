@echo off
echo ========================================
echo Git Setup - Initialize Repository
echo ========================================
echo.

echo Step 1: Initializing git repository...
git init

if %ERRORLEVEL% neq 0 (
    echo ❌ Git init failed!
    pause
    exit /b 1
)

echo Step 2: Adding remote origin...
git remote add origin https://github.com/folken88/casandalee_discord_bot.git

if %ERRORLEVEL% neq 0 (
    echo ❌ Git remote add failed!
    pause
    exit /b 1
)

echo Step 3: Adding all files...
git add .

if %ERRORLEVEL% neq 0 (
    echo ❌ Git add failed!
    pause
    exit /b 1
)

echo Step 4: Making initial commit...
git commit -m "Initial commit: Casandalee Discord Bot

- Complete Discord bot with natural language processing
- 72 unique personality system with detailed backstories
- Google Sheets integration for real-time campaign data
- Docker support with management scripts
- Campaign timeline and character reincarnation features
- FoundryVTT integration for table lookups
- Comprehensive documentation and setup guides"

if %ERRORLEVEL% neq 0 (
    echo ❌ Git commit failed!
    pause
    exit /b 1
)

echo Step 5: Pushing to GitHub...
git branch -M main
git push -u origin main

if %ERRORLEVEL% neq 0 (
    echo ❌ Git push failed!
    echo Repository initialized locally but not pushed to GitHub
    echo You may need to authenticate with GitHub
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ Git setup successful!
echo ========================================
echo.
echo Repository has been initialized and pushed to GitHub.
echo All your code is now backed up and version controlled!
echo.
pause
