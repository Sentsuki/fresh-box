#!/usr/bin/env python3
# gen-ico.py —— 从 src-tauri/icons/icon.png 生成 Windows 用的 icon.ico。
#
# 为什么不用 `tauri icon` 生成的那份：它只放 16/24/32/48/64/256 六帧。Windows
# 在 125%/150%/175% 缩放下要的是 20/30/36/40/60/72/80/96 这些尺寸（开始菜单、
# 任务栏、Alt+Tab、资源管理器各取各的），缺哪一帧系统就拿相邻的一帧现场缩放，
# 有的路径缩得很粗糙 —— 开始菜单「有时候」发糊就是这么来的。这里按 Windows
# 图标规范把整套尺寸都放进去，每帧都从 512 的原图用 Lanczos 单独缩出来。
#
# 帧格式：256 用 PNG，其余用 32 位 BMP（带 AND 掩码）—— 这是 Windows 自己的
# 图标约定，所有加载路径（LoadImage、资源编译器、NSIS、旧版 shell）都认。
#
# 第一帧放 32×32：tauri-codegen 只取 icon.ico 的第一帧当 `default_window_icon`
# 编进二进制（见 src-tauri/src/app_icon.rs 的模块注释），放 256 会白白多出
# 256 KB 的 RGBA。
#
# 注意 `pnpm tauri icon` 会重写 icon.ico，跑完它之后要再跑一次本脚本。
#
# 依赖 Pillow：pip install pillow
# 用法：pnpm gen:ico

import io
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src-tauri" / "icons" / "icon.png"
DST = ROOT / "src-tauri" / "icons" / "icon.ico"

# 32 必须排第一，见文件头。
SIZES = [32, 16, 20, 24, 30, 36, 40, 48, 60, 64, 72, 80, 96, 128, 256]


def bmp_frame(img: Image.Image) -> bytes:
    """32 位 BMP 图标帧：BITMAPINFOHEADER（高度 ×2）+ 自下而上的 BGRA + 1 位 AND 掩码。"""
    w, h = img.size
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    px = img.load()
    xor = bytearray()
    for y in range(h - 1, -1, -1):
        for x in range(w):
            r, g, b, a = px[x, y]
            xor += bytes((b, g, r, a))
    # AND 掩码每行按 32 位对齐；全透明像素置 1。
    row_bytes = ((w + 31) // 32) * 4
    mask = bytearray()
    for y in range(h - 1, -1, -1):
        row = bytearray(row_bytes)
        for x in range(w):
            if px[x, y][3] == 0:
                row[x // 8] |= 0x80 >> (x % 8)
        mask += row
    return header + bytes(xor) + bytes(mask)


def png_frame(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    if src.size[0] < max(SIZES) or src.size[0] != src.size[1]:
        raise SystemExit(f"{SRC} 必须是不小于 {max(SIZES)} 的正方形，实际 {src.size}")

    frames = []
    for size in SIZES:
        img = src.resize((size, size), Image.LANCZOS)
        data = png_frame(img) if size >= 256 else bmp_frame(img)
        frames.append((size, data))

    out = bytearray(struct.pack("<HHH", 0, 1, len(frames)))
    offset = 6 + 16 * len(frames)
    for size, data in frames:
        dim = 0 if size >= 256 else size
        out += struct.pack("<BBBBHHII", dim, dim, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    for _, data in frames:
        out += data

    DST.write_bytes(out)
    print(f"wrote {DST.relative_to(ROOT)}: {len(frames)} frames, {len(out) // 1024} KB")


if __name__ == "__main__":
    main()
