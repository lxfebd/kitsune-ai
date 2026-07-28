<#
.SYNOPSIS
  Kitsune AI 运行时进程级资源监控采样器（实时追加模式）。

.DESCRIPTION
  按固定间隔采样 Electron 主进程树与 Genie-TTS Python sidecar 的 CPU 使用率
  与工作集内存，并尝试用 nvidia-smi 采集 GPU 显存。每行实时追加到 CSV
  （可中途读取），结束时按进程名分组汇总。

.PARAMETER IntervalSec  采样间隔（秒）。默认 2。
.PARAMETER DurationSec 总采样时长（秒）。默认 600。
.PARAMETER Output      输出 CSV 路径。默认 perf_<timestamp>.csv。
.PARAMETER Tag          场景标签，写入每行 tag 列。
#>
param(
  [double]$IntervalSec = 2,
  [double]$DurationSec = 600,
  [string]$Output = "",
  [string]$Tag = ""
)

$sw = [System.Diagnostics.Stopwatch]::StartNew()
if ($Output -eq "") {
  $Output = "perf_" + (Get-Date -Format "yyyyMMdd_HHmmss") + ".csv"
}

function Get-Snapshot {
  $procs = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'electron|python' }
  $snap = @{}
  foreach ($p in $procs) {
    $snap[$p.Id] = @{
      Name = $p.Name
      WS   = $p.WorkingSet
      CPU  = $p.CPU
      Ts   = $sw.Elapsed.TotalSeconds
    }
  }
  return $snap
}

function Get-GpuMemoryMB {
  try {
    $out = & nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits 2>$null
    if ($LASTEXITCODE -eq 0 -and $out) {
      return ($out -join "/")
    }
  }
  catch { }
  return $null
}

$rows = @()
$prev = Get-Snapshot
Start-Sleep -Seconds $IntervalSec

while ($sw.Elapsed.TotalSeconds -lt $DurationSec) {
  $cur = Get-Snapshot
  $t = $sw.Elapsed.TotalSeconds
  $gpu = Get-GpuMemoryMB

  foreach ($id in $cur.Keys) {
    $name = $cur[$id].Name
    $wsMB = [math]::Round($cur[$id].WS / 1MB)
    $cpu = 0.0
    if ($prev.ContainsKey($id)) {
      $dt = $cur[$id].Ts - $prev[$id].Ts
      if ($dt -gt 0) { $cpu = ($cur[$id].CPU - $prev[$id].CPU) / $dt * 100 }
    }
    $cpu = [math]::Round($cpu, 1)
    $obj = [PSCustomObject]@{
      ts     = $t.ToString("F1")
      tag    = $Tag
      name   = $name
      pid    = $id
      cpuPct = $cpu
      memMB  = $wsMB
      gpuMB  = $gpu
    }
    $rows += $obj
    # 实时追加落盘，便于中途读取
    $obj | Export-Csv -Path $Output -NoTypeInformation -Encoding utf8 -Append
  }
  $prev = $cur
  Start-Sleep -Seconds $IntervalSec
}

# ---- 分组汇总 ----
Write-Host ""
Write-Host ("Sampled {0} rows -> {1}" -f $rows.Count, $Output)
Write-Host "=== Per-process-group summary (avg / peak CPU%, avg / peak MB) ==="
$groups = $rows | Group-Object name
foreach ($g in $groups) {
  $cpuAvg = [math]::Round(($g.Group | Measure-Object cpuPct -Average).Average, 1)
  $cpuMax = [math]::Round(($g.Group | Measure-Object cpuPct -Maximum).Maximum, 1)
  $memAvg = [math]::Round(($g.Group | Measure-Object memMB -Average).Average, 0)
  $memMax = [math]::Round(($g.Group | Measure-Object memMB -Maximum).Maximum, 0)
  $count  = ($g.Group | Select-Object -ExpandProperty pid -Unique).Count
  Write-Host ("{0,-12} procs={1,-3} CPU avg={2,6} peak={3,6}  MEM avg={4,6}MB peak={5,6}MB" -f $g.Name, $count, $cpuAvg, $cpuMax, $memAvg, $memMax)
}
Write-Host "=== Total MEM across all electron+python at last sample ==="
$lastTs = ($rows | Select-Object -Last 1).ts
$lastRows = $rows | Where-Object { $_.ts -eq $lastTs }
$totalMem = [math]::Round(($lastRows | Measure-Object memMB -Sum).Sum, 0)
Write-Host ("ts={0} totalMem={1} MB" -f $lastTs, $totalMem)
