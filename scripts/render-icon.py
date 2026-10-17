"""生成 Marketplace 图标。依赖 Pillow，仅用于维护仓库内的静态图标。"""

from pathlib import Path

from PIL import Image, ImageDraw


SIZE = 256
SCALE = 4
ROOT = Path(__file__).resolve().parent.parent


def scaled(value: float) -> int:
    return round(value * SCALE)


def main() -> None:
    image = Image.new("RGB", (SIZE * SCALE, SIZE * SCALE), "#17223B")
    draw = ImageDraw.Draw(image)

    draw.rounded_rectangle(
        (0, 0, SIZE * SCALE - 1, SIZE * SCALE - 1),
        radius=scaled(54),
        fill="#17223B",
    )
    draw.rounded_rectangle(
        (scaled(58), scaled(46), scaled(190), scaled(210)),
        radius=scaled(16),
        fill="#F4F1E8",
    )
    draw.polygon(
        [(scaled(154), scaled(46)), (scaled(190), scaled(82)), (scaled(154), scaled(82))],
        fill="#D9D2C3",
    )
    draw.rounded_rectangle(
        (scaled(84), scaled(112), scaled(158), scaled(124)),
        radius=scaled(6),
        fill="#17223B",
    )
    draw.rounded_rectangle(
        (scaled(84), scaled(142), scaled(138), scaled(154)),
        radius=scaled(6),
        fill="#17223B",
    )

    line_width = scaled(8)
    draw.line(
        [(scaled(160), scaled(169)), (scaled(160), scaled(149)), (scaled(144), scaled(149))],
        fill="#D89A32",
        width=line_width,
        joint="curve",
    )
    draw.ellipse(
        (scaled(151), scaled(169), scaled(169), scaled(187)),
        fill="#D89A32",
    )
    draw.polygon(
        [
            (scaled(204), scaled(94)),
            (scaled(210.5), scaled(110.5)),
            (scaled(227), scaled(117)),
            (scaled(210.5), scaled(123.5)),
            (scaled(204), scaled(140)),
            (scaled(197.5), scaled(123.5)),
            (scaled(181), scaled(117)),
            (scaled(197.5), scaled(110.5)),
        ],
        fill="#3DA6A0",
    )

    image.resize((SIZE, SIZE), Image.Resampling.LANCZOS).save(ROOT / "media" / "icon.png")


if __name__ == "__main__":
    main()
