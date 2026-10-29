"""
JobRadar — Membership plan change (upgrade/downgrade) vs renewal (Iteration 5).
Bug: Quarterly -> Half-Yearly -> Annual stacked to ~2 years. Fix: different plan while active
replaces (today + new duration); same plan while active stacks after current expiry.
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
API = f"{BASE_URL.rstrip('/')}/api"

ADMIN_EMAIL = "admin@eevolvex.com"
ADMIN_PASS = "Admin@12345"


def _env(key):
    for line in Path("/app/backend/.env").read_text().splitlines():
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"')


_mongo = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]


def _dt(s):
    d = datetime.fromisoformat(s)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _days_from_now(iso):
    return (_dt(iso) - datetime.now(timezone.utc)).total_seconds() / 86400


def _register():
    email = f"test_upg_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "full_name": "TEST Upgrade", "email": email, "mobile": "9999900000",
        "password": "Test@12345", "confirm_password": "Test@12345", "consent": True,
        "industry": "IT & Technology", "current_designation": "Engineer", "current_salary": "10 LPA",
        "preferred_location": "Bengaluru", "preferred_work_mode": "Hybrid",
        "preferred_function": "IT & Technology"})
    assert r.status_code in (200, 201), r.text
    d = r.json()
    return {"token": d["token"], "user_id": d["user"]["user_id"], "email": email}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def plans():
    r = requests.get(f"{API}/plans")
    assert r.status_code == 200
    by = {p["duration_days"]: p for p in r.json()["plans"]}
    return by


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def created_users():
    users = []
    yield users
    for u in users:
        _mongo.subscriptions.delete_many({"candidate_id": u})
        _mongo.payments.delete_many({"candidate_id": u})
        _mongo.career_usage.delete_many({"user_id": u})
        _mongo.email_logs.delete_many({"candidate_id": u})
        _mongo.sessions.delete_many({"user_id": u})
        _mongo.users.delete_one({"user_id": u})


def _buy(tok, plan_id):
    r = requests.post(f"{API}/checkout/demo", json={"plan_id": plan_id}, headers=_h(tok))
    assert r.status_code == 200, r.text
    return r.json()


def _mem(tok):
    r = requests.get(f"{API}/membership", headers=_h(tok))
    assert r.status_code == 200
    return r.json()


# ---------------- Regression: prices ----------------
class TestPlanPrices:
    def test_prices(self, plans):
        assert plans[90]["price"] == 599
        assert plans[180]["price"] == 799
        assert plans[365]["price"] == 999


# ---------------- Upgrade chain + renewal ----------------
class TestUpgradeChain:
    def test_full_upgrade_chain(self, plans, admin_token, created_users):
        u = _register()
        created_users.append(u["user_id"])
        tok = u["token"]

        # Quarterly from no plan -> today + 90
        m = _buy(tok, plans[90]["plan_id"])["membership"]
        assert 89.9 < _days_from_now(m["expiry_date"]) <= 90.01
        assert m["plan_id"] == plans[90]["plan_id"] and m["status"] == "active"
        q_sub = m["subscription_id"]

        # Half-yearly -> today + 180 (NOT 270)
        m = _buy(tok, plans[180]["plan_id"])["membership"]
        d = _days_from_now(m["expiry_date"])
        assert 179.9 < d <= 180.01, f"half-yearly expiry {d} days"
        mm = _mem(tok)["membership"]
        assert mm["plan_id"] == plans[180]["plan_id"] and mm["expiry_date"] == m["expiry_date"]
        h_sub = m["subscription_id"]
        q_doc = _mongo.subscriptions.find_one({"subscription_id": q_sub})
        assert q_doc["status"] == "upgraded" and q_doc["upgraded_to"] == plans[180]["plan_id"]
        h_doc = _mongo.subscriptions.find_one({"subscription_id": h_sub})
        assert h_doc["is_upgrade"] is True and h_doc["upgraded_from"] == plans[90]["plan_id"]
        assert h_doc["is_renewal"] is False

        # Annual -> today + 365 (NOT ~2 years)
        m = _buy(tok, plans[365]["plan_id"])["membership"]
        d = _days_from_now(m["expiry_date"])
        assert 364.9 < d <= 365.01, f"annual expiry {d} days"
        a_sub = m["subscription_id"]
        assert _mongo.subscriptions.find_one({"subscription_id": h_sub})["status"] == "upgraded"
        mm = _mem(tok)
        assert mm["membership"]["plan_name"] == plans[365]["name"]
        assert 364 <= mm["membership"]["days_remaining"] <= 365

        # Same plan (Annual) again -> renewal: previous expiry + 365
        prev_exp = _dt(m["expiry_date"])
        m2 = _buy(tok, plans[365]["plan_id"])["membership"]
        assert abs((_dt(m2["expiry_date"]) - (prev_exp + timedelta(days=365))).total_seconds()) < 5
        r_doc = _mongo.subscriptions.find_one({"subscription_id": m2["subscription_id"]})
        assert r_doc["is_renewal"] is True and r_doc["is_upgrade"] is False
        # old annual sub NOT marked upgraded on renewal
        assert _mongo.subscriptions.find_one({"subscription_id": a_sub})["status"] == "active"

        # Payments: 4 recorded, linked to subscriptions
        pays = mm_pays = _mem(tok)["payments"]
        assert len(pays) == 4
        assert sorted(p["amount"] for p in pays) == [599, 799, 999, 999]
        assert all(p["status"] == "successful" and p["subscription_id"] for p in mm_pays)

        # Admin listings still work with 'upgraded' status
        r = requests.get(f"{API}/admin/subscriptions", headers=_h(admin_token))
        assert r.status_code == 200
        mine = [s for s in r.json()["subscriptions"] if s["candidate_id"] == u["user_id"]]
        assert len(mine) == 4
        eff = {s["subscription_id"]: s["effective_status"] for s in mine}
        assert eff[q_sub] == "upgraded" and eff[h_sub] == "upgraded"
        assert eff[m2["subscription_id"]] == "active"
        r = requests.get(f"{API}/admin/subscriptions?status=upgraded", headers=_h(admin_token))
        assert r.status_code == 200
        ids = {s["subscription_id"] for s in r.json()["subscriptions"]}
        assert {q_sub, h_sub} <= ids
        r = requests.get(f"{API}/admin/payments", headers=_h(admin_token))
        assert r.status_code == 200
        assert len([p for p in r.json()["payments"] if p["candidate_id"] == u["user_id"]]) == 4
        r = requests.get(f"{API}/admin/candidates/{u['user_id']}", headers=_h(admin_token))
        assert r.status_code == 200
        r = requests.get(f"{API}/admin/dashboard", headers=_h(admin_token))
        assert r.status_code == 200


# ---------------- Career usage after upgrade ----------------
class TestCareerUsageAfterUpgrade:
    def test_usage_annual_limit_counts_from_new_purchase(self, plans, created_users):
        u = _register()
        created_users.append(u["user_id"])
        tok = u["token"]
        _buy(tok, plans[90]["plan_id"])
        # seed 2 usage records during quarterly plan
        for _ in range(2):
            _mongo.career_usage.insert_one({"usage_id": f"use_TEST_{uuid.uuid4().hex[:8]}", "user_id": u["user_id"],
                                            "kind": "resume_analysis", "ref_id": "TEST",
                                            "created_at": datetime.now(timezone.utc).isoformat()})
        r = requests.get(f"{API}/career/usage", headers=_h(tok)).json()
        assert r["tier"] == "quarterly" and r["usage"]["resume_analysis"]["used"] == 2
        _buy(tok, plans[365]["plan_id"])
        r = requests.get(f"{API}/career/usage", headers=_h(tok))
        assert r.status_code == 200
        r = r.json()
        assert r["tier"] == "annual"
        assert r["usage"]["resume_analysis"]["limit"] == 40
        assert r["usage"]["interview_sessions"]["limit"] == 40
        assert r["usage"]["resume_analysis"]["used"] == 0
        assert "Annual" in r["period_label"]


# ---------------- Downgrade + expiring/expired edge cases ----------------
class TestEdgeCases:
    # Iteration 6: downgrade while active is BLOCKED (400), no payment, membership unchanged
    def test_downgrade_while_active_blocked(self, plans, created_users):
        u = _register()
        created_users.append(u["user_id"])
        tok = u["token"]
        m0 = _buy(tok, plans[365]["plan_id"])["membership"]
        sub_count = _mongo.subscriptions.count_documents({"candidate_id": u["user_id"]})
        for days in (90, 180):
            r = requests.post(f"{API}/checkout/demo", json={"plan_id": plans[days]["plan_id"]}, headers=_h(tok))
            assert r.status_code == 400, r.text
            assert "shorter plan after your current plan expires" in r.json()["detail"]
        mm = _mem(tok)
        assert len(mm["payments"]) == 1 and mm["payments"][0]["amount"] == 999
        assert _mongo.payments.count_documents({"candidate_id": u["user_id"]}) == 1
        assert _mongo.subscriptions.count_documents({"candidate_id": u["user_id"]}) == sub_count
        assert mm["membership"]["plan_id"] == plans[365]["plan_id"]
        assert mm["membership"]["expiry_date"] == m0["expiry_date"]
        assert mm["membership"]["subscription_id"] == m0["subscription_id"]
        # Annual sub not marked upgraded
        assert _mongo.subscriptions.find_one({"subscription_id": m0["subscription_id"]})["status"] == "active"

    def test_half_to_quarterly_blocked_and_half_to_annual_ok(self, plans, created_users):
        u = _register()
        created_users.append(u["user_id"])
        tok = u["token"]
        _buy(tok, plans[180]["plan_id"])
        r = requests.post(f"{API}/checkout/demo", json={"plan_id": plans[90]["plan_id"]}, headers=_h(tok))
        assert r.status_code == 400
        m = _buy(tok, plans[365]["plan_id"])["membership"]
        assert 364.9 < _days_from_now(m["expiry_date"]) <= 365.01
        assert len(_mem(tok)["payments"]) == 2

    def test_quarterly_to_annual_upgrade_and_renewal(self, plans, created_users):
        u = _register()
        created_users.append(u["user_id"])
        tok = u["token"]
        _buy(tok, plans[90]["plan_id"])
        m = _buy(tok, plans[365]["plan_id"])["membership"]
        assert 364.9 < _days_from_now(m["expiry_date"]) <= 365.01
        m2 = _buy(tok, plans[365]["plan_id"])["membership"]
        assert 729.9 < _days_from_now(m2["expiry_date"]) <= 730.02

    def test_downgrade_allowed_after_expiry(self, plans, admin_token, created_users):
        u = _register()
        created_users.append(u["user_id"])
        tok = u["token"]
        _buy(tok, plans[365]["plan_id"])
        r = requests.post(f"{API}/admin/dev/action", json={"candidate_id": u["user_id"], "action": "expire_now"},
                          headers=_h(admin_token))
        assert r.status_code == 200
        m = _buy(tok, plans[90]["plan_id"])["membership"]
        assert 89.9 < _days_from_now(m["expiry_date"]) <= 90.01

    def test_unknown_plan_404(self, created_users):
        u = _register()
        created_users.append(u["user_id"])
        r = requests.post(f"{API}/checkout/demo", json={"plan_id": "plan_nonexistent"}, headers=_h(u["token"]))
        assert r.status_code == 404

    def test_expired_then_buy_starts_today(self, plans, admin_token, created_users):
        u = _register()
        created_users.append(u["user_id"])
        _buy(u["token"], plans[90]["plan_id"])
        r = requests.post(f"{API}/admin/dev/action", json={"candidate_id": u["user_id"], "action": "expire_now"},
                          headers=_h(admin_token))
        assert r.status_code == 200 and r.json()["membership"]["status"] == "expired"
        m = _buy(u["token"], plans[90]["plan_id"])["membership"]
        assert 89.9 < _days_from_now(m["expiry_date"]) <= 90.01
        doc = _mongo.subscriptions.find_one({"subscription_id": m["subscription_id"]})
        assert doc["is_renewal"] is False and doc["is_upgrade"] is False

    def test_expiring_soon_same_plan_renewal_stacks(self, plans, admin_token, created_users):
        u = _register()
        created_users.append(u["user_id"])
        _buy(u["token"], plans[180]["plan_id"])
        r = requests.post(f"{API}/admin/dev/action", json={"candidate_id": u["user_id"], "action": "expiry_7"},
                          headers=_h(admin_token))
        assert r.json()["membership"]["status"] == "expiring_soon"
        m = _buy(u["token"], plans[180]["plan_id"])["membership"]
        d = _days_from_now(m["expiry_date"])
        assert 186.9 < d <= 187.01, f"renewal from expiring_soon {d}"


# ---------------- Admin developer panel ----------------
class TestDevPanel:
    def test_dev_activate_renew_upgrade(self, plans, admin_token, created_users):
        u = _register()
        created_users.append(u["user_id"])
        H = _h(admin_token)

        def act(a):
            r = requests.post(f"{API}/admin/dev/action", json={"candidate_id": u["user_id"], "action": a}, headers=H)
            assert r.status_code == 200, r.text
            return r.json()

        m = act("activate_90")["membership"]
        assert 89.9 < _days_from_now(m["expiry_date"]) <= 90.01
        m = act("simulate_renewal")["membership"]  # same plan -> stack
        assert 179.9 < _days_from_now(m["expiry_date"]) <= 180.01
        m = act("activate_90")["membership"]  # same plan -> stack
        assert 269.9 < _days_from_now(m["expiry_date"]) <= 270.01
        m = act("activate_365")["membership"]  # different plan -> replace
        assert 364.9 < _days_from_now(m["expiry_date"]) <= 365.01
        m = act("simulate_renewal")["membership"]  # renew annual
        assert 729.9 < _days_from_now(m["expiry_date"]) <= 730.02
        # Dev panel bypasses checkout downgrade guard: activate_90 while annual active -> replace today+90
        m = act("activate_90")["membership"]
        assert 89.9 < _days_from_now(m["expiry_date"]) <= 90.01
        assert act("reset_account")["success"] is True
        assert _mem(u["token"])["membership"]["status"] == "no_membership"
