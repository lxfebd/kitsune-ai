#!/usr/bin/env python3
"""
GPT-SoVITS sidecar — stdin/stdout JSON-RPC mode.

Protocol (see docs/research/sidecar-stdin-stdout.md §5):
  stdin  : Content-Length: N\\r\\n\\r\\n<JSON UTF-8 bytes>
  stdout : JSON 响应使用同样的 Content-Length 帧；
           二进制音频帧使用 0x1F + [4 bytes uint32 LE length] + [float32 LE PCM data]；
           length=0 标记 end-of-stream。
  stderr : 所有日志（绝不能写 stdout — 会破坏协议流）。

Methods:
  tts         — 合成语音，流式输出二进制音频帧 + end-of-stream
  load_model  — 加载 / 重新初始化 GPT-SoVITS 模型
  health      — 返回模型加载状态与采样率
  shutdown    — 优雅退出（由 SidecarService 在 stop 时发送）

无 HTTP、无 FastAPI、无 uvicorn、不占用任何 TCP 端口。

Usage:
  python gptsovits_stdio.py -c GPT_SoVITS/configs/tts_infer.yaml
  PYTHONUNBUFFERED=1 python -u gptsovits_stdio.py
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys
import threading
import time
from typing import Any, Optional

MAGIC_BYTE = b'\x1f'
HEADER_PREFIX = b'Content-Length: '
HEADER_TERMINATOR = b'\r\n\r\n'

# --- 全局状态 ---
_tts_pipeline: Any = None
_config_path: Optional[str] = None
_model_loaded: bool = False
_model_load_error: Optional[str] = None
_sample_rate: int = 32000
# NOTICE: mock 模式在 GPT-SoVITS 未安装时启用，用于协议联调。
# Root cause: 开发环境不一定有 GPT-SoVITS + GPU，但需要验证 stdin/stdout 帧协议。
# Removal condition: CI 环境完整安装 GPT-SoVITS 后可移除 mock 分支。
_mock_mode: bool = False
_load_lock = threading.Lock()


def log(msg: str) -> None:
    """日志输出到 stderr，避免污染 stdout 协议流。"""
    print(f"[gptsovits] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# 帧读写
# ---------------------------------------------------------------------------

def read_content_length(stdin_buf) -> Optional[int]:
    """从 stdin 读取 Content-Length 头部，返回 body 字节长度。

    逐行读取直到空行（\\r\\n），解析 Content-Length 字段。
    stdin 关闭或无 Content-Length 字段时返回 None。
    """
    content_length: Optional[int] = None
    while True:
        line = stdin_buf.readline()
        if not line:
            return None  # EOF — 父进程已关闭 stdin
        if line in (b'\r\n', b'\n'):
            return content_length  # 空行 — header 区结束
        text = line.decode('ascii', errors='ignore').strip()
        if text.lower().startswith('content-length:'):
            try:
                content_length = int(text.split(':', 1)[1].strip())
            except ValueError:
                pass


def write_json(obj: dict) -> None:
    """写一条 JSON-RPC 消息（Content-Length 头 + body）。"""
    payload = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    header = HEADER_PREFIX + str(len(payload)).encode('ascii') + HEADER_TERMINATOR
    stdout = sys.stdout.buffer
    stdout.write(header)
    stdout.write(payload)
    stdout.flush()


def write_audio_frame(pcm_bytes: bytes) -> None:
    """写一帧二进制音频数据（magic 0x1F + 4 bytes length + PCM data）。"""
    stdout = sys.stdout.buffer
    stdout.write(MAGIC_BYTE)
    stdout.write(struct.pack('<I', len(pcm_bytes)))
    stdout.write(pcm_bytes)
    stdout.flush()


def write_end_of_stream() -> None:
    """写 end-of-stream 标记（length=0 的二进制帧）。"""
    stdout = sys.stdout.buffer
    stdout.write(MAGIC_BYTE)
    stdout.write(struct.pack('<I', 0))
    stdout.flush()


# ---------------------------------------------------------------------------
# 模型加载
# ---------------------------------------------------------------------------

def do_load_model(config_path: Optional[str] = None) -> bool:
    """加载或重新初始化 GPT-SoVITS 模型。线程安全。"""
    global _tts_pipeline, _config_path, _model_loaded, _model_load_error, _sample_rate, _mock_mode

    with _load_lock:
        _model_loaded = False
        _model_load_error = None
        path = config_path or _config_path
        if not path:
            _model_load_error = 'no config path provided'
            log(_model_load_error)
            return False

        _config_path = path
        t0 = time.time()
        try:
            # NOTICE: GPT-SoVITS 的 TTS_infer_pack 需要在 PYTHONPATH 中。
            # 实际部署时 GPT-SoVITS 仓库根目录应已加入 sys.path 或通过 pip 安装。
            # Removal condition: GPT-SoVITS 发布 pip 包后可直接 import。
            from GPT_SoVITS.TTS_infer_pack.TTS import TTS, TTS_Config

            _tts_config = TTS_Config(path)
            _tts_pipeline = TTS(_tts_config)
            _sample_rate = _tts_config.sampling_rate
            _mock_mode = False
            _model_loaded = True
            elapsed = time.time() - t0
            log(f'model loaded: sample_rate={_sample_rate}, elapsed={elapsed:.1f}s')
            return True
        except ImportError:
            # GPT-SoVITS 未安装 — 进入 mock 模式，用于协议联调
            log('GPT-SoVITS not available, running in mock mode')
            _tts_pipeline = None
            _mock_mode = True
            _sample_rate = 32000
            _model_loaded = True
            return True
        except Exception as e:
            _model_load_error = str(e)
            log(f'model load failed: {e}')
            return False


# ---------------------------------------------------------------------------
# 请求处理
# ---------------------------------------------------------------------------

def handle_request(request: dict) -> None:
    method = request.get('method')
    req_id = request.get('id')
    params = request.get('params') or {}

    if method == 'health':
        write_json({
            'jsonrpc': '2.0', 'id': req_id,
            'result': {
                'model_loaded': _model_loaded,
                'load_error': _model_load_error,
                'sample_rate': _sample_rate,
                'config_path': _config_path,
                'mock_mode': _mock_mode,
            },
        })
    elif method == 'load_model':
        config_path = params.get('config_path') or _config_path
        success = do_load_model(config_path)
        write_json({
            'jsonrpc': '2.0', 'id': req_id,
            'result': {'loaded': success, 'error': _model_load_error},
        })
    elif method == 'tts':
        handle_tts(request)
    elif method == 'shutdown':
        write_json({'jsonrpc': '2.0', 'id': req_id, 'result': {'ok': True}})
        log('shutdown requested, exiting')
        os._exit(0)
    else:
        write_json({
            'jsonrpc': '2.0', 'id': req_id,
            'error': {'code': -32601, 'message': f'method not found: {method}'},
        })


def handle_tts(request: dict) -> None:
    req_id = request.get('id')
    params = request.get('params') or {}

    if not _model_loaded:
        write_json({
            'jsonrpc': '2.0', 'id': req_id,
            'error': {'code': -32000, 'message': 'model not loaded'},
        })
        return

    text = (params.get('text') or '').strip()
    if not text:
        write_json({
            'jsonrpc': '2.0', 'id': req_id,
            'error': {'code': -32602, 'message': 'text is empty'},
        })
        return

    # 发送 started 响应 — SidecarService.sendRequest 在此处 resolve，
    # 之后 adapter 等待二进制音频帧 + end-of-stream
    write_json({
        'jsonrpc': '2.0', 'id': req_id,
        'result': {'status': 'started', 'sampleRate': _sample_rate},
    })

    try:
        if _mock_mode:
            _mock_stream(text)
        else:
            _run_gptsovits(text, params)

        write_end_of_stream()
        write_json({
            'jsonrpc': '2.0', 'method': 'tts/finished',
            'params': {'requestId': req_id},
        })
    except Exception as e:
        log(f'tts error: {e}')
        # NOTICE: 即使出错也要发 end-of-stream，否则 adapter 会一直等待帧而卡死。
        # Root cause: adapter 的 runTtsStream 用 Promise.race 等待 endOfStream，
        # 不发 EOS 会导致请求超时才释放，而非立即失败。
        # Removal condition: adapter 改为支持纯错误通知（无 EOS）解除阻塞时可移除。
        write_end_of_stream()
        write_json({
            'jsonrpc': '2.0', 'method': 'tts/error',
            'params': {'requestId': req_id, 'message': str(e)},
        })


def _run_gptsovits(text: str, params: dict) -> None:
    """调用 GPT-SoVITS tts_pipeline.run，逐 chunk 输出 float32 PCM 帧。"""
    tts_req = {
        'text': text,
        'text_lang': params.get('text_lang', 'zh'),
        'ref_audio_path': params.get('ref_audio_path', ''),
        'prompt_text': params.get('prompt_text', ''),
        'prompt_lang': params.get('prompt_lang', 'zh'),
        'text_split_method': params.get('text_split_method', 'cut5'),
        'batch_size': params.get('batch_size', 1),
        'media_type': 'raw',
        'streaming_mode': params.get('streaming_mode', 2),
        'speed_factor': params.get('speed_factor', 1.0),
    }

    import numpy as np

    for chunk in _tts_pipeline.run(tts_req):
        # GPT-SoVITS api_v2.py 的 generator 产出 (audio_ndarray, sample_rate) 元组
        audio = chunk[0] if isinstance(chunk, (tuple, list)) else chunk
        if audio is None or len(audio) == 0:
            continue
        # int16 PCM → float32，与 Qwen3TTSAdapter 的 PCM 格式保持一致
        audio_f32 = audio.astype('float32')
        if audio_f32.dtype == np.float32 and audio_f32.max(initial=0) > 1.0:
            audio_f32 = audio_f32 / 32768.0
        write_audio_frame(audio_f32.tobytes())


def _mock_stream(text: str) -> None:
    """Mock 模式：生成静音 float32 PCM，用于无 GPT-SoVITS 环境的协议联调。"""
    import numpy as np

    duration = len(text) * 0.1  # 每字符 100ms
    total_samples = int(_sample_rate * duration)
    chunk_size = max(1, _sample_rate // 10)  # 100ms / chunk
    for i in range(0, total_samples, chunk_size):
        n = min(chunk_size, total_samples - i)
        chunk = np.zeros(n, dtype='float32')
        write_audio_frame(chunk.tobytes())


# ---------------------------------------------------------------------------
# 主循环
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description='GPT-SoVITS stdin/stdout sidecar')
    parser.add_argument('-c', '--config', type=str, default=None,
                        help='GPT-SoVITS tts_infer.yaml config path')
    args = parser.parse_args()

    global _config_path
    _config_path = args.config

    # 后台加载模型 — 不阻塞 stdin 循环，health 可查询加载状态
    load_thread = threading.Thread(target=do_load_model, args=(args.config,), daemon=True)
    load_thread.start()

    log(f'sidecar started, config={_config_path}')

    # 通知父进程 sidecar 已就绪（非必须，adapter 不依赖此通知）
    write_json({
        'jsonrpc': '2.0', 'method': 'ready',
        'params': {'config': _config_path},
    })

    stdin_buf = sys.stdin.buffer
    while True:
        length = read_content_length(stdin_buf)
        if length is None:
            log('stdin closed or invalid header, exiting')
            break
        body = stdin_buf.read(length)
        if not body or len(body) < length:
            log('incomplete body, exiting')
            break
        try:
            request = json.loads(body.decode('utf-8'))
        except json.JSONDecodeError as e:
            log(f'json decode error: {e}')
            continue
        handle_request(request)

    log('sidecar shutdown')


if __name__ == '__main__':
    main()
