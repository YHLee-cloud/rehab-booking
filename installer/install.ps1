#Requires -RunAsAdministrator
# 復健科自費療程預約系統 - Windows 安裝腳本
# 會把 RehabBookingSystem.exe 複製到 Program Files，並設定成開機自動啟動（以 Task Scheduler 排程實現，
# 效果等同背景服務：不需登入任何帳號、程式意外中斷會自動重啟）。
$ErrorActionPreference = 'Stop'

$installDir = Join-Path $env:ProgramFiles 'RehabBookingSystem'
$exeName = 'RehabBookingSystem.exe'
$sourceExe = Join-Path $PSScriptRoot $exeName
$sourcePublicDir = Join-Path $PSScriptRoot 'public'
$taskName = 'RehabBookingSystem'
$ruleName = 'RehabBookingSystem'

if (-not (Test-Path $sourceExe)) {
    Write-Host "找不到 $exeName，請確認這個資料夾內有這個檔案（應與 install.bat 放在同一層）。" -ForegroundColor Red
    Read-Host '按 Enter 鍵關閉此視窗'
    exit 1
}
if (-not (Test-Path $sourcePublicDir)) {
    Write-Host '找不到 public 資料夾，請確認這個資料夾內有 public（網頁前端檔案），應與 install.bat 放在同一層。' -ForegroundColor Red
    Read-Host '按 Enter 鍵關閉此視窗'
    exit 1
}

Write-Host '正在安裝到' $installDir '...'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

# 若服務正在執行，先停止，才能覆蓋 exe 檔案（更新版本用）
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

Copy-Item -Path $sourceExe -Destination $installDir -Force

# 網頁前端檔案：每次安裝/更新都整份覆蓋（這裡面沒有使用者資料，data/ 才有）
$destPublicDir = Join-Path $installDir 'public'
if (Test-Path $destPublicDir) { Remove-Item -Path $destPublicDir -Recurse -Force }
Copy-Item -Path $sourcePublicDir -Destination $installDir -Recurse -Force

# data 資料夾（資料庫、憑證、備份）：保留既有資料，不覆蓋
$dataDir = Join-Path $installDir 'data'
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

# 防火牆規則，讓診所內其他裝置可以連進來
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow | Out-Null
}

# 排程工作：開機自動啟動、以 SYSTEM 身分執行（不需登入任何帳號）、意外中斷會自動重啟
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute (Join-Path $installDir $exeName) -WorkingDirectory $installDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description '復健科自費療程預約系統' | Out-Null

Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

Write-Host ''
Write-Host '安裝完成！系統已在背景啟動，之後每次開機都會自動啟動。' -ForegroundColor Green
Write-Host ''
Write-Host '本機瀏覽器請輸入： https://localhost:3000'
Write-Host '診所內其他電腦/手機（同一個 Wi-Fi），請改用下列網址：'
Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    ForEach-Object { Write-Host "  https://$($_.IPAddress):3000" }
Write-Host ''
Write-Host '瀏覽器第一次連線會顯示「不安全」/「連線不是私人連線」的警告，這是正常現象（自簽憑證），點選「進階」→「繼續前往」即可。'
Write-Host ''
Write-Host '預設管理者帳號：admin  密碼：admin123，請登入後立即到「內部維護」修改密碼。'
Write-Host ''
Read-Host '按 Enter 鍵關閉此視窗'
