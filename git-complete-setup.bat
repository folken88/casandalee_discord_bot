@echo off
echo ========================================
echo Complete Git Setup - Initialize and Push
echo ========================================
echo.

echo Step 1: Checking if git is initialized...
if not exist ".git" (
    echo Initializing git repository...
    git init
)

echo Step 2: Adding remote origin...
git remote remove origin 2>nul
git remote add origin https://github.com/folken88/casandalee_discord_bot.git

echo Step 3: Adding all files...
git add .

echo Step 4: Making commit...
git commit -m "Initial commit: Casandalee Discord Bot with 72 personality system"

echo Step 5: Setting main branch...
git branch -M main

echo Step 6: Pushing to GitHub...
echo.
echo NOTE: You may be prompted to authenticate with GitHub.
echo If you get authentication errors, you may need to:
echo 1. Set up a Personal Access Token
echo 2. Or use GitHub Desktop
echo 3. Or run: git push -u origin main
echo.
git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo ========================================
    echo ✅ SUCCESS! Code uploaded to GitHub!
    echo ========================================
    echo.
    echo Your repository is now live at:
    echo https://github.com/folken88/casandalee_discord_bot
    echo.
) else (
    echo.
    echo ========================================
    echo ⚠️  Push failed - but code is committed locally
    echo ========================================
    echo.
    echo Your code is saved locally. To push to GitHub:
    echo 1. Run: git push -u origin main
    echo 2. Or use GitHub Desktop
    echo 3. Or set up authentication
    echo.
)

pause
