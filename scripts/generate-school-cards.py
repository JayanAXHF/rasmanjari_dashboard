#!/usr/bin/env python3
"""Create private, printable school login cards from base64 TSV on stdin."""

import argparse
import base64
import binascii
import math
import os
from pathlib import Path
import re
import sys
import unicodedata


def load_dependencies():
    try:
        import qrcode
        import reportlab
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.pdfgen import canvas
    except ImportError:
        raise ValueError(
            "Missing PDF dependencies. Install scripts/requirements-school-cards.txt "
            "in a virtual environment and set PYTHON_BIN to its Python executable."
        ) from None
    return qrcode, reportlab, A4, mm, pdfmetrics, TTFont, canvas


def read_records(stream):
    records = []
    seen = set()
    for number, line in enumerate(stream, 1):
        fields = line.rstrip("\r\n").split("\t")
        try:
            if len(fields) != 3:
                raise ValueError()
            code, name, password = (
                base64.b64decode(field, validate=True).decode("utf-8") for field in fields
            )
        except (ValueError, binascii.Error, UnicodeError):
            raise ValueError(f"Invalid base64 school record at line {number}.") from None
        password_length = len(password.encode("utf-16-le")) // 2
        if not re.fullmatch(r"[A-Z0-9_-]{2,32}", code) or not name.strip():
            raise ValueError(f"Invalid school code or name at line {number}.")
        if not 12 <= password_length <= 256:
            raise ValueError(f"Password at line {number} must contain 12–256 characters.")
        if any(unicodedata.category(char).startswith("C") for char in name + password):
            raise ValueError(f"Record at line {number} contains non-printable characters.")
        if code in seen:
            raise ValueError(f"Duplicate school code at line {number}.")
        seen.add(code)
        records.append((code, name, password))
    if not records:
        raise ValueError("At least one school is required.")
    return records


def qr_payload(code, password):
    return f"School ID: {code}\nPassword: {password}"


def wrap_exact(value, font, size, width, metrics, words=False):
    """Wrap by measured glyph widths, preserving every credential character."""
    lines = []
    line = ""
    for char in value:
        while metrics.stringWidth(line + char, font, size) > width:
            if not line:
                raise ValueError("A character is too wide for the card.")
            split = line.rfind(" ") if words else -1
            if split > 0:
                lines.append(line[:split])
                line = line[split + 1:]
            else:
                lines.append(line)
                line = ""
        line += char
    if line:
        lines.append(line)
    return lines


def fit_text(value, font, width, height, maximum, minimum, metrics, words=False):
    size = maximum
    while size >= minimum:
        lines = wrap_exact(value, font, size, width, metrics, words)
        if len(lines) * size * 1.3 <= height:
            return lines, size
        size -= 0.5
    raise ValueError("Text is too long to print legibly. Shorten the school name or password.")


