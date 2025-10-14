@echo off
echo Starting fresh-box in debug mode...
echo.

REM 设置环境变量以启用详细日志
set RUST_LOG=debug
set RUST_BACKTRACE=1

REM 检查是否存在之前的崩溃日志
if exist "crash.log" (
    echo Previous crash log found:
    echo ========================
    type "crash.log"
    echo ========================
    echo.
    echo Moving old crash log to crash_old.log
    move "crash.log" "crash_old.log"
)

REM 启动应用
echo Starting application...
start "" "fresh-box.exe"

REM 等待一段时间后检查进程
timeout /t 5 /nobreak >nul
echo.
echo Checking if application is running...
tasklist /fi "imagename eq fresh-box.exe" | find /i "fresh-box.exe" >nul
if %errorlevel% equ 0 (
    echo Application is running successfully.
) else (
    echo Application is not running. Checking for crash log...
    if exist "crash.log" (
        echo Crash log found:
        echo ================
        type "crash.log"
        echo ================
    ) else (
        echo No crash log found.
    )
)

pause