@echo off
title Drive Clone Server
color 0A

echo ========================================
echo        Drive Clone Server
echo ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: Navigate to script directory
cd /d "%~dp0"

:: Check if node_modules exists
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

:: Check if .env exists
if not exist ".env" (
    echo [INFO] Creating .env file from .env.example...
    copy ".env.example" ".env" >nul
)

echo [INFO] Starting Drive Clone server on port 6666...
echo [INFO] Press Ctrl+C to stop the server
echo.
echo ========================================
echo.

:: Start the server
node server.js

:: If server exits, pause to see error
pause
