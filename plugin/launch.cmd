@echo off
rem The plugin's MCP server on Windows (#202). .mcp.json names "launch" with no
rem extension: Windows finds this file, macOS and Linux run the sh script.
rem With mockingbird installed, this becomes `mockingbird mcp`; without it,
rem launch.ps1 answers MCP with one tool that says how to install it.
where mockingbird >nul 2>nul && (call mockingbird mcp & exit /b)
if exist "%USERPROFILE%\.mockingbird\bin\mockingbird.cmd" (
  call "%USERPROFILE%\.mockingbird\bin\mockingbird.cmd" mcp
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch.ps1"
