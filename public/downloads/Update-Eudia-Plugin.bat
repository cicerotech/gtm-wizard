@echo off
setlocal enabledelayedexpansion
title Eudia Lite Updater
color 0B

echo.
echo  ========================================
echo    EUDIA LITE UPDATER
echo    Download ^& install the latest version
echo  ========================================
echo.

set "SERVER=https://gtm-wizard.onrender.com"
set "PF=.obsidian\plugins\eudia-transcription"
set "VAULT_DIR="

:: Step 1: Find the vault
echo  [1/4] Searching for your Eudia vault...

:: Check if script is inside a vault
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%%PF%\main.js" (
    set "VAULT_DIR=%SCRIPT_DIR:~0,-1%"
    goto :found
)

:: Search common locations
for %%D in ("%USERPROFILE%\Documents" "%USERPROFILE%\Desktop" "%USERPROFILE%\OneDrive\Documents" "%USERPROFILE%\OneDrive\Desktop" "%USERPROFILE%") do (
    if exist "%%~D" (
        for /f "delims=" %%F in ('dir /s /b /ad "%%~D\eudia-transcription" 2^>nul ^| findstr /i ".obsidian\\plugins\\eudia-transcription"') do (
            set "FOUND=%%F"
            set "VAULT_DIR=!FOUND:.obsidian\plugins\eudia-transcription=!"
            if "!VAULT_DIR:~-1!"=="\" set "VAULT_DIR=!VAULT_DIR:~0,-1!"
            goto :found
        )
    )
)

:: Not found - ask user
echo.
echo  Could not auto-detect your vault.
echo  Please paste the full path to your vault folder and press Enter:
echo  (the folder that contains .obsidian\)
echo.
set /p "VAULT_DIR=  Vault path: "
set "VAULT_DIR=%VAULT_DIR:"=%"

:found
set "PLUGIN_DIR=%VAULT_DIR%\%PF%"

if not exist "%PLUGIN_DIR%\main.js" (
    echo.
    echo  ERROR: Plugin folder not found at:
    echo    %PLUGIN_DIR%
    echo.
    echo  Make sure you opened this vault in Obsidian at least once
    echo  and enabled the Eudia Transcription Plugin.
    echo.
    pause
    exit /b 1
)

echo  Found vault: %VAULT_DIR%

:: Step 2: Show current version
echo  [2/4] Checking current version...
for /f "tokens=2 delims=:," %%V in ('findstr /c:"\"version\"" "%PLUGIN_DIR%\manifest.json" 2^>nul') do (
    set "CURRENT_VERSION=%%V"
    set "CURRENT_VERSION=!CURRENT_VERSION: =!"
    set "CURRENT_VERSION=!CURRENT_VERSION:"=!"
)
if not defined CURRENT_VERSION set "CURRENT_VERSION=unknown"
echo  Current version: v%CURRENT_VERSION%

:: Step 3: Download latest plugin files
echo  [3/4] Downloading latest plugin from server...
echo         (server may take ~30s to wake up)

:: Back up current files
copy /y "%PLUGIN_DIR%\main.js" "%PLUGIN_DIR%\main.js.bak" >nul 2>&1

:: Download using curl (available on Windows 10+)
set "DL_OK=1"

curl -sS --connect-timeout 60 --max-time 120 -o "%PLUGIN_DIR%\main.js.new" "%SERVER%/api/plugin/main.js" 2>nul
if not exist "%PLUGIN_DIR%\main.js.new" (
    echo  Retrying download...
    timeout /t 5 /nobreak >nul
    curl -sS --connect-timeout 60 --max-time 120 -o "%PLUGIN_DIR%\main.js.new" "%SERVER%/api/plugin/main.js" 2>nul
)
if not exist "%PLUGIN_DIR%\main.js.new" (
    echo  Retrying download (attempt 3)...
    timeout /t 5 /nobreak >nul
    curl -sS --connect-timeout 60 --max-time 120 -o "%PLUGIN_DIR%\main.js.new" "%SERVER%/api/plugin/main.js" 2>nul
)

if not exist "%PLUGIN_DIR%\main.js.new" (
    set "DL_OK=0"
    goto :dl_check
)

curl -sS --connect-timeout 30 --max-time 30 -o "%PLUGIN_DIR%\manifest.json.new" "%SERVER%/api/plugin/manifest.json" 2>nul
curl -sS --connect-timeout 30 --max-time 30 -o "%PLUGIN_DIR%\styles.css.new" "%SERVER%/api/plugin/styles.css" 2>nul

:dl_check
if "%DL_OK%"=="0" (
    echo.
    echo  Download failed. The server may be temporarily unavailable.
    echo  Please wait a minute and try again.
    if exist "%PLUGIN_DIR%\main.js.bak" copy /y "%PLUGIN_DIR%\main.js.bak" "%PLUGIN_DIR%\main.js" >nul 2>&1
    del /f /q "%PLUGIN_DIR%\*.new" 2>nul
    echo.
    pause
    exit /b 1
)

:: Validate downloads
for %%F in ("%PLUGIN_DIR%\main.js.new") do set "MAIN_SIZE=%%~zF"
if not defined MAIN_SIZE set "MAIN_SIZE=0"
if %MAIN_SIZE% LSS 10000 (
    echo  Download seems incomplete. Please try again.
    if exist "%PLUGIN_DIR%\main.js.bak" copy /y "%PLUGIN_DIR%\main.js.bak" "%PLUGIN_DIR%\main.js" >nul 2>&1
    del /f /q "%PLUGIN_DIR%\*.new" 2>nul
    pause
    exit /b 1
)

:: Step 4: Install
echo  [4/4] Installing update...

move /y "%PLUGIN_DIR%\main.js.new" "%PLUGIN_DIR%\main.js" >nul
move /y "%PLUGIN_DIR%\manifest.json.new" "%PLUGIN_DIR%\manifest.json" >nul
move /y "%PLUGIN_DIR%\styles.css.new" "%PLUGIN_DIR%\styles.css" >nul
del /f /q "%PLUGIN_DIR%\main.js.bak" 2>nul

:: Fix vault theme - ensure light mode
set "APPEARANCE=%VAULT_DIR%\.obsidian\appearance.json"
echo {"accentColor":"#8e99e1","theme":"moonstone","cssTheme":""}> "%APPEARANCE%"

:: Get new version
for /f "tokens=2 delims=:," %%V in ('findstr /c:"\"version\"" "%PLUGIN_DIR%\manifest.json" 2^>nul') do (
    set "NEW_VERSION=%%V"
    set "NEW_VERSION=!NEW_VERSION: =!"
    set "NEW_VERSION=!NEW_VERSION:"=!"
)
if not defined NEW_VERSION set "NEW_VERSION=latest"

:: Auto-close Obsidian
tasklist /FI "IMAGENAME eq Obsidian.exe" 2>nul | findstr /i "Obsidian.exe" >nul
if %errorlevel%==0 (
    echo  Closing Obsidian...
    taskkill /IM "Obsidian.exe" /F >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo.
echo  ========================================
echo.
echo    EUDIA LITE UPDATED
echo.
echo    v%CURRENT_VERSION% -- v%NEW_VERSION%
echo.
echo    Reopen Obsidian to use the updated plugin.
echo    Future updates will happen automatically.
echo.
echo  ========================================
echo.

pause
