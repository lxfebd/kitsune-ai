"""
VoxCPM2 TTS 服务（Sidecar 内嵌模式）
=====================================

基于 OpenBMB VoxCPM2 的流式语音合成服务。
部署为独立进程（port 8001），作为项目唯一 TTS 引擎。

端点：
- POST /api/tts/synthesize  — 非流式，返回 WAV 二进制
- POST /api/tts/stream      — SSE 流式，返回 base64 float32 chunks
- GET  /api/tts/health      — 健康检查（模型是否已加载）
- GET  /api/tts/voices      — 支持的音色/模式列表

启动方式：
    python voxcpm_server.py                          # 默认 port 8001
    VOXCPM_PORT=8001 VOXCPM_MODEL_PATH=./models python voxcpm_server.py

依赖：
    pip install voxcpm fastapi uvicorn
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import sys
import threading
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Dict, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field


# ══════════════════════════════════════════════════════════════════════════════
# 全局配置
# ══════════════════════════════════════════════════════════════════════════════

MODEL_PATH = os.environ.get("VOXCPM_MODEL_PATH", "./pretrained_models/VoxCPM2")
LORA_PATH = os.environ.get("VOXCPM_LORA_PATH", "")
USE_LORA = os.environ.get("VOXCPM_USE_LORA", "false").lower() == "true"
PORT = int(os.environ.get("VOXCPM_PORT", "8001"))
HOST = os.environ.get("VOXCPM_HOST", "127.0.0.1")
OPTIMIZE = os.environ.get("VOXCPM_OPTIMIZE", "true").lower() in ("1", "true", "yes")

# 全局模型实例
_model = None
_sample_rate = 24000  # 加载后会更新为模型实际采样率
_model_load_time = 0.0
_model_load_error: str | None = None  # 模型加载失败时记录错误信息
_current_model_path = MODEL_PATH
_current_lora_path = LORA_PATH


# ══════════════════════════════════════════════════════════════════════════════
# 诊断工具
# ══════════════════════════════════════════════════════════════════════════════

def _log_gpu_diagnostics():
    """打印 PyTorch / CUDA / GPU 诊断信息，用于排查 5090 等显卡的性能问题。"""
    try:
        import torch
        print(f"[VoxCPM2] PyTorch version: {torch.__version__}", flush=True)
        print(f"[VoxCPM2] CUDA available: {torch.cuda.is_available()}", flush=True)
        if torch.cuda.is_available():
            print(f"[VoxCPM2] CUDA version: {torch.version.cuda}", flush=True)
            print(f"[VoxCPM2] cuDNN version: {torch.backends.cudnn.version()}", flush=True)
            for i in range(torch.cuda.device_count()):
                name = torch.cuda.get_device_name(i)
                capability = torch.cuda.get_device_capability(i)
                total_mem = torch.cuda.get_device_properties(i).total_memory / (1024 ** 3)
                print(
                    f"[VoxCPM2] GPU {i}: {name}, compute capability {capability[0]}.{capability[1]}, "
                    f"total memory {total_mem:.2f} GB",
                    flush=True,
                )
            # Blackwell (RTX 50xx) 需要 PyTorch >= 2.7 才能完全发挥性能
            major = torch.cuda.get_device_capability(0)[0]
            if major >= 10:
                print(
                    "[VoxCPM2] ⚠️ Detected Blackwell/ newer GPU (compute capability >= 10.0). "
                    "PyTorch < 2.7 may run in compatibility mode and be very slow. "
                    "Consider upgrading to PyTorch 2.7+ with CUDA 12.8.",
                    flush=True,
                )
        # 检查 CUDA_HOME / nvcc
        cuda_home = os.environ.get("CUDA_HOME") or os.environ.get("CUDA_PATH")
        print(f"[VoxCPM2] CUDA_HOME/CUDA_PATH: {cuda_home or '(not set)'}", flush=True)
    except Exception as e:
        print(f"[VoxCPM2] GPU diagnostics failed: {e}", flush=True)


# ══════════════════════════════════════════════════════════════════════════════
# 模型加载
# ══════════════════════════════════════════════════════════════════════════════

def _load_model(model_path: str = None, lora_path: str = None):
    """加载 VoxCPM2 模型（在后台线程中调用）

    Args:
        model_path: 模型路径，默认使用 MODEL_PATH
        lora_path: LoRA 权重路径，默认使用 LORA_PATH
    """
    global _model, _sample_rate, _model_load_time, _model_load_error, _current_model_path, _current_lora_path

    model_path = model_path or MODEL_PATH
    lora_path = lora_path or LORA_PATH
    use_lora = USE_LORA and lora_path

    t0 = time.time()
    _model_load_error = None
    print(f"[VoxCPM2] 正在加载模型: {model_path}")
    print(f"[VoxCPM2] torch.compile optimize: {OPTIMIZE}")
    _log_gpu_diagnostics()
    if use_lora:
        print(f"[VoxCPM2] LoRA 路径: {lora_path}")

    try:
        import json
        from voxcpm import VoxCPM
        from voxcpm.model.voxcpm import LoRAConfig

        # 准备 LoRA 配置
        lora_config = None
        if use_lora and lora_path:
            # 从 LoRA 检查点读取配置
            lora_config_path = os.path.join(lora_path, "lora_config.json")
            if os.path.exists(lora_config_path):
                with open(lora_config_path, "r", encoding="utf-8") as f:
                    lora_info = json.load(f)
                    lora_cfg = lora_info.get("lora_config", {})
                    lora_config = LoRAConfig(
                        enable_lm=lora_cfg.get("enable_lm", True),
                        enable_dit=lora_cfg.get("enable_dit", True),
                        enable_proj=lora_cfg.get("enable_proj", False),
                        r=lora_cfg.get("r", 8),
                        alpha=lora_cfg.get("alpha", 16),
                        dropout=lora_cfg.get("dropout", 0.0),
                    )
                    print(f"[VoxCPM2] LoRA config: r={lora_config.r}, alpha={lora_config.alpha}")
            else:
                # 使用默认配置
                lora_config = LoRAConfig(
                    enable_lm=True,
                    enable_dit=True,
                    enable_proj=False,
                )

        # 优先使用 CUDA，不可用时回退到 CPU
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[VoxCPM2] 使用设备: {device}")

        _model = VoxCPM.from_pretrained(
            model_path,
            device=device,
            load_denoiser=False,  # 不需要降噪器，节省显存
            optimize=OPTIMIZE,
            lora_config=lora_config,
            lora_weights_path=lora_path if use_lora else None,
        )
        _sample_rate = _model.tts_model.sample_rate
        _model_load_time = time.time() - t0
        _current_model_path = model_path
        _current_lora_path = lora_path if use_lora else ""

        lora_info = f" (LoRA: {lora_path})" if use_lora else ""
        print(f"[VoxCPM2] ✅ 模型加载完成！采样率: {_sample_rate}Hz，耗时: {_model_load_time:.1f}s{lora_info}")

        # 优化：模型加载后清理 CUDA 缓存碎片，减少显存碎片化
        if device == "cuda":
            import gc
            gc.collect()
            torch.cuda.empty_cache()
            # 打印当前显存使用情况，便于监控
            mem_allocated = torch.cuda.memory_allocated() / 1024**3
            mem_reserved = torch.cuda.memory_reserved() / 1024**3
            print(f"[VoxCPM2] 📊 显存使用: {mem_allocated:.2f}GB 已分配, {mem_reserved:.2f}GB 已预留")
    except Exception as e:
        print(f"[VoxCPM2] ❌ 模型加载失败: {e}")
        _model = None
        _model_load_error = str(e)


# ══════════════════════════════════════════════════════════════════════════════
# FastAPI 应用
# ══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时加载模型"""
    # 在后台线程中加载模型（不阻塞 FastAPI 启动）
    load_thread = threading.Thread(target=_load_model, daemon=True)
    load_thread.start()
    yield
    print("[VoxCPM2] 服务关闭")


