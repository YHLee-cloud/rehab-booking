@echo off
:: 雙擊這個檔案即可安裝（會跳出 UAC 視窗要求系統管理員權限，請按「是」）。
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0install.ps1\"' -Verb RunAs"
