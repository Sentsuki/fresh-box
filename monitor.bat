@echo off
echo Fresh-box Process Monitor
echo ========================
echo Press Ctrl+C to stop monitoring
echo.

:loop
REM 获取当前时间
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "timestamp=%YYYY%-%MM%-%DD% %HH%:%Min%:%Sec%"

REM 检查fresh-box进程
tasklist /fi "imagename eq fresh-box.exe" | find /i "fresh-box.exe" >nul
if %errorlevel% equ 0 (
    echo [%timestamp%] fresh-box.exe is running
) else (
    echo [%timestamp%] WARNING: fresh-box.exe is NOT running!
    
    REM 检查是否有崩溃日志
    if exist "crash.log" (
        echo [%timestamp%] Crash log detected:
        type "crash.log"
        echo.
    )
)

REM 检查sing-box进程
tasklist /fi "imagename eq sing-box.exe" | find /i "sing-box.exe" >nul
if %errorlevel% equ 0 (
    echo [%timestamp%] sing-box.exe is running
) else (
    echo [%timestamp%] sing-box.exe is NOT running
)

echo.
REM 等待30秒
timeout /t 30 /nobreak >nul
goto loop