<# 
  Whisper Small 模型预下载脚本
  从 ModelScope 下载所需的 ONNX 模型文件到本地目录。

  用法:
    powershell -ExecutionPolicy Bypass -File scripts\download-whisper-model.ps1

  模型大小: encoder FP16 ~168 MB + decoder Q4 ~222 MB = ~390 MB
#>

$ErrorActionPreference = "Stop"

$HF_MIRROR = "https://modelscope.cn/models/onnx-community/whisper-small/resolve/master"
$MODEL_ID = "onnx-community/whisper-small"
$OUTPUT_DIR = Join-Path $PSScriptRoot "..\resources\models\$MODEL_ID"

# 需要下载的文件列表（按优先级排列）
# Whisper worker 请求 dtype: { encoder_model: 'fp16' | 'fp32', decoder_model_merged: 'q4' }
$FILES = @(
    # 核心模型文件
    @{ Path = "onnx/encoder_model_fp16.onnx"; Desc = "Encoder FP16 (168 MB)" },
    @{ Path = "onnx/decoder_model_merged_q4.onnx"; Desc = "Decoder Q4 (222 MB)" },
    # Tokenizer & config
    @{ Path = "tokenizer.json"; Desc = "Tokenizer" },
    @{ Path = "tokenizer_config.json"; Desc = "Tokenizer config" },
    @{ Path = "preprocessor_config.json"; Desc = "Preprocessor config" },
    @{ Path = "config.json"; Desc = "Model config" },
    @{ Path = "generation_config.json"; Desc = "Generation config" },
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Whisper Large V3 Turbo 模型下载器" -ForegroundColor Cyan
Write-Host "  镜像源: $HF_MIRROR" -ForegroundColor Cyan
Write-Host "  目标目录: $OUTPUT_DIR" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 创建输出目录
if (-not (Test-Path $OUTPUT_DIR)) {
    New-Item -ItemType Directory -Path $OUTPUT_DIR -Force | Out-Null
}

$downloaded = 0
$skipped = 0
$failed = 0

foreach ($file in $FILES) {
    $url = "$HF_MIRROR/$MODEL_ID/resolve/main/$($file.Path)"
    $dest = Join-Path $OUTPUT_DIR $file.Path
    $destDir = Split-Path $dest -Parent

    # 创建子目录
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    # 跳过已存在的文件
    if (Test-Path $dest) {
        $size = (Get-Item $dest).Length
        if ($size -gt 1000) {
            Write-Host "  [跳过] $($file.Desc) - 已存在 ($([math]::Round($size/1MB, 1)) MB)" -ForegroundColor DarkGray
            $skipped++
            continue
        }
    }

    Write-Host "  [下载] $($file.Desc) ..." -ForegroundColor Yellow -NoNewline
    
    try {
        # 使用 WebClient 下载，支持大文件和重定向
        $webClient = New-Object System.Net.WebClient
        $webClient.Headers.Add("User-Agent", "Mozilla/5.0")
        
        # 注册进度事件
        $webClient.add_DownloadProgressChanged({
            param($sender, $e)
            Write-Host "`r  [下载] $($file.Desc) ... $($e.ProgressPercentage)%" -ForegroundColor Yellow -NoNewline
        })
        
        $webClient.DownloadFile($url, $dest)
        
        $finalSize = (Get-Item $dest).Length
        Write-Host "`r  [完成] $($file.Desc) - $([math]::Round($finalSize/1MB, 1)) MB" -ForegroundColor Green
        $downloaded++
    }
    catch {
        Write-Host "`r  [失败] $($file.Desc) - $($_.Exception.Message)" -ForegroundColor Red
        $failed++
        # 删除不完整的文件
        if (Test-Path $dest) {
            Remove-Item $dest -Force
        }
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  下载完成!" -ForegroundColor Cyan
Write-Host "  成功: $downloaded  跳过: $skipped  失败: $failed" -ForegroundColor Cyan
Write-Host "  文件位置: $OUTPUT_DIR" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if ($failed -gt 0) {
    Write-Host ""
    Write-Host "  有 $failed 个文件下载失败，请检查网络后重试。" -ForegroundColor Red
    exit 1
}
