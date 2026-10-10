"""store.query results are cached, but a write (or a caller editing a row) must never leave stale data."""
from app.core import store
from app.models import GoalRow, AuditLogRow


def _goal(uid, name):
    return GoalRow(user_id=uid, name=name, target_amount=100.0, target_date="2030-01-01")


def test_write_invalidates_cached_reads():
    uid = "cache-test-1"
    store.delete_where(GoalRow, user_id=uid)
    assert store.query(GoalRow, user_id=uid) == []
    store.put(_goal(uid, "a"))
    assert [g.name for g in store.query(GoalRow, user_id=uid)] == ["a"]
    store.delete_where(GoalRow, user_id=uid)
    assert store.query(GoalRow, user_id=uid) == []


def test_cached_rows_are_copies():
    uid = "cache-test-2"
    store.put(_goal(uid, "orig"))
    try:
        store.query(GoalRow, user_id=uid)[0].name = "mutated"
        assert store.query(GoalRow, user_id=uid)[0].name == "orig"
    finally:
        store.delete_where(GoalRow, user_id=uid)


def test_second_read_does_not_hit_firestore(monkeypatch):
    uid = "cache-test-3"
    store.query(GoalRow, user_id=uid)
    monkeypatch.setattr(store, "_q", lambda *a, **k: (_ for _ in ()).throw(AssertionError("went to Firestore")))
    assert store.query(GoalRow, user_id=uid) == []


def test_log_tables_are_always_read_live():
    assert AuditLogRow.__tablename__ in store._QUIET
