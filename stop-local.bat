@echo off
SETLOCAL

echo ========================================
echo Stopping Casandalee Bot (Local Node.js)
echo ========================================
echo.

echo [%date% %time%] Looking for local Node.js bot process...

:: Find and stop the bot process
wmic process where "name='node.exe' and commandline like '%%src/index.js%%'" get processid,commandline 2>NUL | findstr "src/index.js" >NUL
if %ERRORLEVEL% equ 0 (
    echo [%date% %time%] Found local bot process, stopping...
    
    :: Get the process ID and kill it
    for /f "tokens=2" %%i in ('wmic process where "name='node.exe' and commandline like '%%src/index.js%%'" get processid /value ^| findstr "ProcessId"') do (
        echo [%date% %time%] Stopping bot process ID: %%i
        taskkill /PID %%i /F
        if %ERRORLEVEL% equ 0 (
            echo [%date% %time%] ✓ Local bot stopped successfully
        ) else (
            echo [%date% %time%] ✗ Failed to stop local bot process
        )
    )
) else (
    echo [%date% %time%] No local bot process found
)

echo.
echo ========================================
echo Local bot stop complete
echo ========================================

ENDLOCAL
