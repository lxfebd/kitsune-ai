"""
Qwen3-TTS 推理服务 (增强版)

基于 llama.cpp 的纯 C++ 推理，零 Python 依赖
支持声音克隆、流式合成、CUDA 加速、GPU/CPU 自动降级
"""
import os
import sys
import io
import uuid
import tempfile
import asyncio
import threading
from pathlib import Path
from typing import Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Qwen3-TTS Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# 模型引擎（延迟加载）
_engine = None
_model_dir = None
_TTSConfig = None
_device = "cpu"  # 当前使用的设备
_load_time_ms = 0.0

# GPU/CPU 自动降级配置
GPU_PROVIDER = os.environ.get("QWEN_TTS_GPU_PROVIDER", "CUDAExecutionProvider")
CPU_PROVIDER = os.environ.get("QWEN_TTS_CPU_PROVIDER", "CPUExecutionProvider")
AUTO_FALLBACK = os.environ.get("QWEN_TTS_AUTO_FALLBACK", "true").lower() == "true"

# 请求队列
import queue
_request_queue = queue.Queue(maxsize=20)
_queue_lock = threading.Lock()

class TtsRequest(BaseModel):
    text: str
    voice: str = "default"
    temperature: float = 0.8
    seed: int = 42
    streaming: bool = False

class CloneRequest(BaseModel):
    reference_audio: str
    reference_text: str
    text: str
    temperature: float = 0.8
    seed: int = 42

def _try_load_engine(model_dir: str, providers: list) -> Optional[object]:
    """尝试加载引擎，支持多个 provider 降级"""
    try:
        gguf_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "aivoice", "models", "qwen3-tts-gguf")
        if os.path.isdir(gguf_dir) and gguf_dir not in sys.path:
            sys.path.insert(0, gguf_dir)

        from qwen3_tts_gguf.inference import TTSEngine, TTSConfig
        global _TTSConfig
        _TTSConfig = TTSConfig

        for provider in providers:
            try:
                print(f"[qwen3-tts] 尝试使用 {provider} 加载模型...", flush=True)
                engine = TTSEngine(model_dir=model_dir, onnx_provider=provider, verbose=False)
                if engine.ready:
                    print(f"[qwen3-tts] 使用 {provider} 加载成功", flush=True)
                    return engine
            except Exception as e:
                print(f"[qwen3-tts] {provider} 加载失败: {e}", flush=True)
                continue
        return None
    except ImportError as e:
        print(f"[qwen3-tts] 导入失败: {e}", flush=True)
        return None

@app.on_event("startup")
def load_model():
    global _engine, _model_dir, _device, _load_time_ms

    import time
    start_time = time.time()

    # 从环境变量或默认路径获取模型目录
    _model_dir = os.environ.get("QWEN_TTS_MODEL_DIR", "")
    if not _model_dir:
        default_paths = [
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "aivoice", "models", "qwen3-tts-gguf", "model-base"),
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "aivoice", "models", "qwen3-tts"),
        ]
        for p in default_paths:
            if os.path.exists(p):
                _model_dir = p
                break

    if not _model_dir or not os.path.exists(_model_dir):
        print("[qwen3-tts] 模型目录未配置，服务将以空模型启动", flush=True)
        return

    # GPU/CPU 自动降级
    if AUTO_FALLBACK:
        providers = [GPU_PROVIDER, CPU_PROVIDER]
    else:
        providers = [CPU_PROVIDER]

    _engine = _try_load_engine(_model_dir, providers)
    _load_time_ms = (time.time() - start_time) * 1000

    if _engine:
        _device = "gpu" if GPU_PROVIDER in providers and _engine else "cpu"
        print(f"[qwen3-tts] 模型加载完成，设备: {_device}，耗时: {_load_time_ms:.0f}ms", flush=True)
    else:
        print(f"[qwen3-tts] 模型加载失败，服务将以空模型启动", flush=True)

@app.get("/health")
async def health():
    engine_ready = _engine is not None and bool(_engine)
    return {
        "status": "ok" if engine_ready else "no_model",
        "model_loaded": engine_ready,
        "model_dir": _model_dir,
        "device": _device,
        "load_time_ms": _load_time_ms,
        "queue_size": _request_queue.qsize(),
    }

@app.get("/voices")
async def list_voices():
    """列出可用音色"""
    voices = [
        {"id": "default", "name": "默认", "lang": "zh"},
        {"id": "vivian", "name": "Vivian", "lang": "zh", "description": "年轻女声，明亮利落"},
        {"id": "serena", "name": "Serena", "lang": "zh", "description": "温暖女声，柔和亲切"},
        {"id": "uncle_fu", "name": "Uncle Fu", "lang": "zh", "description": "成熟男声，沉稳低沉"},
        {"id": "dylan", "name": "Dylan", "lang": "zh", "description": "北京男声，自然清晰"},
        {"id": "eric", "name": "Eric", "lang": "zh", "description": "成都男声，略带沙哑"},
        {"id": "ryan", "name": "Ryan", "lang": "zh", "description": "活力男声，节奏感强"},
        {"id": "aiden", "name": "Aiden", "lang": "zh", "description": "阳光美男，中频清澈"},
        {"id": "ono_anna", "name": "Ono Anna", "lang": "ja", "description": "日语女声，俏皮轻快"},
        {"id": "sohee", "name": "Sohee", "lang": "ko", "description": "韩语女声，温润动情"},
    ]
    return {"voices": voices}

