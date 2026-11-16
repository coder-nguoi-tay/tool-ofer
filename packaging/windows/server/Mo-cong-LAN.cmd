@echo off
setlocal
set "AUTOLEADPC_SERVER_DIRECTORY=%~dp0"
powershell.exe -NoProfile -Command "try { $process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('{0}{1}{0}' -f [char]34, (Join-Path $env:AUTOLEADPC_SERVER_DIRECTORY 'Windows-LAN.ps1')),'-Action','Enable'); exit $process.ExitCode } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 pause
