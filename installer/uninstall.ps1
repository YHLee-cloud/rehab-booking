#Requires -RunAsAdministrator
# 移除復健科自費療程預約系統：停止並刪除排程工作、移除防火牆規則。
# 注意：不會刪除程式檔案與 data 資料夾（內含病患資料庫與備份），避免誤刪重要資料。
# 如確定要完全移除，請自行手動刪除安裝資料夾。
$ErrorActionPreference = 'SilentlyContinue'

$taskName = 'RehabBookingSystem'
$ruleName = 'RehabBookingSystem'
$installDir = Join-Path $env:ProgramFiles 'RehabBookingSystem'

Stop-ScheduledTask -TaskName $taskName
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Remove-NetFirewallRule -DisplayName $ruleName

Write-Host ''
Write-Host '已停止並移除開機自動啟動設定。' -ForegroundColor Green
Write-Host "程式檔案與資料仍保留在：$installDir"
Write-Host '如需完全刪除，請先確認 data 資料夾內的病患資料已備份，再自行手動刪除該資料夾。'
Write-Host ''
Read-Host '按 Enter 鍵關閉此視窗'
