"""Bank statement / passbook text -> redacted transactions. Pure text in, plain dicts out (OCR itself lives in app.ocr).

Order matters: redact() runs first, so nothing downstream (preview, database) ever sees account or identity data.
"""
from __future__ import annotations

import re
from datetime import date, datetime

# Whole lines that only carry who/where the account is; dropped, not masked.
_IDENTITY_LINE = re.compile(
    r"^\W*(?:account\s*(?:holder|name)|a/?c\s*(?:holder|name)|customer\s*(?:name|id)|cust(?:omer)?\s*id|cif|name|address|"
    r"branch|nominee|joint\s*holder|mr\.?|mrs\.?|ms\.?|shri|smt)\b.*$", re.I)

# (kind, pattern, replacement). Most specific first so a 12-digit Aadhaar is not reported as an account number.
_MASKS: list[tuple[str, re.Pattern, str]] = [
    ("email", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"), "[email]"),
    ("upi_id", re.compile(r"\b[\w.-]{2,}@(?:ok\w+|ybl|ibl|axl|paytm|apl|upi|sbi|hdfcbank|icici|axisbank|oksbi)\b", re.I), "[upi-id]"),
    ("pan", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[pan]"),
    ("aadhaar", re.compile(r"\b\d{4}\s\d{4}\s\d{4}\b"), "[aadhaar]"),
    ("ifsc", re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b"), "[ifsc]"),
    ("phone", re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)"), "[phone]"),
    ("account_number", re.compile(r"(?<![\d.,])(?:[Xx*]{2,}\s?)?\d{9,18}(?![\d.,])"), "[account]"),
]
_LABELLED_ACCOUNT = re.compile(r"((?:a/?c|account)\s*(?:no\.?|number|#)?\s*[:\-]?\s*)[Xx*\d][Xx*\d\s-]{5,}", re.I)


def redact(text: str) -> tuple[str, dict[str, int]]:
    """Return (clean text, how many of each kind were removed)."""
    removed: dict[str, int] = {}

    def bump(kind: str, n: int = 1) -> None:
        removed[kind] = removed.get(kind, 0) + n

    kept: list[str] = []
    for line in text.splitlines():
        if _IDENTITY_LINE.match(line.strip()):
            bump("identity_lines")
            continue
        line, n = _LABELLED_ACCOUNT.subn(lambda m: m.group(1) + "[account]", line)
        if n:
            bump("account_number", n)
        for kind, pat, repl in _MASKS:
            line, n = pat.subn(repl, line)
            if n:
                bump(kind, n)
        kept.append(line)
    return "\n".join(kept), removed


_MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec"
_DATE = re.compile(rf"^\W*(\d{{1,2}})[\s/.-]+(\d{{1,2}}|{_MONTHS})[\s/.-]+(\d{{4}}|\d{{2}})\b", re.I)
_AMOUNT = re.compile(r"(?<![\w.])(\d{1,3}(?:,\d{2,3})*|\d+)\.\d{2}(?!\d)")
_CREDIT_WORDS = re.compile(r"\b(?:cr|credit|salary|refund|interest|deposit|received|cashback|neft\s*cr|upi/cr)\b", re.I)
_DEBIT_WORDS = re.compile(r"\b(?:dr|debit|withdrawal|atm|paid|emi|charges?|upi/dr)\b", re.I)


def _to_date(d: str, m: str, y: str) -> date | None:
    try:
        year = int(y) + (2000 if len(y) == 2 else 0)
        month = int(m) if m.isdigit() else _MONTHS.split("|").index(m.lower()) + 1
        return date(year, month, int(d))
    except ValueError:
        return None


def _num(s: str) -> float:
    return float(s.replace(",", ""))


def parse_transactions(clean_text: str) -> list[dict]:
    """Rows like 'DATE  narration  amount  [balance]'. Wrapped narration lines are joined to the row above.

    Direction comes from the running balance when the statement has one, else Cr/Dr style words, else it is a debit.
    """
    rows: list[dict] = []
    prev_balance: float | None = None
    for raw in clean_text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = _DATE.match(line)
        d = _to_date(*m.groups()) if m else None
        if d is None:
            if rows and not _AMOUNT.search(line):  # continuation of a wrapped narration
                rows[-1]["description"] = f"{rows[-1]['description']} {line}"[:160]
            continue
        rest = line[m.end():]
        amounts = [m_.group(0) for m_ in _AMOUNT.finditer(rest)]
        if not amounts:
            continue
        desc = _AMOUNT.sub("", rest).strip(" -|\t")
        value = _num(amounts[-2] if len(amounts) >= 2 else amounts[0])
        balance = _num(amounts[-1]) if len(amounts) >= 2 else None
        if balance is not None and prev_balance is not None and abs(abs(balance - prev_balance) - value) < 0.02:
            sign = 1 if balance > prev_balance else -1
        elif _CREDIT_WORDS.search(desc) and not _DEBIT_WORDS.search(desc):
            sign = 1
        else:
            sign = -1
        if balance is not None:
            prev_balance = balance
        rows.append({"date": d.isoformat(), "description": desc[:160] or "Transaction", "amount": round(sign * value, 2), "balance": balance})
    return rows
