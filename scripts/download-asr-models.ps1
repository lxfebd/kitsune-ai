# download-asr-models.ps1
# 下载 ASR 模型文件（SenseVoice-Small INT8 / Paraformer-Small）
# 来源：sherpa-onnx 官方预转换模型（GitHub Releases）
#
# 使用方式：
#   powershell -ExecutionPolicy Bypass -File scripts/download-asr-models.ps1
#
# 模型来源：https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models

$ErrorActionPreference = "Stop"

# 目标目录
$TargetDir = Join-Path (Join-Path (Join-Path $PSScriptRoot "..") "resources") "models"
$TargetDir = Join-Path $TargetDir "sherpa-onnx"

# 模型文件（INT8 量化版，体积小且速度快）
$SenseVoiceArchive = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17.tar.bz2"
$SenseVoiceUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$SenseVoiceArchive"
$SenseVoiceDir = "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17"

$ParaformerArchive = "sherpa-onnx-paraformer-zh-small-2024-03-09.tar.bz2"
$ParaformerUrl = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/$ParaformerArchive"
$ParaformerDir = "sherpa-onnx-paraformer-zh-small-2024-03-09"

function Download-And-Extract {
    param(
        [string]$Url,
        [string]$ArchiveName,
        [string]$ExtractDir,
        [string]$Description
    )
    
    $ArchivePath = "$TargetDir\$ArchiveName"
    $ExtractPath = "$TargetDir\$ExtractDir"
    
    if (Test-Path $ExtractPath) {
        Write-Host "  [SKIP] $Description already exists: $ExtractPath" -ForegroundColor Yellow
        return
    }
    
    Write-Host "  [DOWN] $Description ..." -ForegroundColor Cyan
    Write-Host "         URL: $Url" -ForegroundColor DarkGray
    
    try {
        # 下载
        Invoke-WebRequest -Uri $Url -OutFile $ArchivePath -UseBasicParsing
        $size = (Get-Item $ArchivePath).Length / 1MB
        Write-Host "  [DOWN] Downloaded $([math]::Round($size, 1)) MB" -ForegroundColor Green
        
        # 解压
        Write-Host "  [UNPACK] Extracting..." -ForegroundColor Cyan
        tar xjf $ArchivePath -C $TargetDir
        
        # 删除压缩包
        Remove-Item $ArchivePath -Force
        Write-Host "  [DONE] $Description" -ForegroundColor Green
    }
    catch {
        Write-Host "  [FAIL] $Description : $_" -ForegroundColor Red
        throw
    }
}

# 创建目标目录
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

# ============================================================================
# SenseVoice-Small INT8（推荐：中文最优，155MB）
# ============================================================================
Write-Host ""
Write-Host "=== SenseVoice-Small INT8 ===" -ForegroundColor Magenta
Write-Host "  中文 WER ~2%，支持情感检测，5语言（中英日韩粤）" -ForegroundColor DarkGray
Download-And-Extract -Url $SenseVoiceUrl -ArchiveName $SenseVoiceArchive -ExtractDir $SenseVoiceDir -Description "SenseVoice INT8 model"

# ============================================================================
# Paraformer-Small（备选：最快，74MB）
# ============================================================================
Write-Host ""
Write-Host "=== Paraformer-Small ===" -ForegroundColor Magenta
Write-Host "  中文 WER ~2.8%，CTC 架构，超低延迟" -ForegroundColor DarkGray
Download-And-Extract -Url $ParaformerUrl -ArchiveName $ParaformerArchive -ExtractDir $ParaformerDir -Description "Paraformer Small model"

# ============================================================================
# 完成
# ============================================================================
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Models downloaded to: $TargetDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "SenseVoice INT8: ~155MB (推荐)" -ForegroundColor White
Write-Host "Paraformer Small: ~74MB (最快)" -ForegroundColor White
Write-Host ""
Write-Host "注意：Whisper 模型已在 resources/models/onnx-community/whisper-small/" -ForegroundColor DarkGray
Write-Host "      运行 scripts/download-whisper-model.ps1 下载 Whisper" -ForegroundColor DarkGray
