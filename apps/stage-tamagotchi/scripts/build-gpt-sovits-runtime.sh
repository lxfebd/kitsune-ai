#!/usr/bin/env bash
# build-gpt-sovits-runtime.sh — Build GPT-SoVITS Python 3.10+ runtime for macOS/Linux
#
# Usage:
#   ./build-gpt-sovits-runtime.sh
#   PYTHON_VERSION=3.10.11 ./build-gpt-sovits-runtime.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_VERSION="${PYTHON_VERSION:-3.10.11}"
RUNTIME_DIR="${RUNTIME_DIR:-$SCRIPT_DIR/../resources/gpt-sovits/runtime}"

echo "=== Building GPT-SoVITS runtime ==="
echo "Python: $PYTHON_VERSION"
echo "Target: $RUNTIME_DIR"

# Detect platform
OS="$(uname -s)"
case "$OS" in
    Darwin) PLATFORM="macos" ;;
    Linux)  PLATFORM="linux" ;;
    *)      echo "Unsupported platform: $OS"; exit 1 ;;
esac

# Detect arch
ARCH="$(uname -m)"
case "$ARCH" in
    x86_64)  ARCH="x86_64" ;;
    aarch64|arm64) ARCH="aarch64" ;;
    *)       echo "Unsupported arch: $ARCH"; exit 1 ;;
esac

# Clean existing runtime
rm -rf "$RUNTIME_DIR"
mkdir -p "$RUNTIME_DIR"

# Create virtual environment
echo "Creating Python $PYTHON_VERSION virtual environment..."
# Try python3.10 first, then python3, then python
PYTHON_CMD=""
for cmd in python3.10 python3 python; do
    if command -v "$cmd" &>/dev/null; then
        version=$("$cmd" --version 2>&1 | grep -oP '\d+\.\d+\.\d+')
        major=$(echo "$version" | cut -d. -f1)
        minor=$(echo "$version" | cut -d. -f2)
        if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
            PYTHON_CMD="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "ERROR: Python 3.10+ not found. Please install Python 3.10+ first."
    echo "  macOS: brew install python@3.10"
    echo "  Ubuntu: sudo apt install python3.10"
    exit 1
fi

echo "Using: $PYTHON_CMD ($($PYTHON_CMD --version))"

# Create venv
$PYTHON_CMD -m venv "$RUNTIME_DIR"

# Activate
source "$RUNTIME_DIR/bin/activate"

# Upgrade pip
pip install --upgrade pip

# Install required packages
echo "Installing packages..."
pip install \
    "torch>=2.0.0" \
    "torchaudio>=2.0.0" \
    "transformers>=4.30.0" \
    "peft>=0.4.0" \
    "librosa>=0.10.0" \
    "soundfile>=0.12.0" \
    "fastapi>=0.100.0" \
    "uvicorn[standard]>=0.20.0" \
    "huggingface_hub>=0.14.0" \
    "pytorch-lightning>=1.9.0" \
    "kaldi-native-fbank>=1.0.0" \
    "pyyaml>=6.0" \
    "numpy>=1.24.0" \
    "scipy>=1.10.0" \
    "cn2an>=0.5.0" \
    "jieba_fast>=0.53" \
    "pypinyin>=0.49.0" \
    "jieba>=0.42.0" \
    "gruut>=2.0.0" \
    "gruut-ipa>=0.3.0" \
    "jamo>=0.4.1" \
    "g2p-pypinyin>=0.1.0" \
    "pydantic>=2.0.0" \
    "requests>=2.28.0" \
    "tqdm>=4.65.0"

# Verify
echo "=== Verifying runtime ==="
python --version
python -c "import torch, transformers, peft, fastapi, uvicorn, librosa, soundfile, huggingface_hub; print('All packages OK')"

# Clean pip cache
pip cache purge 2>/dev/null || true

# Calculate size
SIZE=$(du -sh "$RUNTIME_DIR" | cut -f1)
echo "=== Runtime built successfully ==="
echo "Location: $RUNTIME_DIR"
echo "Size: $SIZE"
