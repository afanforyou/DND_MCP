@echo off
REM Installation script for Roll20 MCP Native Messaging Host (Windows)

setlocal enabledelayedexpansion

set HOST_NAME=com.roll20.mcp.host
set SCRIPT_DIR=%~dp0
set SERVER_PATH=%SCRIPT_DIR%build\index.js

echo Installing Roll20 MCP Native Messaging Host...

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Node.js is not installed. Please install Node.js first.
    exit /b 1
)

REM Build the server
echo Building MCP server...
call npm install
call npm run build

REM Verify server was built
if not exist "%SERVER_PATH%" (
    echo Error: Server build failed. %SERVER_PATH% not found.
    exit /b 1
)

REM Create manifest file in temp location
set MANIFEST_FILE=%TEMP%\%HOST_NAME%.json

echo Creating native messaging host manifest...
(
echo {
echo   "name": "%HOST_NAME%",
echo   "description": "Roll20 MCP Server Native Messaging Host",
echo   "path": "%SERVER_PATH:\=\\%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://EXTENSION_ID_PLACEHOLDER/"
echo   ]
echo }
) > "%MANIFEST_FILE%"

REM Register with Windows Registry
echo Registering native messaging host in Windows Registry...

set REG_KEY=HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%

reg add "%REG_KEY%" /ve /t REG_SZ /d "%MANIFEST_FILE%" /f >nul 2>nul

if %errorlevel% equ 0 (
    echo Registry key created successfully
) else (
    echo Error: Failed to create registry key
    exit /b 1
)

echo.
echo =========================================
echo Installation Complete!
echo =========================================
echo.
echo Next steps:
echo 1. Load the Chrome extension from: %SCRIPT_DIR%extension
echo 2. Get the extension ID from chrome://extensions
echo 3. Update the manifest file with your extension ID:
echo    Edit: %MANIFEST_FILE%
echo    Replace 'EXTENSION_ID_PLACEHOLDER' with your actual extension ID
echo.
echo 4. Reload the extension in Chrome
echo.
echo The native messaging host is now configured!
echo.

endlocal
