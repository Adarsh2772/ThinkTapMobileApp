"""Build splash assets that are not cropped on Android's circular splash mask."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

BASE = Path(r"d:\Project\ThinkTap\assets\images")
ANDROID_RES = Path(r"d:\Project\ThinkTap\android\app\src\main\res")
SIZE = 1024
BG = (255, 255, 255, 255)

DENSITY_SIZES = {
    "drawable-mdpi": 240,
    "drawable-hdpi": 360,
    "drawable-xhdpi": 480,
    "drawable-xxhdpi": 720,
    "drawable-xxxhdpi": 960,
}


def fit_on_canvas(src: Image.Image, size: int, scale: float) -> Image.Image:
    src = src.convert("RGBA")
    side = max(src.width, src.height)
    squared = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    squared.paste(src, ((side - src.width) // 2, (side - src.height) // 2), src)
    max_side = int(size * scale)
    fitted = squared.copy()
    fitted.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), BG)
    canvas.paste(
        fitted,
        ((size - fitted.width) // 2, (size - fitted.height) // 2),
        fitted,
    )
    return canvas


def main() -> None:
    src_path = BASE / "HTOS Logo.png"
    if not src_path.exists():
        src_path = BASE / "ThinkTap Logo.png"
    print("source:", src_path.name)

    src = Image.open(src_path).convert("RGBA")
    # Brand file is full-bleed square. Cut after ThinkTap wordmark (gap ~y=975),
    # before HTOS/tagline — those get clipped by Android's circular splash mask.
    keep_h = 990
    compact = src.crop((0, 0, src.width, keep_h))
    print("compact", compact.size)

    # Scale down so content sits inside the Android splash safe circle.
    splash = fit_on_canvas(compact, SIZE, scale=0.60)
    splash.convert("RGB").save(BASE / "splash-icon.png", "PNG", optimize=True)
    print("wrote splash-icon.png")

    # Full logo reference with even more margin
    fit_on_canvas(src, SIZE, scale=0.55).convert("RGB").save(
        BASE / "splash-thinktap.png", "PNG", optimize=True
    )
    print("wrote splash-thinktap.png")

    for folder, px in DENSITY_SIZES.items():
        dest_dir = ANDROID_RES / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        icon = splash.copy()
        icon.thumbnail((px, px), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (px, px), BG)
        canvas.paste(icon, ((px - icon.width) // 2, (px - icon.height) // 2), icon)
        canvas.convert("RGB").save(dest_dir / "splashscreen_logo.png", "PNG", optimize=True)
        print("wrote", folder, px)


if __name__ == "__main__":
    main()
