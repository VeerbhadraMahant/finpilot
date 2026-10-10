"""Read printed text from a photo or scan, on this machine (RapidOCR / ONNX, no cloud). Used for documents and receipts."""
from __future__ import annotations

import io
import re
from functools import lru_cache

import numpy as np
from PIL import Image, UnidentifiedImageError


@lru_cache(maxsize=1)
def _engine():
    from rapidocr import RapidOCR  # imported late: loading the models takes about a second

    return RapidOCR()


def read_text(data: bytes) -> str:
    """Text lines in reading order; '' if the bytes are not an image or nothing readable was found."""
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except (UnidentifiedImageError, OSError):
        return ""
    res = _engine()(np.array(img))
    if res.txts is None or res.boxes is None:
        return ""
    items = sorted(((float(b[:, 1].mean()), float(b[:, 0].min()), t, float(b[:, 1].max() - b[:, 1].min())) for b, t in zip(res.boxes, res.txts)))
    lines: list[list[tuple[float, str]]] = []
    last_y, last_h = None, 0.0
    for y, x, t, h in items:
        if last_y is not None and abs(y - last_y) < max(last_h, h) * 0.6:  # same printed line
            lines[-1].append((x, t))
        else:
            lines.append([(x, t)])
        last_y, last_h = y, h
    return "\n".join(" ".join(t for _, t in sorted(line)) for line in lines)


_NUM = r"(\d[\d,]*(?:\.\d{1,2})?)"
_TOTAL = re.compile(r"(?:grand\s*total|net\s*(?:amount|payable)|amount\s*(?:due|payable|paid)|total)\D{0,12}" + _NUM, re.I)


def parse_receipt(text: str) -> dict:
    """{'merchant': first text line, 'total': last 'total' amount or None}."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    merchant = next((l for l in lines if re.search(r"[A-Za-zऀ-ൿ]{3}", l) and not re.search(r"\d{4,}", l)), None)
    totals = [float(m.group(1).replace(",", "")) for l in lines if (m := _TOTAL.search(l)) and "sub" not in l.lower()[:4]]
    return {"merchant": merchant, "total": totals[-1] if totals else None}
