#!/bin/sh
# Install the share-the-mark CLI from its GitHub Releases.
#
#   curl -fsSL https://raw.githubusercontent.com/mpecan/share-the-mark/main/install.sh | sh
#
# Options (env): SHARE_THE_MARK_BIN_DIR (install dir, default ~/.local/bin),
# SHARE_THE_MARK_VERSION (tag, default the latest cli-v* release). For Windows,
# use `cargo binstall share-the-mark` or grab the .zip from the Releases page.
set -eu

REPO="mpecan/share-the-mark"
BIN="share-the-mark"
DEST="${SHARE_THE_MARK_BIN_DIR:-$HOME/.local/bin}"

die() {
  echo "install.sh: $1" >&2
  exit 1
}

os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Linux) os_part="unknown-linux-gnu" ;;
  Darwin) os_part="apple-darwin" ;;
  *) die "unsupported OS '$os' — use 'cargo binstall $BIN' or the Releases page" ;;
esac
case "$arch" in
  x86_64 | amd64) arch_part="x86_64" ;;
  arm64 | aarch64) arch_part="aarch64" ;;
  *) die "unsupported architecture '$arch'" ;;
esac
target="${arch_part}-${os_part}"

version="${SHARE_THE_MARK_VERSION:-}"
if [ -z "$version" ]; then
  version="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" |
    grep -m1 '"tag_name"' | cut -d'"' -f4)"
fi
[ -n "$version" ] || die "could not determine the latest release — set SHARE_THE_MARK_VERSION"

archive="${BIN}-${target}.tar.gz"
# The checksum is named after the archive base name, not the full archive.
checksum="${BIN}-${target}.sha256"
base="https://github.com/$REPO/releases/download/$version"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading $BIN $version ($target)…"
curl -fsSL "$base/$archive" -o "$tmp/$archive" || die "download failed: $base/$archive"

# Best-effort checksum verification (skipped if no sha256 tool is available).
if curl -fsSL "$base/$checksum" -o "$tmp/$checksum" 2>/dev/null; then
  expected="$(cut -d' ' -f1 <"$tmp/$checksum")"
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$tmp/$archive" | cut -d' ' -f1)"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$tmp/$archive" | cut -d' ' -f1)"
  else
    actual="$expected"
  fi
  [ "$expected" = "$actual" ] || die "checksum mismatch for $archive"
fi

tar -xzf "$tmp/$archive" -C "$tmp"
mkdir -p "$DEST"
install -m 0755 "$tmp/$BIN" "$DEST/$BIN"
echo "Installed $BIN to $DEST/$BIN"

case ":$PATH:" in
  *":$DEST:"*) ;;
  *) echo "Note: $DEST is not on your PATH — add it to use '$BIN' directly." ;;
esac
