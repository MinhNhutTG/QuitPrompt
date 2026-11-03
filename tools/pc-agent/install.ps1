# Cho chương trình nhận lệnh tắt máy tự chạy (ẩn) mỗi khi đăng nhập Windows, và chạy ngay bây giờ.
# Chỉ thêm một file vào thư mục Startup của tài khoản Windows đang dùng; không cần quyền quản trị.
# Gỡ: chạy uninstall.ps1.
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$agent = Join-Path $dir "agent.mjs"
if (-not (Test-Path (Join-Path $dir "config.json"))) { throw "Chưa có config.json. Chạy trước: node agent.mjs setup <địa chỉ app> <mã kết nối>" }
$node = (Get-Command node -ErrorAction Stop).Source

$startup = [Environment]::GetFolderPath("Startup")
$vbs = Join-Path $startup "XuongPrompt-PcAgent.vbs"
# wscript chạy node với cửa sổ ẩn (0), không chờ.
$content = 'CreateObject("WScript.Shell").Run """' + $node + '"" ""' + $agent + '""", 0, False'
Set-Content -Path $vbs -Value $content -Encoding ASCII
Write-Output "Đã thêm $vbs"

Start-Process -FilePath "wscript.exe" -ArgumentList "`"$vbs`""
Write-Output "Đã chạy. Mở trang Quản trị -> Máy tính để thấy máy đang bật. Nhật ký: $(Join-Path $dir 'agent.log')"