app = FastAPI(
    title="VoxCPM2 TTS Server",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════════════
# 请求/响应模型
# ══════════════════════════════════════════════════════════════════════════════

class SynthesizeRequest(BaseModel):
    """非流式合成请求"""
    text: str = Field(..., description="要合成的文本", min_length=1, max_length=10000)
    voice: str = Field("default", description="音色名称（用于 voice design 模式）")
    reference_wav_path: str = Field("", description="参考音频路径（用于 voice cloning）")
    prompt_text: str = Field("", description="参考音频的文本（用于 ultimate cloning）")
    cfg_value: float = Field(2.0, description="引导系数", ge=1.0, le=3.0)
    inference_timesteps: int = Field(10, description="推理步数", ge=4, le=30)


class StreamRequest(BaseModel):
    """SSE 流式合成请求"""
    text: str = Field(..., description="要合成的文本", min_length=1, max_length=10000)
    voice: str = Field("default", description="音色名称")
    reference_wav_path: str = Field("", description="参考音频路径")
    prompt_text: str = Field("", description="参考音频的文本")
    cfg_value: float = Field(2.0, description="引导系数")
    inference_timesteps: int = Field(10, description="推理步数")


# ══════════════════════════════════════════════════════════════════════════════
# SSE 辅助函数
# ══════════════════════════════════════════════════════════════════════════════

def _encode_chunk(chunk: np.ndarray) -> str:
    """将音频块编码为 base64（float32 PCM）"""
    return base64.b64encode(chunk.astype(np.float32).tobytes()).decode("utf-8")


def _wav_bytes_from_numpy(wav: np.ndarray, sample_rate: int) -> bytes:
    """将 numpy 波形转换为 WAV 字节"""
    import soundfile as sf

    buf = io.BytesIO()

    # 确保数组类型是 float32/float64，避免 numpy 标量转换问题
    if wav.dtype not in (np.float32, np.float64):
        wav = wav.astype(np.float32)

    # 处理不同的形状：
    # (samples,)        -> 1D mono
    # (samples, 1)      -> 2D mono (正确)
    # (1, samples)      -> batch 维度在前，需要转置
    # (1, 1, samples)   -> 需要 squeeze
    wav = np.squeeze(wav)
    if wav.ndim == 1:
        wav = wav.reshape(-1, 1)
    elif wav.ndim == 2 and wav.shape[0] == 1:
        # (1, samples) -> (samples, 1)
        wav = wav.T

    sf.write(buf, wav, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


async def _generate_sse(request: StreamRequest) -> AsyncGenerator[str, None]:
    """生成 SSE 流（真正的实时流式：边生成边发送）"""
    if not _model:
        yield _sse_event({"type": "error", "message": "模型尚未加载完成"})
        return

    text = request.text.strip()
    if not text:
        yield _sse_event({"type": "error", "message": "文本为空"})
        return

    # 发送开始事件
    yield _sse_event({
        "type": "start",
        "sample_rate": _sample_rate,
        "model": "VoxCPM2",
    })

    kwargs = {
        "text": text,
        "cfg_value": request.cfg_value,
        "inference_timesteps": request.inference_timesteps,
        "retry_badcase": False,
    }

    # Voice Design: 如果 voice 不是 "default"，在文本前加描述
    if request.voice and request.voice != "default":
        kwargs["text"] = f"({request.voice}){text}"

    # Voice Cloning: 参考音频
    if request.reference_wav_path and os.path.exists(request.reference_wav_path):
        kwargs["reference_wav_path"] = request.reference_wav_path

    # Ultimate Cloning: 参考音频 + 文本
    if request.prompt_text and request.reference_wav_path and os.path.exists(request.reference_wav_path):
        kwargs["prompt_wav_path"] = request.reference_wav_path
        kwargs["prompt_text"] = request.prompt_text

    q: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()
    chunk_count = [0]

    def producer():
        """在后台线程中运行模型生成，每得到一个 chunk 立即推入队列"""
        try:
            # VoxCPM.generate_streaming()  yields np.ndarray（不是元组）
            for chunk in _model.generate_streaming(**kwargs):
                encoded = _encode_chunk(chunk)
                asyncio.run_coroutine_threadsafe(
                    q.put({
                        "type": "chunk",
                        "data": encoded,
                        "index": chunk_count[0],
                        "sample_rate": _sample_rate,
                    }),
                    loop,
                )
                chunk_count[0] += 1
            asyncio.run_coroutine_threadsafe(
                q.put({"type": "end", "chunk_count": chunk_count[0]}),
                loop,
            )
        except Exception as e:
            asyncio.run_coroutine_threadsafe(
                q.put({"type": "error", "message": str(e)}),
                loop,
            )

    producer_thread = threading.Thread(target=producer, daemon=True)
    producer_thread.start()

    while True:
        event = await q.get()
        if event["type"] == "end":
            yield _sse_event(event)
            break
        yield _sse_event(event)


def _sse_event(data: dict) -> str:
    """将字典编码为 SSE 事件字符串"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ══════════════════════════════════════════════════════════════════════════════
# API 路由
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/tts/health")
async def health():
    """健康检查：返回模型加载状态"""
    if _model_load_error:
        return {
            "status": "error",
            "error": _model_load_error,
            "model_loaded": _model is not None,
            "sample_rate": _sample_rate if _model else None,
        }
    if not _model:
        return {
            "status": "loading",
            "model_loaded": False,
            "sample_rate": None,
        }
    return {
        "status": "ok",
        "model_loaded": True,
        "sample_rate": _sample_rate,
        "model_path": _current_model_path,
        "load_time": _model_load_time,
    }


@app.get("/api/tts/voices")
async def voices():
    """返回支持的音色/模式列表"""
    return {
        "voices": [
            {"id": "default", "name": "默认音色", "type": "voice_design"},
            {"id": "clone", "name": "参考音频克隆", "type": "voice_clone"},
            {"id": "ultimate", "name": "极致克隆", "type": "ultimate_clone"},
        ]
    }


@app.post("/api/tts/synthesize")
async def synthesize(request: SynthesizeRequest):
    """非流式语音合成，返回 WAV 文件"""
    if not _model:
        if _model_load_error:
            raise HTTPException(status_code=503, detail=f"模型加载失败: {_model_load_error}")
        raise HTTPException(status_code=503, detail="模型加载中，请稍后再试")

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="文本不能为空")

    kwargs = {
        "text": text,
        "cfg_value": request.cfg_value,
        "inference_timesteps": request.inference_timesteps,
        "retry_badcase": False,
    }

    # Voice Design: 如果 voice 不是 "default"，在文本前加描述
    if request.voice and request.voice != "default":
        kwargs["text"] = f"({request.voice}){text}"

    # Voice Cloning: 参考音频
    if request.reference_wav_path and os.path.exists(request.reference_wav_path):
        kwargs["reference_wav_path"] = request.reference_wav_path

    # Ultimate Cloning: 参考音频 + 文本
    if request.prompt_text and request.reference_wav_path and os.path.exists(request.reference_wav_path):
        kwargs["prompt_wav_path"] = request.reference_wav_path
        kwargs["prompt_text"] = request.prompt_text

    try:
        # VoxCPM.generate() 返回单个 np.ndarray（1D 波形），不是 (sample_rate, wav) 元组
        wav = _model.generate(**kwargs)
        wav_bytes = _wav_bytes_from_numpy(wav, _sample_rate)
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=tts.wav"},
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"合成失败: {str(e)}")


@app.post("/api/tts/stream")
async def stream(request: StreamRequest):
    """SSE 流式语音合成"""
    return StreamingResponse(
        _generate_sse(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.post("/api/tts/synthesize-path")
async def synthesize_path(request: Request):
    """返回合成后的音频文件路径（供 Electron local-audio:// 协议使用）"""
    import tempfile
    import soundfile as sf

    body = await request.json()
    text = body.get("text", "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="文本不能为空")

    if not _model:
        if _model_load_error:
            raise HTTPException(status_code=503, detail=f"模型加载失败: {_model_load_error}")
        raise HTTPException(status_code=503, detail="模型加载中，请稍后再试")

    try:
        # VoxCPM.generate() 返回单个 np.ndarray，不是 (sample_rate, wav) 元组
        wav = _model.generate(
            text=text,
            cfg_value=float(body.get("cfg_value", 2.0)),
            inference_timesteps=int(body.get("inference_timesteps", 10)),
            retry_badcase=False,
        )
        wav = np.squeeze(wav)
        if wav.ndim == 1:
            wav = wav.reshape(-1, 1)
        elif wav.ndim == 2 and wav.shape[0] == 1:
            wav = wav.T

        fd, tmp_path = tempfile.mkstemp(suffix=".wav", prefix="voxcpm_")
        os.close(fd)
        sf.write(tmp_path, wav, _sample_rate, format="WAV", subtype="PCM_16")

        return {
            "ok": True,
            "audioFilePath": tmp_path,
            "sampleRate": _sample_rate,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"合成失败: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# 启动入口
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    print(f"[VoxCPM2] Starting server on {HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
