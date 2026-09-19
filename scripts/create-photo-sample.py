from pathlib import Path
from tempfile import NamedTemporaryFile

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
CHILD_IMAGE = OUTPUT_DIR / "imaginary-child-explorer.jpg"
OUTPUT_PDF = OUTPUT_DIR / "TripQuest-Sample-With-Imaginary-Child.pdf"
FONT_REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def create_raster_cover(path: Path) -> None:
    width, height = 1190, 1684
    scale = 2
    paper = "#fcf9f1"
    image = Image.new("RGB", (width, height), paper)
    draw = ImageDraw.Draw(image)
    regular = lambda size: ImageFont.truetype(FONT_REGULAR, size * scale)
    bold = lambda size: ImageFont.truetype(FONT_BOLD, size * scale)

    def rect(x: float, y: float, w: float, h: float, fill: str) -> None:
        draw.rectangle((x * scale, height - (y + h) * scale, (x + w) * scale, height - y * scale), fill=fill)

    def text(x: float, y: float, value: str, font: ImageFont.FreeTypeFont, fill: str) -> None:
        draw.text((x * scale, height - y * scale - font.size), value, font=font, fill=fill)

    rect(0, 825, 595, 16, "#e85640")
    rect(44, 706, 168, 30, "#133f3b")
    text(56, 716, "TRIPQUEST EXPLORER BOOK", bold(9), "#ffffff")
    text(44, 665, "A trip made for curious hands", regular(13), "#e85640")
    text(44, 615, "Singapore", bold(43), "#133f3b")
    text(44, 520, "Garden city clues and neighborhood stories", bold(18), "#2a8d96")

    rect(44, 446, 46, 22, "#fff5c7")
    text(55, 453, "AGE 7", bold(8), "#133f3b")
    rect(130, 446, 123, 22, "#e8f1dc")
    text(141, 453, "5 ADVENTURE DAYS", bold(8), "#133f3b")

    rect(318, 270, 220, 205, "#e0f2f2")
    child = Image.open(CHILD_IMAGE).convert("RGB")
    child.thumbnail((184 * scale, 168 * scale), Image.Resampling.LANCZOS)
    image.paste(child, (int((318 + (220 - child.width / scale) / 2) * scale), int(height - (295 + (168 - child.height / scale) / 2 + child.height / scale) * scale)))
    text(347, 280, "FICTIONAL SAMPLE ILLUSTRATION", bold(6), "#2a8d96")

    text(44, 345, "THIS BOOK BELONGS TO", bold(9), "#596b68")
    text(44, 267, "TRIP DATES", bold(9), "#596b68")
    rect(44, 84, 507, 90, "#fbe3dc")
    text(62, 140, "PACK A PENCIL. NOTICE EVERYTHING.", bold(11), "#e85640")
    text(62, 116, "Games, drawing spaces, local clues, and family missions made for this exact trip.", regular(10), "#133f3b")
    draw.line((44 * scale, (841 - 48) * scale, 551 * scale, (841 - 48) * scale), fill="#d3cdbb", width=scale)
    text(44, 28, "TRIPQUEST", bold(8), "#596b68")
    text(485, 28, "Cover / 1 of 15", bold(8), "#596b68")
    image.save(path, format="PNG")


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
with NamedTemporaryFile(suffix=".png", delete=False) as cover_png_file:
    cover_png = Path(cover_png_file.name)

try:
    create_raster_cover(cover_png)
    canvas = Canvas(str(OUTPUT_PDF), pagesize=A4)
    canvas.drawImage(ImageReader(str(cover_png)), 0, 0, width=A4[0], height=A4[1])
    canvas.save()
finally:
    cover_png.unlink(missing_ok=True)

print(OUTPUT_PDF)
