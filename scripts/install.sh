#!/usr/bin/env bash
set -euo pipefail

REPO="YOUR_ORG/openclaw-installer"
BINARY_PREFIX="openclaw-install"

detect_platform() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  case "$os" in
    Darwin) os="darwin" ;;
    Linux)  os="linux"  ;;
    MINGW*|MSYS*|CYGWIN*) os="win32" ;;
    *)
      echo "Error: unsupported OS: $os" >&2
      exit 1
      ;;
  esac

  case "$arch" in
    x86_64|amd64) arch="x64"   ;;
    arm64|aarch64) arch="arm64" ;;
    *)
      echo "Error: unsupported architecture: $arch" >&2
      exit 1
      ;;
  esac

  echo "${os}-${arch}"
}

main() {
  local platform binary_name download_url tmp_dir

  platform="$(detect_platform)"
  binary_name="${BINARY_PREFIX}-${platform}"
  download_url="https://github.com/${REPO}/releases/latest/download/${binary_name}"

  echo "Detected platform: ${platform}"
  echo "Downloading ${binary_name}..."

  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' EXIT

  if command -v curl &>/dev/null; then
    curl -fsSL -o "${tmp_dir}/${binary_name}" "$download_url"
  elif command -v wget &>/dev/null; then
    wget -q -O "${tmp_dir}/${binary_name}" "$download_url"
  else
    echo "Error: curl or wget is required." >&2
    exit 1
  fi

  chmod +x "${tmp_dir}/${binary_name}"
  echo "Running installer..."
  exec "${tmp_dir}/${binary_name}" "$@"
}

main "$@"