def generate(records, output, args, dependencies):
    qrcode, reportlab, page_size, mm, metrics, font_class, canvas = dependencies
    font_dir = Path(reportlab.__file__).parent / "fonts"
    font_paths = {
        "Card": args.font or font_dir / "Vera.ttf",
        "CardBold": args.bold_font or font_dir / "VeraBd.ttf",
        "CardMono": args.mono_font or Path(__file__).parent / "fonts" / "VeraMono.ttf",
    }
    for font, path in font_paths.items():
        try:
            metrics.registerFont(font_class(font, str(path)))
        except Exception:
            raise ValueError(f"Cannot load {font} font. Supply a readable TrueType font.") from None

    page_w, page_h = page_size
    margin, gap = 12 * mm, 6 * mm
    card_w = (page_w - 2 * margin - gap) / 2
    card_h = (page_h - 2 * margin - 2 * gap - 8 * mm) / 3
    padding = 6 * mm
    qr_size = 32 * mm
    text_w = card_w - 2 * padding - qr_size - 4 * mm
    prepared = []
    for number, (code, name, password) in enumerate(records, 1):
        for value, font in ((name, "CardBold"), (code + password, "CardMono")):
            glyphs = metrics.getFont(font).face.charToGlyph
            if any(ord(char) not in glyphs for char in value):
                raise ValueError(
                    f"Record {number} uses characters missing from {font}. "
                    "Supply --font, --bold-font and/or --mono-font with the required glyphs."
                )
        name_lines, name_size = fit_text(name, "CardBold", card_w - 2 * padding,
                                         12 * mm, 12, 9, metrics, words=True)
        code_lines, code_size = fit_text(code, "CardMono", text_w, 11 * mm, 11, 8, metrics)
        password_lines, password_size = fit_text(password, "CardMono", text_w,
                                                  29 * mm, 10, 6.5, metrics)
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=4)
        qr.add_data(qr_payload(code, password))
        qr.make(fit=True)
        matrix = qr.get_matrix()
        if qr_size / len(matrix) < 0.3 * mm:
            raise ValueError(f"Record {number} needs a QR too dense for reliable printing.")
        prepared.append((name_lines, name_size, code_lines, code_size,
                         password_lines, password_size, matrix))

    # Exclusive creation avoids overwriting an existing credentials PDF or following a symlink.
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as handle:
            pdf = canvas.Canvas(handle, pagesize=page_size, pageCompression=1)
            pdf.setTitle("Rasmanjari school login cards")
            pdf.setAuthor("Rasmanjari")
            pages = math.ceil(len(prepared) / 6)
            for index, card in enumerate(prepared):
                slot = index % 6
                if slot == 0:
                    pdf.setFont("Card", 7)
                    pdf.drawString(margin, margin, "Print A4 at 100% / actual size. Cut along the guides.")
                    pdf.drawRightString(page_w - margin, margin, f"{index // 6 + 1} / {pages}")
                x = margin + (slot % 2) * (card_w + gap)
                y = page_h - margin - (slot // 2 + 1) * card_h - (slot // 2) * gap
                draw_card(pdf, x, y, card_w, card_h, padding, qr_size, card, mm)
                if slot == 5 or index == len(prepared) - 1:
                    pdf.showPage()
            pdf.save()
            handle.flush()
            os.fsync(handle.fileno())
    except BaseException:
        Path(output).unlink(missing_ok=True)
        raise


def draw_card(pdf, x, y, width, height, padding, qr_size, card, mm):
    name_lines, name_size, code_lines, code_size, password_lines, password_size, matrix = card
    pdf.setStrokeColorRGB(0, 0, 0)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setLineWidth(0.5)
    pdf.roundRect(x, y, width, height, 2 * mm, stroke=1, fill=0)
    pdf.setLineWidth(0.25)
    for cx, cy, dx, dy in ((x, y, -1, -1), (x + width, y, 1, -1),
                           (x, y + height, -1, 1), (x + width, y + height, 1, 1)):
        pdf.line(cx + dx * mm, cy, cx + dx * 2.5 * mm, cy)
        pdf.line(cx, cy + dy * mm, cx, cy + dy * 2.5 * mm)
    left = x + padding
    top = y + height - padding
    pdf.setFont("CardBold", 8)
    pdf.drawString(left, top, "RASMANJARI")
    pdf.setFont("Card", 7)
    pdf.drawRightString(x + width - padding, top, "SCHOOL ACCESS")
    pdf.line(left, top - 3 * mm, x + width - padding, top - 3 * mm)

    def lines(values, font, size, baseline):
        pdf.setFont(font, size)
        for value in values:
            pdf.drawString(left, baseline, value)
            baseline -= size * 1.3

    lines(name_lines, "CardBold", name_size, top - 9 * mm)
    pdf.setFont("Card", 7)
    pdf.drawString(left, y + 56 * mm, "SCHOOL ID")
    lines(code_lines, "CardMono", code_size, y + 51.5 * mm)
    pdf.setFont("Card", 7)
    pdf.drawString(left, y + 39 * mm, "PASSWORD")
    lines(password_lines, "CardMono", password_size, y + 34.5 * mm)
    qr_x = x + width - padding - qr_size
    qr_y = y + 15 * mm
    module = qr_size / len(matrix)
    # Draw modules as vector rectangles; the matrix includes its four-module quiet zone.
    for row, values in enumerate(matrix):
        for col, black in enumerate(values):
            if black:
                pdf.rect(qr_x + col * module, qr_y + (len(matrix) - row - 1) * module,
                         module, module, stroke=0, fill=1)
    pdf.setFont("Card", 6.5)
    pdf.drawCentredString(qr_x + qr_size / 2, qr_y - 3 * mm, "Scan to view and copy")
    pdf.drawCentredString(qr_x + qr_size / 2, qr_y - 6 * mm, "credentials")
    pdf.setFont("Card", 6.5)
    pdf.drawString(left, y + 4 * mm, "Keep this card private.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check PDF dependencies without reading credentials")
    parser.add_argument("--output", type=Path, help="New PDF path (existing files are never overwritten)")
    parser.add_argument("--font", type=Path, help="Regular TrueType font")
    parser.add_argument("--bold-font", type=Path, help="School-name TrueType font")
    parser.add_argument("--mono-font", type=Path, help="Credential TrueType font")
    args = parser.parse_args()
    if not args.check and args.output is None:
        parser.error("--output is required unless --check is used")
    try:
        dependencies = load_dependencies()
        if args.check:
            return 0
        generate(read_records(sys.stdin), args.output, args, dependencies)
        return 0
    except (ValueError, OSError) as error:
        # Validation errors identify only record positions, never passwords.
        print(f"School cards: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