@app.post("/tts")
async def synthesize(req: TtsRequest):
    """文本转语音"""
    if not _engine:
        raise HTTPException(status_code=503, detail="模型未加载")

    try:
        # 创建流
        stream = _engine.create_stream()

        # 配置推理参数
        config = _TTSConfig(
            temperature=req.temperature,
            sub_temperature=req.temperature,
            seed=req.seed,
            sub_seed=req.seed + 1,
            streaming=req.streaming,
        )

        # 使用内置音色合成（如果指定了音色）
        if req.voice and req.voice != "default":
            result = stream.custom(req.text, speaker=req.voice, config=config)
        else:
            result = stream.custom(req.text, speaker='Vivian', config=config)

        # 保存到项目临时目录（与 local-audio:// 协议兼容）
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        tmp_dir = os.path.join(project_root, ".yachiyo", "tmp", "audio")
        os.makedirs(tmp_dir, exist_ok=True)
        tmp_file = os.path.join(tmp_dir, f"tts_{uuid.uuid4().hex[:8]}.wav")
        result.save(tmp_file)

        # 读取音频数据
        with open(tmp_file, "rb") as f:
            audio_data = f.read()

        # 清理临时文件
        os.remove(tmp_file)

        return Response(
            content=audio_data,
            media_type="audio/wav",
            headers={"Content-Disposition": f"attachment; filename=tts_output.wav"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tts/stream")
async def synthesize_stream(req: TtsRequest):
    """流式文本转语音"""
    if not _engine:
        raise HTTPException(status_code=503, detail="模型未加载")

    async def generate():
        try:
            # 创建流
            stream = _engine.create_stream()

            # 配置推理参数（强制流式）
            config = _TTSConfig(
                temperature=req.temperature,
                sub_temperature=req.temperature,
                seed=req.seed,
                sub_seed=req.seed + 1,
                streaming=True,
            )

            # 使用内置音色合成
            if req.voice and req.voice != "default":
                result = stream.custom(req.text, speaker=req.voice, config=config)
            else:
                result = stream.custom(req.text, speaker='Vivian', config=config)

            # 保存到临时文件
            project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
            tmp_dir = os.path.join(project_root, ".yachiyo", "tmp", "audio")
            os.makedirs(tmp_dir, exist_ok=True)
            tmp_file = os.path.join(tmp_dir, f"tts_stream_{uuid.uuid4().hex[:8]}.wav")
            result.save(tmp_file)

            # 读取音频数据并分块发送
            with open(tmp_file, "rb") as f:
                audio_data = f.read()

            # 清理临时文件
            os.remove(tmp_file)

            # 分块发送（每 10KB 一块）
            chunk_size = 10240
            for i in range(0, len(audio_data), chunk_size):
                chunk = audio_data[i:i + chunk_size]
                yield chunk
                await asyncio.sleep(0.01)  # 模拟流式延迟

        except Exception as e:
            print(f"[qwen3-tts] 流式合成失败: {e}", flush=True)
            raise

    return StreamingResponse(
        generate(),
        media_type="audio/wav",
        headers={"Content-Disposition": "attachment; filename=tts_stream.wav"}
    )

@app.post("/clone")
async def clone_voice(req: CloneRequest):
    """声音克隆"""
    if not _engine:
        raise HTTPException(status_code=503, detail="模型未加载")

    if not os.path.exists(req.reference_audio):
        raise HTTPException(status_code=400, detail=f"参考音频不存在: {req.reference_audio}")

    try:
        # 创建流
        stream = _engine.create_stream()

        # 设置参考音频
        stream.set_voice(req.reference_audio)

        # 配置推理参数
        config = _TTSConfig(
            temperature=req.temperature,
            sub_temperature=req.temperature,
            seed=req.seed,
            sub_seed=req.seed + 1,
            streaming=False,
        )

        # 合成（会自动拼接参考文本和目标文本）
        full_text = req.reference_text + req.text
        result = stream.clone(full_text, config=config)
        stream.join()

        # 保存到项目临时目录（与 local-audio:// 协议兼容）
        project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
        tmp_dir = os.path.join(project_root, ".yachiyo", "tmp", "audio")
        os.makedirs(tmp_dir, exist_ok=True)
        tmp_file = os.path.join(tmp_dir, f"tts_clone_{uuid.uuid4().hex[:8]}.wav")
        result.save(tmp_file)

        # 读取音频数据
        with open(tmp_file, "rb") as f:
            audio_data = f.read()

        # 清理临时文件
        os.remove(tmp_file)

        return Response(
            content=audio_data,
            media_type="audio/wav",
            headers={"Content-Disposition": f"attachment; filename=clone_output.wav"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8006)
    parser.add_argument("--model-dir", type=str, default="")
    args = parser.parse_args()

    if args.model_dir:
        os.environ["QWEN_TTS_MODEL_DIR"] = args.model_dir

    uvicorn.run(app, host="0.0.0.0", port=args.port)
