# Gỡ chương trình nhận lệnh tắt máy: bỏ khỏi Startup và dừng bản đang chạy (chỉ tiến trình node chạy agent.mjs này).
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$agent = Join-Path $dir "agent.mjs"
$vbs = Join-Path ([Environment]::GetFolderPath("Startup")) "XuongPrompt-PcAgent.vbs"
if (Test-Path $vbs) { Remove-Item $vbs -Confirm:$false; Write-Output "Đã bỏ khỏi Startup" }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*$agent*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -Confirm:$false; Write-Output "Đã dừng tiến trình $($_.ProcessId)" }
