# 修复 profile junction(修正版)—— 必须以【管理员身份】运行
# 用法:Win+X -> 终端(管理员) -> 运行本脚本

$base = "C:\Users\silence\.dsh\profiles\web\node_modules"

cmd /c rmdir "$base\dsh-plugin-market-watch"
cmd /c mklink /J "$base\dsh-plugin-market-watch" "E:\Development\Agents_Project\buddy_project\dsh-market-watch"

cmd /c rmdir "$base\dsh-egg-agents"
cmd /c mklink /J "$base\dsh-egg-agents" "E:\Development\Agents_Project\zcode_project\liingjidan\dsh-egg-agents"

Write-Output "`n=== created, verify below ==="
cmd /c dir /AL "$base"
