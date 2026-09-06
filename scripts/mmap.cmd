@echo off
rem Open the live Mellos map in a Windows Terminal tab.
rem Usage: scripts\mmap.cmd [page-slug]   (default page when omitted)
setlocal

set "MELLOS_ROOT=%USERPROFILE%\mellos-mapping"
set "MAP_FILE=%~dp0..\.mellos\map.json"

if not exist "%MELLOS_ROOT%\dist\watch.mjs" (
  echo [mmap] mellos-mapping plugin not found at %MELLOS_ROOT%
  exit /b 1
)
if not exist "%MAP_FILE%" (
  echo [mmap] no map file yet at %MAP_FILE% - declare one first
  exit /b 1
)

set "WT=%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe"
if not exist "%WT%" (
  echo [mmap] Windows Terminal not found at %WT%
  exit /b 1
)

set "PAGE="
if not "%~1"=="" set "PAGE=--page %~1"

start "" "%WT%" -w 0 nt --title "Mellos: kitsune-ai" cmd /k "chcp 65001 >nul & node \"%MELLOS_ROOT%\dist\watch.mjs\" --file \"%MAP_FILE%\" %PAGE%"

endlocal