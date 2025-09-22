@echo off
echo ========================================
echo Git Push - Upload to GitHub
echo ========================================
echo.

echo Step 1: Checking git status...
git status

echo.
echo Step 2: Pushing to GitHub...
git push -u origin main

if %ERRORLEVEL% neq 0 (
    echo ❌ Git push failed!
    echo.
    echo This usually means you need to authenticate with GitHub.
    echo Try running: git push -u origin main
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ Git push successful!
echo ========================================
echo.
echo Your code is now on GitHub!
echo Check: https://github.com/folken88/casandalee_discord_bot
echo.
pause
