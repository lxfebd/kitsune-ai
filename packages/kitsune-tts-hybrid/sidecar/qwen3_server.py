"""
Qwen3-TTS 服务
基于 Qwen3-TTS 模型的语音合成服务。

端点：
- POST /api/tts/synthesize  — 非流式合成，返回完整音频
- POST /api/tts/stream      — 流式合成，返回音频流
- GET  /health              — 健康检查

启动方式：
    python qwen3_server.py                          # 默认 port 8002
    QWEN3_TTS_PORT=8002 python qwen3_server.py

依赖：
    pip install fastapi uvicorn numpy
"""

from __future__ import annotations

import asyncio
import os
import threading
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field


# ══════════════════════════════════════════════════════════════════════════════
# 全局配置
# ══════════════════════════════════════════════════════════════════════════════

MODEL_PATH = os.environ.get("QWEN3_TTS_MODEL_PATH", "./models/qwen3-tts")
DEVICE = os.environ.get("QWEN3_TTS_DEVICE", "auto")  # auto, gpu, cpu
PORT = int(os.environ.get("QWEN3_TTS_PORT", "8002"))
HOST = os.environ.get("QWEN3_TTS_HOST", "127.0.0.1")
SAMPLE_RATE = 24000

# 全局模型实例
_model = None
_sample_rate = SAMPLE_RATE
_model_load_time = 0.0
_model_load_error: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# 模型加载
# ══════════════════════════════════════════════════════════════════════════════

def _load_model():
    """加载 Qwen3-TTS 模型（在后台线程中调用）"""
    global _model, _sample_rate, _model_load_time, _model_load_error

    t0 = time.time()
    _model_load_error = None
    print(f"[Qwen3-TTS] 正在加载模型: {MODEL_PATH}")
    print(f"[Qwen3-TTS] 使用设备: {DEVICE}")

    try:
        # TODO: 实际加载 Qwen3-TTS 模型
        # from qwen3_tts import Qwen3TTS
        # _model = Qwen3TTS.from_pretrained(MODEL_PATH, device=DEVICE)
        # _sample_rate = _model.sample_rate

        # 模拟加载（实际部署时替换为真实模型加载）
        print(f"[Qwen3-TTS] 模型加载中（模拟模式）...")
        time.sleep(0.1)  # 模拟加载时间
        _model = "mock"

        _model_load_time = time.time() - t0
        print(f"[Qwen3-TTS] 模型加载完成！采样率: {_sample_rate}Hz，耗时: {_model_load_time:.1f}s")

    except Exception as e:
        print(f"[Qwen3-TTS] 模型加载失败: {e}")
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
    print("[Qwen3-TTS] 服务关闭")


app = FastAPI(
    title="Qwen3-TTS Server",
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
    voice: Optional[str] = Field("default", description="音色名称")
    speed: Optional[float] = Field(1.0, description="语速", ge=0.5, le=2.0)
    pitch: Optional[float] = Field(1.0, description="音调", ge=0.5, le=2.0)


class HealthResponse(BaseModel):
    """健康检查响应"""
    status: str
    device: str
    model_loaded: bool
    load_time_ms: float
    sample_rate: int


# ══════════════════════════════════════════════════════════════════════════════
# API 路由
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    """健康检查：返回模型加载状态"""
    return HealthResponse(
        status="healthy" if _model else ("loading" if _model_load_error is None else "error"),
        device=DEVICE,
        model_loaded=_model is not None,
        load_time_ms=_model_load_time * 1000,
        sample_rate=_sample_rate,
    )


@app.post("/api/tts/synthesize")
async def synthesize(request: SynthesizeRequest):
    """非流式语音合成，返回完整音频"""
    if not _model:
        if _model_load_error:
            raise HTTPException(status_code=503, detail=f"模型加载失败: {_model_load_error}")
        raise HTTPException(status_code=503, detail="模型加载中，请稍后再试")

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="文本不能为空")

    try:
        # TODO: 实际调用 Qwen3-TTS 合成
        # audio = _model.synthesize(text, voice=request.voice, speed=request.speed, pitch=request.pitch)

        # 模拟音频生成（实际部署时替换为真实合成）
        duration = len(text) * 0.1  # 模拟时长
        samples = int(_sample_rate * duration)
        audio = np.zeros(samples, dtype=np.float32)

        return Response(
            content=audio.tobytes(),
            media_type="audio/pcm",
            headers={
                "X-Sample-Rate": str(_sample_rate),
                "X-Samples": str(samples),
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"合成失败: {str(e)}")


@app.post("/api/tts/stream")
async def stream(request: SynthesizeRequest):
    """流式语音合成，返回音频流"""
    if not _model:
        if _model_load_error:
            raise HTTPException(status_code=503, detail=f"模型加载失败: {_model_load_error}")
        raise HTTPException(status_code=503, detail="模型加载中，请稍后再试")

    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="文本不能为空")

    async def generate() -> AsyncGenerator[bytes, None]:
        try:
            # TODO: 实际调用 Qwen3-TTS 流式合成
            # for chunk in _model.stream(text, voice=request.voice):
            #     yield chunk.tobytes()

            # 模拟流式输出
            duration = len(text) * 0.1
            samples = int(_sample_rate * duration)
            chunk_size = 2400  # 100ms chunks

            for i in range(0, samples, chunk_size):
                chunk = np.zeros(min(chunk_size, samples - i), dtype=np.float32)
                yield chunk.tobytes()
                await asyncio.sleep(0.01)  # 模拟延迟

            # 发送结束标记
            yield b'\x00\x00\x00\x00'  # length=0 表示结束
        except Exception as e:
            print(f"[Qwen3-TTS] 流式合成错误: {e}")
            raise

    return StreamingResponse(
        generate(),
        media_type="application/octet-stream",
        headers={
            "X-Sample-Rate": str(_sample_rate),
            "Transfer-Encoding": "chunked",
        }
    )


# ══════════════════════════════════════════════════════════════════════════════
# 启动入口
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn
    print(f"[Qwen3-TTS] Starting server on {HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
