from app.statement_ocr import parse_transactions, redact

STATEMENT = """HDFC BANK Statement of Account
Account Holder: Rahul Sharma
Address: 12 MG Road, Pune
A/c No: 50100123456789   IFSC: HDFC0001234
Mobile 9876543210  email rahul.s@gmail.com  PAN ABCDE1234F
Date Narration Withdrawal Deposit Balance
01/04/2025 UPI/DR/412345/SWIGGY/okhdfc 450.00 24,550.00
03/04/2025 SALARY CREDIT ACME LTD 50,000.00 74,550.00
05-04-2025 ATM WDL 5,000.00 69,550.00
CARD ENDING 1234
"""


def test_redact_removes_identity_and_account_data():
    clean, removed = redact(STATEMENT)
    for secret in ("Rahul", "MG Road", "50100123456789", "HDFC0001234", "9876543210", "rahul.s@gmail.com", "ABCDE1234F"):
        assert secret not in clean
    assert removed["identity_lines"] == 2
    assert removed["phone"] == 1 and removed["email"] == 1 and removed["pan"] == 1


def test_amounts_are_not_mistaken_for_account_numbers():
    clean, _ = redact("05/04/2025 ATM WDL 5,000.00 69,550.00")
    assert "5,000.00" in clean and "69,550.00" in clean


def test_parse_uses_balance_to_set_direction():
    rows = parse_transactions(redact(STATEMENT)[0])
    assert [(r["date"], r["amount"]) for r in rows] == [("2025-04-01", -450.0), ("2025-04-03", 50000.0), ("2025-04-05", -5000.0)]
    assert "CARD ENDING 1234" in rows[-1]["description"]  # wrapped line joined to the row above
