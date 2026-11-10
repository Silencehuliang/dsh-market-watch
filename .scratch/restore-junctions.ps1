$base = 'C:\Users\silence\.dsh\profiles\web\node_modules'
foreach ($n in 'dsh-plugin-market-watch', 'dsh-egg-agents') {
  $p = Join-Path $base $n
  if (Test-Path $p) {
    try { [System.IO.Directory]::Delete($p, $false); Write-Output "deleted bad junction: $n" }
    catch { Write-Output "FAILED del ${n}: $($_.Exception.Message)" }
  }
}
cmd /c mklink /J "$base\dsh-plugin-market-watch" "E:\Development\Agents_Project\buddy_project\dsh-market-watch"
cmd /c mklink /J "$base\dsh-egg-agents" "E:\Development\Agents_Project\zcode_project\liingjidan\dsh-egg-agents"
Write-Output '=== done ==='
