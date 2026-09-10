"""Prepare ThinkTap app icon and splash assets from brand logos."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

BASE = Path(r"d:\Project\ThinkTap\assets\images")
HTOS_PATH = BASE / "HTOS Logo.png"
THINKTAP_PATH = BASE / "ThinkTap Logo.png"
SIZE = 1024


def is_content(pixel: tuple[int, int, int, int]) -> bool:
    r, g, b, _a = pixel
    if r >= 245 and g >= 245 and b >= 245:
        return False
    if r >= 240 and g >= 240 and b >= 240 and abs(r - g) < 5 and abs(g - b) < 5:
        return False
    return True


def row_counts(img: Image.Image) -> list[int]:
    w, h = img.size
    pixels = img.load()
    return [sum(1 for x in range(w) if is_content(pixels[x, y])) for y in range(h)]


def find_icon_box(img: Image.Image) -> tuple[int, int, int, int]:
    """Find content bbox around the circular mark only (exclude wordmark)."""
    counts = row_counts(img)
    threshold = 40
    start = next(y for y, c in enumerate(counts) if c > threshold)

    # End at the first sustained gap before the "ThinkTap" wordmark
    sparse_run = 0
    end = start
    for y in range(start, img.height):
        if counts[y] <= 15:
            sparse_run += 1
            if sparse_run >= 8:
                end = y - sparse_run + 1
                break
        else:
            sparse_run = 0
            end = y + 1

    pixels = img.load()
    xs = [
        x
        for y in range(start, end)
        for x in range(img.width)
        if is_content(pixels[x, y])
    ]
    x0, x1 = min(xs), max(xs) + 1
    pad = 24
    left = max(0, x0 - pad)
    top = max(0, start - pad)
    right = min(img.width, x1 + pad)
    bottom = min(end + pad, end)  # never extend into wordmark gap
    # Keep bottom at end (icon only); square padding happens on canvas later
    bottom = end

    print(f"icon rows {start}-{end}, box={(left, top, right, bottom)}")
    return left, top, right, bottom


def make_transparent(img: Image.Image, threshold: int = 245) -> Image.Image:
    img = img.convert("RGBA")
    pixels = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (r, g, b, 0)
            elif r >= threshold - 8 and g >= threshold - 8 and b >= threshold - 8:
                fade = max(r, g, b) - (threshold - 8)
                alpha = max(0, min(255, int(255 * (1 - fade / 8))))
                pixels[x, y] = (r, g, b, alpha)
    return img


def fit_on_canvas(
    src: Image.Image,
    size: int,
    *,
    background: tuple[int, int, int, int] | None,
    scale: float = 0.78,
) -> Image.Image:
    if background is None:
        canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    else:
        canvas = Image.new("RGBA", (size, size), background)

    src = src.convert("RGBA")
    # Pad source to square with transparent pixels first so aspect isn't distorted
    side = max(src.width, src.height)
    squared = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    squared.paste(src, ((side - src.width) // 2, (side - src.height) // 2), src)

    max_side = int(size * scale)
    fitted = squared.copy()
    fitted.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    x = (size - fitted.width) // 2
    y = (size - fitted.height) // 2
    canvas.paste(fitted, (x, y), fitted)
    return canvas


def main() -> None:
    htos = Image.open(HTOS_PATH).convert("RGBA")
    thinktap = Image.open(THINKTAP_PATH).convert("RGBA")

    box = find_icon_box(htos)
    icon_crop = htos.crop(box)
    icon_transparent = make_transparent(icon_crop)

    icon = fit_on_canvas(icon_transparent, SIZE, background=(255, 255, 255, 255), scale=0.88)
    icon.convert("RGB").save(BASE / "icon.png", "PNG")
    print("wrote icon.png")

    foreground = fit_on_canvas(icon_transparent, SIZE, background=None, scale=0.68)
    foreground.save(BASE / "android-icon-foreground.png", "PNG")
    print("wrote android-icon-foreground.png")

    Image.new("RGB", (SIZE, SIZE), (255, 255, 255)).save(BASE / "android-icon-background.png", "PNG")
    print("wrote android-icon-background.png")

    mono = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mono_src = fit_on_canvas(icon_transparent, SIZE, background=None, scale=0.68)
    mono_pixels = mono.load()
    src_pixels = mono_src.load()
    for y in range(SIZE):
        for x in range(SIZE):
            if src_pixels[x, y][3] > 40:
                mono_pixels[x, y] = (0, 0, 0, 255)
    mono.save(BASE / "android-icon-monochrome.png", "PNG")
    print("wrote android-icon-monochrome.png")

    # Splash: prefer full HTOS branding; fall back composition uses ThinkTap logo
    splash_src = make_transparent(htos)
    splash = fit_on_canvas(splash_src, SIZE, background=(255, 255, 255, 255), scale=0.9)
    splash.convert("RGB").save(BASE / "splash-icon.png", "PNG")
    print("wrote splash-icon.png")

    # Also prepare ThinkTap full logo splash variant for reference
    tt_splash = fit_on_canvas(
        make_transparent(thinktap), SIZE, background=(255, 255, 255, 255), scale=0.9
    )
    tt_splash.convert("RGB").save(BASE / "splash-thinktap.png", "PNG")
    print("wrote splash-thinktap.png")

    fav = fit_on_canvas(icon_transparent, 48, background=(255, 255, 255, 255), scale=0.92)
    fav.convert("RGB").save(BASE / "favicon.png", "PNG")
    print("wrote favicon.png")

    make_transparent(htos).save(BASE / "htos-logo.png", "PNG")
    make_transparent(thinktap).save(BASE / "thinktap-logo.png", "PNG")
    print("wrote htos-logo.png, thinktap-logo.png")


if __name__ == "__main__":
    main()
