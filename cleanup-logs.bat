@echo off
SETLOCAL

echo ========================================
echo Cleaning Up Casandalee Bot Logs
echo ========================================
echo.

echo [%date% %time%] Checking log directory...

if not exist "logs\" (
    echo [%date% %time%] No logs directory found.
    goto :end
)

echo [%date% %time%] Current log files:
dir logs\casandalee-*.log /o-d 2>NUL

echo.
echo [%date% %time%] Cleaning up old log files (keeping 7 most recent)...

for /f "skip=7 delims=" %%i in ('dir logs\casandalee-*.log /b /o-d 2^>NUL') do (
    echo [%date% %time%] Deleting: %%i
    del "logs\%%i"
)

echo.
echo [%date% %time%] Remaining log files:
dir logs\casandalee-*.log /o-d 2>NUL

echo.
echo [%date% %time%] Log cleanup complete!

:end
echo.
echo ========================================
echo Log cleanup finished
echo ========================================

ENDLOCAL
