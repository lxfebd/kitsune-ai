"""
Sidecar 统一网关
管理 TTS 服务的启动和路由。

端点：
- GET  /health              — 网关健康检查
- /tts/*                    — TTS 服务路由（代理到 qwen3_server）

启动方式：
    python gateway.py                          # 默认 port 5000
    SIDECAR_PORT=5000 python gateway.py

依赖：
    pip install fastapi uvicorn
"""

from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 确保当前目录在 Python 路径中
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from qwen3_server import app as tts_app


# ══════════════════════════════════════════════════════════════════════════════
# 全局配置
# ══════════════════════════════════════════════════════════════════════════════

PORT = int(os.environ.get("SIDECAR_PORT", "5000"))
HOST = os.environ.get("SIDECAR_HOST", "127.0.0.1")


# ══════════════════════════════════════════════════════════════════════════════
# FastAPI 应用
# ══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    print(f"[Sidecar Gateway] 网关启动，监听 {HOST}:{PORT}")
    yield
    print("[Sidecar Gateway] 网关关闭")


app = FastAPI(
    title="Pet-Agent Sidecar Gateway",
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

# 挂载 TTS 服务路由
app.mount("/tts", tts_app)


# ══════════════════════════════════════════════════════════════════════════════
# API 路由
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    """网关健康检查"""
    return {"status": "healthy", "services": ["tts"]}


# ══════════════════════════════════════════════════════════════════════════════
# 启动入口
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print(f"[Sidecar Gateway] Starting server on {HOST}:{PORT}")
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
