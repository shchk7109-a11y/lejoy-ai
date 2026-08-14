#!/usr/bin/env python3
"""Build the illustrated 乐享AI store-manager handbook as an A4 PDF."""

from __future__ import annotations

import math
import os
from pathlib import Path
from typing import Iterable

from PIL import Image
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from handbook_content import PAGES, TITLE, VERSION


ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "docs" / "training-handbook" / "assets"
OUTPUT = ROOT / "output" / "pdf" / f"{TITLE}.pdf"

PAGE_W, PAGE_H = A4
MARGIN_X = 48
CONTENT_W = PAGE_W - MARGIN_X * 2

ORANGE = HexColor("#D34A0B")
ORANGE_DARK = HexColor("#9F3510")
ORANGE_LIGHT = HexColor("#FFF0E3")
GREEN = HexColor("#247A4B")
GREEN_LIGHT = HexColor("#EAF7EF")
BLUE = HexColor("#2559A7")
BLUE_LIGHT = HexColor("#EDF4FF")
INK = HexColor("#24211F")
MUTED = HexColor("#68625E")
LINE = HexColor("#E8DED5")
PAPER = HexColor("#FFFDF9")
WHITE = HexColor("#FFFFFF")
YELLOW = HexColor("#FFF8D9")


def register_fonts() -> None:
    fonts = {
        "CN": "/System/Library/Fonts/STHeiti Light.ttc",
        "CN-M": "/System/Library/Fonts/STHeiti Medium.ttc",
        "CN-S": "/System/Library/Fonts/Supplemental/Songti.ttc",
    }
    for name, path in fonts.items():
        if not Path(path).exists():
            raise FileNotFoundError(f"Missing required Chinese font: {path}")
        pdfmetrics.registerFont(TTFont(name, path))


def text_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def wrap_text(text: str, font: str, size: float, width: float) -> list[str]:
    """Wrap Chinese and Latin text without inserting artificial spaces."""
    lines: list[str] = []
    for paragraph in str(text).split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for char in paragraph:
            candidate = current + char
            if current and text_width(candidate, font, size) > width:
                lines.append(current.rstrip())
                current = char.lstrip() if char == " " else char
            else:
                current = candidate
        if current:
            lines.append(current.rstrip())
    return lines or [""]


def draw_lines(
    c: canvas.Canvas,
    lines: Iterable[str],
    x: float,
    y: float,
    *,
    font: str = "CN",
    size: float = 12.5,
    color: Color = INK,
    leading: float | None = None,
) -> float:
    leading = leading or size * 1.55
    c.setFont(font, size)
    c.setFillColor(color)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def block_height(text: str, width: float, size: float = 12.5, leading: float | None = None) -> float:
    leading = leading or size * 1.55
    return len(wrap_text(text, "CN", size, width)) * leading


def image_path(relative: str) -> Path:
    path = ASSET_ROOT / relative
    if not path.exists():
        raise FileNotFoundError(f"Handbook asset missing: {path}")
    return path


def draw_image_fit(
    c: canvas.Canvas,
    path: Path,
    x: float,
    y_top: float,
    max_w: float,
    max_h: float,
    *,
    radius: float = 10,
) -> tuple[float, float, float]:
    with Image.open(path) as im:
        iw, ih = im.size
    scale = min(max_w / iw, max_h / ih)
    w, h = iw * scale, ih * scale
    left = x + (max_w - w) / 2
    bottom = y_top - h
    c.saveState()
    clip = c.beginPath()
    clip.roundRect(left, bottom, w, h, radius)
    c.clipPath(clip, stroke=0, fill=0)
    c.drawImage(str(path), left, bottom, width=w, height=h, preserveAspectRatio=True, mask="auto")
    c.restoreState()
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(left, bottom, w, h, radius, stroke=1, fill=0)
    return left, bottom, h


