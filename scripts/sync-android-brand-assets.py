"""Generate Android mipmap/drawable icon and splash assets from brand images."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(r"d:\Project\ThinkTap")
ASSETS = ROOT / "assets" / "images"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# Android density multipliers
DENSITIES = {
    "mdpi": 1,
    "hdpi": 1.5,
    "xhdpi": 2,
    "xxhdpi": 3,
    "xxxhdpi": 4,
}

# Adaptive icon canvas is 108dp
ADAPTIVE_DP = 108
# Legacy launcher icon
LEGACY_DP = 48
# Splash imageWidth from app.json
SPLASH_DP = 280


def save_webp(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "WEBP", quality=90)


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")


def resize(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    icon = Image.open(ASSETS / "icon.png").convert("RGBA")
    foreground = Image.open(ASSETS / "android-icon-foreground.png").convert("RGBA")
    background = Image.open(ASSETS / "android-icon-background.png").convert("RGBA")
    monochrome = Image.open(ASSETS / "android-icon-monochrome.png").convert("RGBA")
    splash = Image.open(ASSETS / "splash-icon.png").convert("RGBA")

    # Make splash logo transparent around near-white so only the mark shows
    splash_px = splash.load()
    for y in range(splash.height):
        for x in range(splash.width):
            r, g, b, a = splash_px[x, y]
            if r >= 250 and g >= 250 and b >= 250:
                splash_px[x, y] = (255, 255, 255, 0)

    for name, mult in DENSITIES.items():
        adaptive_px = int(round(ADAPTIVE_DP * mult))
        legacy_px = int(round(LEGACY_DP * mult))
        splash_px_size = int(round(SPLASH_DP * mult))

        mipmap = RES / f"mipmap-{name}"
        save_webp(resize(foreground, adaptive_px), mipmap / "ic_launcher_foreground.webp")
        save_webp(resize(background, adaptive_px), mipmap / "ic_launcher_background.webp")
        save_webp(resize(monochrome, adaptive_px), mipmap / "ic_launcher_monochrome.webp")
        save_webp(resize(icon, legacy_px), mipmap / "ic_launcher.webp")
        save_webp(resize(icon, legacy_px), mipmap / "ic_launcher_round.webp")

        drawable = RES / f"drawable-{name}"
        # Splash logos are not forced square — keep aspect, fit within splash_px_size
        s = splash.copy()
        s.thumbnail((splash_px_size, splash_px_size), Image.Resampling.LANCZOS)
        save_png(s, drawable / "splashscreen_logo.png")
        print(f"{name}: adaptive={adaptive_px} legacy={legacy_px} splash={s.size}")

    colors = RES / "values" / "colors.xml"
    colors.write_text(
        """<resources>
  <color name="splashscreen_background">#ffffff</color>
  <color name="iconBackground">#ffffff</color>
  <color name="colorPrimary">#023c69</color>
</resources>
""",
        encoding="utf-8",
    )
    print("updated colors.xml")


if __name__ == "__main__":
    main()
