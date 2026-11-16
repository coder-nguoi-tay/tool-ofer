@echo off
setlocal
if not exist "%~dp0AutoLeadPC.exe" (
  echo Khong tim thay AutoLeadPC.exe. Hay giai nen day du thu muc ung dung.
  pause
  exit /b 1
)
start "" "%~dp0AutoLeadPC.exe" --server