def estimate_page(page: dict) -> float:
    h = 0.0
    if page.get("intro"):
        h += block_height(page["intro"], CONTENT_W, 12.5) + 12
    if page.get("image") or page.get("images"):
        h += 220 + (28 if page.get("image_caption") else 8)
    if page.get("flow"):
        h += 112
    if page.get("table"):
        table = page["table"]
        h += 34 + max(0, len(table) - 1) * 42
    if page.get("bullets"):
        for item in page["bullets"]:
            h += max(24, block_height(item, CONTENT_W - 34, 12.5) + 6)
        h += 8
    if page.get("checklist"):
        h += len(page["checklist"]) * 33 + 8
    if page.get("quote"):
        h += block_height(page["quote"], CONTENT_W - 40, 15) + 40
    if page.get("form_lines"):
        h += len(page["form_lines"]) * 43 + 8
    if page.get("callout"):
        h += block_height(page["callout"], CONTENT_W - 42, 12.2) + 54
    return h


def page_scale(page: dict) -> float:
    estimated = estimate_page(page)
    if estimated <= 630:
        return 1.0
    return max(0.78, 630 / estimated)


def draw_page_chrome(c: canvas.Canvas, page_no: int, page: dict) -> float:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(ORANGE)
    c.rect(0, PAGE_H - 9, PAGE_W, 9, stroke=0, fill=1)

    kicker = page.get("kicker", "店长培训")
    c.setFillColor(ORANGE_LIGHT)
    c.roundRect(MARGIN_X, PAGE_H - 55, 106, 24, 12, stroke=0, fill=1)
    c.setFont("CN-M", 10.5)
    c.setFillColor(ORANGE_DARK)
    c.drawCentredString(MARGIN_X + 53, PAGE_H - 47, kicker[:12])

    c.setFillColor(INK)
    c.setFont("CN-M", 23)
    c.drawString(MARGIN_X, PAGE_H - 88, page["title"])
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(MARGIN_X, PAGE_H - 103, PAGE_W - MARGIN_X, PAGE_H - 103)

    c.setFont("CN", 8.5)
    c.setFillColor(MUTED)
    c.drawString(MARGIN_X, 26, f"乐享AI店长培训讲义｜版本 {VERSION}")
    c.drawRightString(PAGE_W - MARGIN_X, 26, f"{page_no} / {len(PAGES)}")
    return PAGE_H - 124


def draw_intro(c: canvas.Canvas, text: str, y: float, scale: float) -> float:
    size = 12.5 * scale
    leading = 19 * scale
    c.setFillColor(GREEN_LIGHT)
    lines = wrap_text(text, "CN", size, CONTENT_W - 32)
    h = len(lines) * leading + 24 * scale
    c.roundRect(MARGIN_X, y - h, CONTENT_W, h, 12, stroke=0, fill=1)
    draw_lines(c, lines, MARGIN_X + 16, y - 18 * scale, size=size, leading=leading)
    return y - h - 12 * scale


def draw_images(c: canvas.Canvas, page: dict, y: float, scale: float) -> float:
    refs = page.get("images") or [page["image"]]
    caption = page.get("image_caption")
    target_h = 205 * scale
    if len(refs) == 1:
        draw_image_fit(c, image_path(refs[0]), MARGIN_X, y, CONTENT_W, target_h)
        used_h = target_h
    else:
        gap = 14
        each_w = (CONTENT_W - gap) / 2
        for idx, ref in enumerate(refs[:2]):
            draw_image_fit(c, image_path(ref), MARGIN_X + idx * (each_w + gap), y, each_w, target_h)
        used_h = target_h
    y -= used_h + 8 * scale
    if caption:
        c.setFont("CN", 9.5 * scale)
        c.setFillColor(MUTED)
        c.drawCentredString(PAGE_W / 2, y, caption)
        y -= 20 * scale
    return y


def draw_bullets(c: canvas.Canvas, items: list[str], y: float, scale: float) -> float:
    size = 12.5 * scale
    leading = 19 * scale
    for item in items:
        lines = wrap_text(item, "CN", size, CONTENT_W - 34)
        c.setFillColor(ORANGE)
        c.circle(MARGIN_X + 7, y - 5 * scale, 3.2 * scale, stroke=0, fill=1)
        y = draw_lines(c, lines, MARGIN_X + 22, y, size=size, leading=leading)
        y -= 7 * scale
    return y - 2 * scale


