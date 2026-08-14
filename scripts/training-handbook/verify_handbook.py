#!/usr/bin/env python3
"""Structural and content checks for the generated handbook PDF."""

from __future__ import annotations

import re
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

from handbook_content import PAGES, TITLE


ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "output" / "pdf" / f"{TITLE}.pdf"
ASSET_ROOT = ROOT / "docs" / "training-handbook" / "assets"


def referenced_assets() -> set[str]:
    refs: set[str] = set()
    for page in PAGES:
        if page.get("image"):
            refs.add(page["image"])
        refs.update(page.get("images", []))
    return refs


def verify() -> None:
    if not PDF.exists() or PDF.stat().st_size < 100_000:
        raise AssertionError(f"PDF missing or unexpectedly small: {PDF}")

    reader = PdfReader(str(PDF))
    if len(reader.pages) != len(PAGES):
        raise AssertionError(f"Expected {len(PAGES)} pages, got {len(reader.pages)}")
    if not 35 <= len(reader.pages) <= 45:
        raise AssertionError("Handbook page count is outside the approved 35-45 page range")

    missing = [str(ASSET_ROOT / ref) for ref in sorted(referenced_assets()) if not (ASSET_ROOT / ref).exists()]
    if missing:
        raise AssertionError("Missing handbook assets:\n" + "\n".join(missing))

    with pdfplumber.open(str(PDF)) as doc:
        texts = [(page.extract_text() or "") for page in doc.pages]
    joined = "\n".join(texts)
    for forbidden in ("TODO", "TBD", "待完善", "稍后补充"):
        if forbidden in joined:
            raise AssertionError(f"Placeholder text found: {forbidden}")

    required_titles = [
        "中老年人为什么愿意接触AI",
        "乐享AI给门店带来的五个价值",
        "门店体验引流闭环",
        "老摄影大师：两种入口",
        "暖心文案：四步完成",
        "AI故事会：从风格开始",
        "生活助手：两个清楚入口",
        "AI万花筒：生活百科陪聊",
        "隐私、安全与合规底线",
        "店长实操考核",
    ]
    indexes = []
    for title in required_titles:
        index = next((i for i, text in enumerate(texts) if title in text), None)
        if index is None:
            raise AssertionError(f"Required chapter title missing: {title}")
        indexes.append(index)
    if indexes != sorted(indexes):
        raise AssertionError("Required chapters are not in the approved order")

    traffic_page = next(i for i, text in enumerate(texts) if "门店体验引流闭环" in text)
    feature_page = next(i for i, text in enumerate(texts) if "老摄影大师：两种入口" in text)
    if traffic_page >= feature_page:
        raise AssertionError("Traffic-acquisition chapter must precede feature introductions")

    required_phrases = [
        "不把AI营养分析与灵芝产品功效建立因果关系",
        "不保存顾客照片、孩子照片、录音、对话和输入原文",
        "故事只保存在当前手机",
        "原“健康百科”入口已移除",
    ]
    for phrase in required_phrases:
        if phrase not in joined:
            raise AssertionError(f"Required policy phrase missing: {phrase}")

    font_names: set[str] = set()
    for page in reader.pages:
        resources = page.get("/Resources", {})
        fonts = resources.get("/Font", {}) if resources else {}
        for font_ref in fonts.values():
            font = font_ref.get_object()
            base = str(font.get("/BaseFont", ""))
            font_names.add(base)
    if not any(re.search(r"STHeiti|Songti", name, re.I) for name in font_names):
        raise AssertionError(f"Embedded Chinese font not detected: {sorted(font_names)}")

    print("PASS: handbook structure, content, screenshots and fonts verified")
    print(f"pages={len(reader.pages)} assets={len(referenced_assets())} bytes={PDF.stat().st_size}")
    print(PDF)


if __name__ == "__main__":
    verify()
