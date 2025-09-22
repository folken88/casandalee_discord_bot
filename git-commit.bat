@echo off
echo ========================================
echo Git Commit - Casandalee Bot Updates
echo ========================================
echo.

echo Step 1: Adding all changes...
git add .

if %ERRORLEVEL% neq 0 (
    echo ❌ Git add failed!
    pause
    exit /b 1
)

echo Step 2: Committing changes...
git commit -m "Major update: Complete personality system with 72 detailed lives

- Added comprehensive personality system with 72 unique past lives
- Each personality has detailed backstory, speaking style, and worldview
- Updated LLM handler with roleplay mode for personality embodiment
- Added chronological note about memory fragmentation
- Enhanced documentation with personality system details
- Fixed Docker rebuild scripts and management
- Added Docker management section to README
- All 72 lives now have robust descriptions and unique traits"

if %ERRORLEVEL% neq 0 (
    echo ❌ Git commit failed!
    pause
    exit /b 1
)

echo Step 3: Pushing to remote...
git push

if %ERRORLEVEL% neq 0 (
    echo ❌ Git push failed!
    echo Changes committed locally but not pushed to remote
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ Git commit successful!
echo ========================================
echo.
echo All changes have been committed and pushed to the repository.
echo The personality system is now ready for testing!
echo.
pause
