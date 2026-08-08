"""Validate and locally normalize the clicker's transparent character PNGs.

This tool intentionally has no network or image-generation step. Generation and
background removal are handled before the project receives an asset; this file
only makes a local copy fit the game's fixed canvas and checks its alpha edges.

Examples:
    python tools/make_art.py
    python tools/make_art.py assets/models/girl1.png assets/models/girl2.png
    python tools/make_art.py --normalize --output-dir art_staging/normalized assets/models
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
MODELS = ROOT / "assets" / "models"
EXPECTED_SIZE = (1024, 1536)
PADDING = 24


def image_paths(inputs: Iterable[Path]) -> list[Path]:
    paths: list[Path] = []
    for item in inputs:
        if item.is_dir():
            paths.extend(sorted(item.glob("girl*.png")))
        elif item.is_file():
            paths.append(item)
        else:
            raise FileNotFoundError(item)
    return paths


def normalize(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    if rgba.size == EXPECTED_SIZE:
        return rgba

    rgba.thumbnail((EXPECTED_SIZE[0] - PADDING * 2, EXPECTED_SIZE[1] - PADDING * 2), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", EXPECTED_SIZE, (0, 0, 0, 0))
    offset = ((EXPECTED_SIZE[0] - rgba.width) // 2, (EXPECTED_SIZE[1] - rgba.height) // 2)
    canvas.alpha_composite(rgba, offset)
    return canvas


def validate(path: Path, image: Image.Image) -> None:
    if image.mode != "RGBA":
        raise ValueError(f"{path}: expected RGBA, got {image.mode}")
    if image.size != EXPECTED_SIZE:
        raise ValueError(f"{path}: expected {EXPECTED_SIZE}, got {image.size}")

    alpha = image.getchannel("A")
    if alpha.getbbox() is None:
        raise ValueError(f"{path}: image has no opaque content")

    corners = [alpha.getpixel(point) for point in [(0, 0), (image.width - 1, 0), (0, image.height - 1), (image.width - 1, image.height - 1)]]
    if any(corners):
        raise ValueError(f"{path}: all canvas corners must be transparent")

    green_residual = sum(
        1
        for red, green, blue, opacity in image.get_flattened_data()
        if opacity > 8 and green > 210 and red < 80 and blue < 80
    )
    if green_residual:
        raise ValueError(f"{path}: found {green_residual} possible chroma-key pixels")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("inputs", nargs="*", type=Path, help="PNG files or directories; defaults to assets/models")
    parser.add_argument("--normalize", action="store_true", help="fit each input into the fixed transparent canvas")
    parser.add_argument("--output-dir", type=Path, help="destination directory required by --normalize")
    args = parser.parse_args()

    if args.normalize and args.output_dir is None:
        parser.error("--output-dir is required with --normalize")

    paths = image_paths(args.inputs or [MODELS])
    if not paths:
        parser.error("no girl*.png files found")

    for source in paths:
        image = Image.open(source)
        target = source
        if args.normalize:
            target = args.output_dir / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            image = normalize(image)
            image.save(target, format="PNG", optimize=True)
            image = Image.open(target)
        else:
            image = image.convert("RGBA")

        validate(target, image)
        print(f"[ok] {target}: {image.size}, {image.mode}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