def draw_callout(c: canvas.Canvas, page: dict, y: float, scale: float) -> float:
    text = page["callout"]
    kind = page.get("callout_kind", "remember")
    palette = {
        "warning": (YELLOW, HexColor("#A15A00"), "注意"),
        "script": (BLUE_LIGHT, BLUE, "话术"),
        "remember": (GREEN_LIGHT, GREEN, "记住"),
    }
    bg, accent, label = palette.get(kind, palette["remember"])
    size = 12.2 * scale
    leading = 18.5 * scale
    lines = wrap_text(text, "CN", size, CONTENT_W - 42)
    h = len(lines) * leading + 46 * scale
    c.setFillColor(bg)
    c.roundRect(MARGIN_X, y - h, CONTENT_W, h, 12, stroke=0, fill=1)
    c.setFillColor(accent)
    c.roundRect(MARGIN_X + 12, y - 25 * scale, 42 * scale, 19 * scale, 9, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("CN-M", 9.5 * scale)
    c.drawCentredString(MARGIN_X + 12 + 21 * scale, y - 19 * scale, label)
    c.setFillColor(accent)
    c.setFont("CN-M", 12.2 * scale)
    c.drawString(MARGIN_X + 62 * scale, y - 20 * scale, page.get("callout_title", "店长提示"))
    draw_lines(c, lines, MARGIN_X + 18, y - 42 * scale, size=size, leading=leading)
    return y - h - 10 * scale


def table_column_widths(table: list[list[str]]) -> list[float]:
    cols = len(table[0])
    if cols == 2:
        return [CONTENT_W * 0.26, CONTENT_W * 0.74]
    if cols == 3:
        first_header = table[0][0]
        if first_header in {"项目", "时间", "功能", "结果"}:
            return [CONTENT_W * 0.24, CONTENT_W * 0.36, CONTENT_W * 0.40]
        return [CONTENT_W * 0.24, CONTENT_W * 0.29, CONTENT_W * 0.47]
    return [CONTENT_W / cols] * cols


def draw_table(c: canvas.Canvas, table: list[list[str]], y: float, scale: float) -> float:
    widths = table_column_widths(table)
    size = 10.5 * scale
    leading = 15.2 * scale
    padding = 8 * scale
    x0 = MARGIN_X
    for row_idx, row in enumerate(table):
        wrapped = [wrap_text(str(cell), "CN-M" if row_idx == 0 else "CN", size, widths[i] - padding * 2) for i, cell in enumerate(row)]
        row_h = max(len(lines) for lines in wrapped) * leading + padding * 2
        bg = ORANGE if row_idx == 0 else (WHITE if row_idx % 2 else HexColor("#FAF6F1"))
        c.setFillColor(bg)
        c.rect(x0, y - row_h, CONTENT_W, row_h, stroke=0, fill=1)
        x = x0
        for col_idx, lines in enumerate(wrapped):
            c.setStrokeColor(LINE)
            c.setLineWidth(0.6)
            c.rect(x, y - row_h, widths[col_idx], row_h, stroke=1, fill=0)
            color = WHITE if row_idx == 0 else INK
            draw_lines(
                c,
                lines,
                x + padding,
                y - padding - size,
                font="CN-M" if row_idx == 0 else "CN",
                size=size,
                color=color,
                leading=leading,
            )
            x += widths[col_idx]
        y -= row_h
    return y - 12 * scale


def draw_checklist(c: canvas.Canvas, items: list[str], y: float, scale: float) -> float:
    cols = 2 if len(items) >= 4 else 1
    gap = 12
    width = (CONTENT_W - gap * (cols - 1)) / cols
    rows = math.ceil(len(items) / cols)
    row_h = 33 * scale
    for idx, item in enumerate(items):
        col = idx % cols
        row = idx // cols
        x = MARGIN_X + col * (width + gap)
        yy = y - row * row_h
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.roundRect(x, yy - 25 * scale, width, 25 * scale, 7, stroke=1, fill=1)
        c.setStrokeColor(GREEN)
        c.rect(x + 8, yy - 18 * scale, 10 * scale, 10 * scale, stroke=1, fill=0)
        c.setFont("CN", 10.8 * scale)
        c.setFillColor(INK)
        c.drawString(x + 25 * scale, yy - 16 * scale, item)
    return y - rows * row_h - 6 * scale


def draw_flow(c: canvas.Canvas, items: list[str], y: float, scale: float) -> float:
    cols = 4
    box_w = (CONTENT_W - 24) / cols
    box_h = 42 * scale
    for idx, item in enumerate(items):
        row, col = divmod(idx, cols)
        x = MARGIN_X + col * (box_w + 8)
        yy = y - row * (box_h + 16)
        c.setFillColor(ORANGE_LIGHT if row == 0 else GREEN_LIGHT)
        c.roundRect(x, yy - box_h, box_w, box_h, 10, stroke=0, fill=1)
        c.setFont("CN-M", 10.5 * scale)
        c.setFillColor(ORANGE_DARK if row == 0 else GREEN)
        c.drawCentredString(x + box_w / 2, yy - box_h / 2 - 4, f"{idx + 1}. {item}")
    rows = math.ceil(len(items) / cols)
    return y - rows * (box_h + 16) - 2 * scale


def draw_quote(c: canvas.Canvas, text: str, y: float, scale: float) -> float:
    size = 15 * scale
    leading = 24 * scale
    lines = wrap_text(text, "CN-S", size, CONTENT_W - 54)
    h = len(lines) * leading + 34 * scale
    c.setFillColor(HexColor("#F6F1EA"))
    c.roundRect(MARGIN_X, y - h, CONTENT_W, h, 12, stroke=0, fill=1)
    c.setFillColor(ORANGE)
    c.setFont("CN-S", 28 * scale)
    c.drawString(MARGIN_X + 14, y - 31 * scale, "“")
    draw_lines(c, lines, MARGIN_X + 34, y - 23 * scale, font="CN-S", size=size, color=INK, leading=leading)
    return y - h - 12 * scale


def draw_form_lines(c: canvas.Canvas, lines: list[str], y: float, scale: float) -> float:
    size = 11.5 * scale
    for line in lines:
        wrapped = wrap_text(line, "CN", size, CONTENT_W - 24)
        height = max(38 * scale, len(wrapped) * 17 * scale + 16 * scale)
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.roundRect(MARGIN_X, y - height, CONTENT_W, height, 7, stroke=1, fill=1)
        draw_lines(c, wrapped, MARGIN_X + 12, y - 20 * scale, size=size, leading=17 * scale)
        y -= height + 6 * scale
    return y


def draw_cover(c: canvas.Canvas, page: dict) -> None:
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(ORANGE)
    c.rect(0, 0, 22, PAGE_H, stroke=0, fill=1)
    c.setFillColor(GREEN_LIGHT)
    c.circle(PAGE_W - 40, PAGE_H - 48, 135, stroke=0, fill=1)
    c.setFillColor(ORANGE_LIGHT)
    c.circle(54, 70, 110, stroke=0, fill=1)

    c.setFont("CN-M", 11)
    c.setFillColor(GREEN)
    c.drawString(62, PAGE_H - 78, "灵芝水铺｜店长与店员培训")
    c.setFont("CN-M", 32)
    c.setFillColor(INK)
    c.drawString(62, PAGE_H - 140, "乐享AI")
    c.setFont("CN-M", 27)
    c.setFillColor(ORANGE_DARK)
    c.drawString(62, PAGE_H - 182, "店长培训讲义")
    c.setFont("CN-S", 15)
    c.setFillColor(MUTED)
    for idx, line in enumerate(wrap_text(page["body"], "CN-S", 15, 250)):
        c.drawString(62, PAGE_H - 226 - idx * 24, line)

    draw_image_fit(c, image_path(page["image"]), PAGE_W - 260, PAGE_H - 232, 208, 390, radius=18)

    c.setFillColor(WHITE)
    c.roundRect(62, 145, 465, 102, 16, stroke=0, fill=1)
    c.setStrokeColor(LINE)
    c.roundRect(62, 145, 465, 102, 16, stroke=1, fill=0)
    c.setFont("CN-M", 13)
    c.setFillColor(ORANGE_DARK)
    c.drawString(82, 217, page["subtitle"])
    c.setFont("CN", 10.5)
    c.setFillColor(MUTED)
    meta_lines = wrap_text(page["meta"], "CN", 10.5, 420)
    draw_lines(c, meta_lines, 82, 188, size=10.5, color=MUTED, leading=17)
    c.setFont("CN", 9.5)
    c.drawString(62, 54, f"版本 {VERSION}｜本讲义中的人物与演示数据均为培训用虚构素材")


def draw_back(c: canvas.Canvas, page: dict) -> None:
    c.setFillColor(ORANGE_DARK)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setFillColor(Color(1, 1, 1, alpha=0.09))
    for radius in (95, 145, 205):
        c.circle(PAGE_W - 30, PAGE_H - 30, radius, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("CN-M", 29)
    lines = wrap_text(page["title"], "CN-M", 29, 450)
    draw_lines(c, lines, 68, 610, font="CN-M", size=29, color=WHITE, leading=43)
    c.setFont("CN-S", 15)
    c.setFillColor(HexColor("#FFE5D0"))
    draw_lines(c, wrap_text(page["body"], "CN-S", 15, 430), 68, 515, font="CN-S", size=15, color=HexColor("#FFE5D0"), leading=26)
    c.setFillColor(WHITE)
    c.roundRect(68, 205, 315, 170, 16, stroke=0, fill=1)
    c.setFillColor(INK)
    c.setFont("CN-M", 13)
    c.drawString(92, 340, page["note"])
    c.setStrokeColor(LINE)
    c.setDash(4, 4)
    c.rect(102, 225, 132, 95, stroke=1, fill=0)
    c.setDash()
    c.setFont("CN", 10)
    c.setFillColor(MUTED)
    c.drawString(248, 282, "由门店张贴正式二维码")
    c.drawString(248, 260, "或填写技术反馈方式")
    c.setFont("CN", 9.5)
    c.setFillColor(HexColor("#FFE5D0"))
    c.drawString(68, 55, f"乐享AI店长培训讲义｜版本 {VERSION}")


def draw_content_page(c: canvas.Canvas, page_no: int, page: dict) -> None:
    y = draw_page_chrome(c, page_no, page)
    scale = page_scale(page)
    if page.get("intro"):
        y = draw_intro(c, page["intro"], y, scale)
    if page.get("image") or page.get("images"):
        y = draw_images(c, page, y, scale)
    if page.get("flow"):
        y = draw_flow(c, page["flow"], y, scale)
    if page.get("table"):
        y = draw_table(c, page["table"], y, scale)
    if page.get("bullets"):
        y = draw_bullets(c, page["bullets"], y, scale)
    if page.get("checklist"):
        y = draw_checklist(c, page["checklist"], y, scale)
    if page.get("quote"):
        y = draw_quote(c, page["quote"], y, scale)
    if page.get("form_lines"):
        y = draw_form_lines(c, page["form_lines"], y, scale)
    if page.get("callout"):
        y = draw_callout(c, page, y, scale)
    if y < 42:
        raise RuntimeError(f"Page {page_no} overflowed the printable area: {page['title']} (y={y:.1f})")


def build() -> Path:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4, pageCompression=1)
    c.setTitle(TITLE)
    c.setAuthor("乐享AI项目组")
    c.setSubject("灵芝水铺店长与店员培训讲义")
    c.setCreator("乐享AI培训讲义构建脚本")
    for page_no, page in enumerate(PAGES, start=1):
        if page.get("kind") == "cover":
            draw_cover(c, page)
        elif page.get("kind") == "back":
            draw_back(c, page)
        else:
            draw_content_page(c, page_no, page)
        c.showPage()
    c.save()
    return OUTPUT


if __name__ == "__main__":
    output = build()
    print(f"PASS: generated {len(PAGES)}-page handbook")
    print(output)
