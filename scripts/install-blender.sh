#!/usr/bin/env bash
# Installs a portable Blender LTS build into ~/.local (idempotent).
# Usage: scripts/install-blender.sh   (override version with BLENDER_VERSION=4.5.14)
set -euo pipefail

BLENDER_VERSION="${BLENDER_VERSION:-4.5.14}"
SERIES="${BLENDER_VERSION%.*}"
PREFIX="${HOME}/.local/opt/blender-${BLENDER_VERSION}"
BIN_DIR="${HOME}/.local/bin"

if command -v blender >/dev/null 2>&1; then
  echo "blender already available: $(blender --version 2>/dev/null | head -1)"
  exit 0
fi

if [ ! -x "${PREFIX}/blender" ]; then
  echo "Installing Blender ${BLENDER_VERSION} into ${PREFIX}..."
  mkdir -p "${PREFIX}"
  url="https://download.blender.org/release/Blender${SERIES}/blender-${BLENDER_VERSION}-linux-x64.tar.xz"
  curl -fsSL "${url}" | tar -xJ --strip-components=1 -C "${PREFIX}"
fi

mkdir -p "${BIN_DIR}"
ln -sf "${PREFIX}/blender" "${BIN_DIR}/blender"
echo "blender installed: $("${BIN_DIR}/blender" --version 2>/dev/null | head -1)"
