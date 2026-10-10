"""New-user questionnaire: three depths, each including the one before. Answers feed the Copilot as context."""
from __future__ import annotations

LEVELS = ("basic", "standard", "deep")


def _q(id, label, kind="text", options=None, hint=""):
    return {"id": id, "label": label, "type": kind, "options": options or [], "hint": hint}


_BASIC = [
    _q("name", "What should we call you?"),
    _q("occupation", "What do you do for work?", hint="e.g. software engineer, shop owner, student"),
]
_STANDARD = [
    _q("employment_type", "How do you earn?", "choice", ["Salaried", "Self-employed", "Business owner", "Student", "Retired", "Other"]),
    _q("age_group", "Your age group", "choice", ["Under 25", "25-34", "35-44", "45-59", "60+"]),
    _q("city", "Which city do you live in?"),
    _q("household", "Who do you live with?", "choice", ["Alone", "Partner", "Family with children", "Parents or relatives", "Flatmates"]),
    _q("monthly_income", "Typical monthly take-home income (₹)", "number"),
    _q("fixed_costs", "Monthly rent and EMIs combined (₹)", "number"),
    _q("savings_goal", "What is your main money goal right now?", hint="e.g. emergency fund, buy a house, clear a loan"),
    _q("risk_comfort", "How do you feel about investment risk?", "choice", ["I avoid it", "A little is fine", "Comfortable with ups and downs"]),
]
_DEEP = [
    _q("other_income", "Any other income (rent, freelance, dividends)? Amount per month (₹)", "number"),
    _q("debts", "List your loans and credit cards with rough balances", hint="e.g. home loan 28L at 8.5%, credit card 40k"),
    _q("investments", "What do you invest in today, and roughly how much?", hint="e.g. SIP 10k/month, FDs 2L, stocks 1.5L"),
    _q("insurance", "Which insurance do you have?", "choice", ["Health and term life", "Health only", "Term life only", "None", "Not sure"]),
    _q("tax_regime", "Which income tax regime do you use?", "choice", ["Old regime", "New regime", "Not sure"]),
    _q("emergency_fund_months", "How many months of expenses could you cover with savings?", "number"),
    _q("big_goals", "Big goals in the next 1 to 5 years, with rough cost and date", hint="e.g. car 8L in 2028, wedding 12L in 2029"),
    _q("retirement_age", "At what age would you like to retire?", "number"),
    _q("money_worries", "What worries you most about your money?"),
    _q("spending_habits", "Where do you feel you overspend?"),
]
_BY_LEVEL = {"basic": _BASIC, "standard": _BASIC + _STANDARD, "deep": _BASIC + _STANDARD + _DEEP}


def questions(level: str) -> list[dict]:
    return _BY_LEVEL[level]


def all_questions() -> dict[str, list[dict]]:
    return _BY_LEVEL


def describe(answers: dict[str, str]) -> str:
    """Plain text for the model prompt and retrieval, using the full question wording."""
    labels = {q["id"]: q["label"] for q in _BY_LEVEL["deep"]}
    return "\n".join(f"{labels[k]}: {v}" for k, v in answers.items() if k in labels and str(v).strip())
