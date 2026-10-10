"""CLI to (re)seed the 3 demo personas into the configured database.

Usage (from backend/):
    python -m app.ingest.seed

Idempotent: safe to re-run -- clears and reinserts all rows for each demo
user_id (demo-priya, demo-arjun, demo-meera) rather than accumulating
duplicates.
"""
from __future__ import annotations

import hashlib
import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from app.core import store
from app.models import (
    AccountRow,
    BudgetRow,
    CategorizationRuleRow,
    DebtRow,
    GoalRow,
    HouseholdInviteRow,
    HouseholdMemberRow,
    HouseholdRow,
    IncomeRow,
    TransactionRow,
)
from app.ingest.personas import PERSONA_CONFIGS, generate_persona


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _clear_user(user_id: str) -> None:
    for model in (TransactionRow, DebtRow, IncomeRow, AccountRow, CategorizationRuleRow,
                  BudgetRow, GoalRow, HouseholdMemberRow):
        store.delete_where(model, user_id=user_id)
    store.delete_where(HouseholdRow, owner_user_id=user_id)
    store.delete_where(HouseholdInviteRow, invited_by_user_id=user_id)


def seed_all() -> None:
    for user_id, config in PERSONA_CONFIGS.items():
        _clear_user(user_id)

        data = generate_persona(config)
        store.put(*data.accounts, *data.transactions, *data.debts, *data.incomes,
                  *data.rules, *data.budgets, *data.goals)

        print(
            f"Seeded {user_id}: {len(data.accounts)} accounts, "
            f"{len(data.transactions)} transactions, {len(data.debts)} debts, "
            f"{len(data.incomes)} incomes, {len(data.rules)} rules, {len(data.budgets)} budgets, "
            f"{len(data.goals)} goals"
        )

    # Seed shared household for Priya & Arjun
    now = datetime.now(timezone.utc)
    hh = HouseholdRow(
        id="hh-priya-arjun",
        name="Priya & Partner Family",
        owner_user_id="demo-priya",
        created_at=now - timedelta(days=60),
    )
    m1 = HouseholdMemberRow(
        household_id="hh-priya-arjun",
        user_id="demo-priya",
        role="owner",
        joined_at=now - timedelta(days=60),
    )
    m2 = HouseholdMemberRow(
        household_id="hh-priya-arjun",
        user_id="demo-arjun",
        role="editor",
        joined_at=now - timedelta(days=45),
    )

    inv1 = HouseholdInviteRow(
        household_id="hh-priya-arjun",
        invited_email="rohan.sharma@example.com",
        role="editor",
        token_hash=_hash_token("demo-partner-token-rohan"),
        status="pending",
        invited_by_user_id="demo-priya",
        created_at=now - timedelta(days=2),
        expires_at=now + timedelta(days=5),
    )
    store.put(hh, m1, m2, inv1)
    print("Seeded demo household: 'Priya & Partner Family' (Members: Priya, Arjun; Pending: Rohan)")


_ensure_lock = threading.RLock()  # re-entrant: ensure_demo_seeded calls seed_if_empty
_checked_at = 0.0
_RECHECK_SECONDS = 30.0


def _demo_missing() -> bool:
    return any(store.first(AccountRow, user_id=uid) is None for uid in PERSONA_CONFIGS)


def warm_demo_caches() -> None:
    """Build the dashboard snapshot for each persona now so the first click in a demo is instant (it caches itself)."""
    from app.ingest.snapshot import build_dashboard_snapshot

    for uid in PERSONA_CONFIGS:
        try:
            build_dashboard_snapshot(uid)
        except Exception as exc:  # noqa: BLE001 - warming is an extra, never block the demo
            logging.getLogger(__name__).warning("warm %s failed: %s", uid, exc)


def seed_if_empty() -> None:
    """Seed the demo personas if any is missing (fresh/ephemeral DB, a wiped emulator, a serverless cold start),
    then warm their caches. Cheap no-op otherwise."""
    with _ensure_lock:  # the startup thread and a first request must not seed at the same time
        if _demo_missing():
            seed_all()
            warm_demo_caches()


def ensure_demo_seeded() -> None:
    """Called when a demo persona is requested: self-heals missing demo data, checking at most every 30 s per process."""
    global _checked_at
    if time.monotonic() - _checked_at < _RECHECK_SECONDS:
        return
    with _ensure_lock:
        if time.monotonic() - _checked_at < _RECHECK_SECONDS:
            return
        seed_if_empty()
        _checked_at = time.monotonic()


if __name__ == "__main__":
    seed_all()
