"""
JobRadar by EevolveX — Backend regression tests
Covers: auth, premium gating, demo checkout, renewal stacking, admin, dev panel, save/apply, emails.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # fallback from frontend .env
    from pathlib import Path
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
BASE = BASE_URL.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@eevolvex.com"
ADMIN_PASS = "Admin@12345"
TEST_EMAIL = "test@jobradar.com"
TEST_PASS = "Test@12345"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def fresh_candidate(s):
    """Register a brand-new candidate so we have a clean membership state."""
    email = f"TEST_{uuid.uuid4().hex[:8]}@jobradar.io"
    payload = {
        "full_name": "TEST User",
        "email": email,
        "mobile": "9999900000",
        "password": "Test@12345",
        "confirm_password": "Test@12345",
        "consent": True,
        "preferred_function": "IT & Technology",
    }
    r = s.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "token": data["token"], "user_id": data["user"]["user_id"]}


@pytest.fixture(scope="session")
def cand_h(fresh_candidate):
    return {"Authorization": f"Bearer {fresh_candidate['token']}"}


@pytest.fixture(scope="session")
def plans(s):
    r = s.get(f"{API}/plans", timeout=30)
    assert r.status_code == 200
    plans = r.json()["plans"]
    assert len(plans) >= 3
    return {p["duration_days"]: p for p in plans}


# ---------- Basic health ----------
def test_api_root(s):
    r = s.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_config(s):
    r = s.get(f"{API}/config", timeout=15)
    assert r.status_code == 200
    assert "categories" in r.json()


def test_plans_seeded(plans):
    assert 90 in plans and 180 in plans and 365 in plans
    assert plans[90]["price"] == 499
    assert plans[180]["price"] == 799
    assert plans[365]["price"] == 1499


# ---------- Auth ----------
def test_login_existing_test_candidate(s):
    r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASS}, timeout=15)
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_wrong_password(s):
    r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_auth_me(s, cand_h):
    r = s.get(f"{API}/auth/me", headers=cand_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "candidate"
    assert body["membership"]["status"] == "no_membership"


def test_auth_me_no_token(s):
    r = s.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401


# ---------- Premium gating ----------
def test_jobs_list_non_member_locked(s, cand_h):
    r = s.get(f"{API}/jobs", headers=cand_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["is_member"] is False
    assert body["count"] > 0
    j = body["jobs"][0]
    assert j["locked"] is True
    # Premium fields MUST NOT be present
    for k in ["description", "recruiter_email", "application_link", "salary_range", "required_skills"]:
        assert k not in j, f"premium field {k} leaked in list for non-member"
    # admin fields never present
    assert "admin_notes" not in j
    assert "verification_score" not in j


def test_job_detail_non_member_locked(s, cand_h):
    lst = s.get(f"{API}/jobs", timeout=15).json()["jobs"]
    job_id = lst[0]["job_id"]
    r = s.get(f"{API}/jobs/{job_id}", headers=cand_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["is_member"] is False
    j = body["job"]
    assert j["locked"] is True
    for k in ["description", "recruiter_email", "application_link"]:
        assert k not in j, f"premium field {k} leaked in detail for non-member"
    assert "admin_notes" not in j
    assert "verification_score" not in j


def test_anon_list_locked(s):
    r = s.get(f"{API}/jobs", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["is_member"] is False
    for j in body["jobs"]:
        assert j["locked"] is True


# ---------- Demo checkout activates membership ----------
def test_demo_checkout_activates_90(s, fresh_candidate, cand_h, plans):
    plan = plans[90]
    r = s.post(f"{API}/checkout/demo", headers=cand_h, json={"plan_id": plan["plan_id"]}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    m = body["membership"]
    assert m["is_active"] is True
    assert m["status"] in ("active", "expiring_soon")
    assert m["is_demo"] is True
    # 90-day plan → days_remaining should be ~89-90
    assert 88 <= m["days_remaining"] <= 90
    assert body["payment"]["is_demo"] is True
    assert body["payment"]["status"] == "successful"


def test_membership_endpoint_reflects_active(s, cand_h):
    r = s.get(f"{API}/membership", headers=cand_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["membership"]["is_active"] is True
    assert len(body["payments"]) >= 1


def test_dashboard_has_membership(s, cand_h):
    r = s.get(f"{API}/dashboard", headers=cand_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["membership"]["is_active"] is True


def test_jobs_list_member_full_fields(s, cand_h):
    r = s.get(f"{API}/jobs", headers=cand_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["is_member"] is True
    j = body["jobs"][0]
    assert j["locked"] is False
    for k in ["description", "recruiter_email", "application_link"]:
        assert k in j, f"premium field {k} missing for active member"


def test_job_detail_member_full(s, cand_h):
    lst = s.get(f"{API}/jobs", headers=cand_h, timeout=15).json()["jobs"]
    job_id = lst[0]["job_id"]
    r = s.get(f"{API}/jobs/{job_id}", headers=cand_h, timeout=15)
    assert r.status_code == 200
    j = r.json()["job"]
    assert j["locked"] is False
    assert j.get("application_link")


# ---------- Save / unsave ----------
def test_save_and_unsave_job(s, cand_h):
    lst = s.get(f"{API}/jobs", headers=cand_h, timeout=15).json()["jobs"]
    job_id = lst[0]["job_id"]
    r = s.post(f"{API}/jobs/{job_id}/save", headers=cand_h, timeout=15)
    assert r.status_code == 200 and r.json()["saved"] is True
    r2 = s.get(f"{API}/saved-jobs", headers=cand_h, timeout=15)
    assert r2.status_code == 200
    assert any(j["job_id"] == job_id for j in r2.json()["jobs"])
    r3 = s.delete(f"{API}/jobs/{job_id}/save", headers=cand_h, timeout=15)
    assert r3.status_code == 200 and r3.json()["saved"] is False


# ---------- Apply click gating ----------
def test_apply_click_member_ok(s, cand_h):
    lst = s.get(f"{API}/jobs", headers=cand_h, timeout=15).json()["jobs"]
    job_id = lst[0]["job_id"]
    r = s.post(f"{API}/jobs/{job_id}/apply-click", headers=cand_h, timeout=15)
    assert r.status_code == 200
    assert r.json().get("application_link")


def test_apply_click_non_member_403(s):
    # register a brand new user with no membership
    email = f"TEST_apply_{uuid.uuid4().hex[:6]}@jobradar.io"
    reg = s.post(f"{API}/auth/register", json={
        "full_name": "TEST NM", "email": email, "mobile": "9999911111",
        "password": "Test@12345", "confirm_password": "Test@12345", "consent": True}, timeout=15).json()
    h = {"Authorization": f"Bearer {reg['token']}"}
    lst = s.get(f"{API}/jobs", timeout=15).json()["jobs"]
    job_id = lst[0]["job_id"]
    r = s.post(f"{API}/jobs/{job_id}/apply-click", headers=h, timeout=15)
    assert r.status_code == 403


# ---------- Admin access control ----------
def test_candidate_cannot_access_admin(s, cand_h):
    r = s.get(f"{API}/admin/dashboard", headers=cand_h, timeout=15)
    assert r.status_code == 403


def test_admin_login_and_dashboard(s, admin_h):
    r = s.get(f"{API}/admin/dashboard", headers=admin_h, timeout=30)
    assert r.status_code == 200
    body = r.json()
    for k in ["total_candidates", "active_members", "real_revenue", "demo_revenue", "jobs_published"]:
        assert k in body


def test_admin_dashboard_demo_isolated_from_real(s, admin_h):
    r = s.get(f"{API}/admin/dashboard", headers=admin_h, timeout=30).json()
    # We only made demo payments in this suite → real_revenue should still be 0
    assert r["real_revenue"] == 0, f"demo payments leaked into real_revenue: {r['real_revenue']}"
    assert r["demo_revenue"] > 0


# ---------- Renewal stacking (early renewal ADDS to remaining days) ----------
def test_early_renewal_stacks_duration(s, admin_h, plans):
    # Fresh candidate
    email = f"TEST_stack_{uuid.uuid4().hex[:6]}@jobradar.io"
    reg = s.post(f"{API}/auth/register", json={
        "full_name": "TEST Stack", "email": email, "mobile": "9999922222",
        "password": "Test@12345", "confirm_password": "Test@12345", "consent": True}, timeout=15).json()
    cid = reg["user"]["user_id"]

    # Activate 90 via dev panel
    r1 = s.post(f"{API}/admin/dev/action", headers=admin_h,
                json={"candidate_id": cid, "action": "activate_90"}, timeout=15)
    assert r1.status_code == 200
    days1 = r1.json()["membership"]["days_remaining"]
    assert 88 <= days1 <= 90

    # Simulate renewal while still active → should stack (add duration on top of remaining)
    r2 = s.post(f"{API}/admin/dev/action", headers=admin_h,
                json={"candidate_id": cid, "action": "simulate_renewal"}, timeout=15)
    assert r2.status_code == 200
    days2 = r2.json()["membership"]["days_remaining"]
    # Should be roughly days1 + 90 (allow small drift)
    assert days2 >= days1 + 88, f"renewal did not stack: {days1} → {days2}"
    assert days2 <= days1 + 91


def test_renewal_after_expiry_starts_now(s, admin_h):
    email = f"TEST_afterexp_{uuid.uuid4().hex[:6]}@jobradar.io"
    reg = s.post(f"{API}/auth/register", json={
        "full_name": "TEST Exp", "email": email, "mobile": "9999933333",
        "password": "Test@12345", "confirm_password": "Test@12345", "consent": True}, timeout=15).json()
    cid = reg["user"]["user_id"]

    # Activate then expire
    s.post(f"{API}/admin/dev/action", headers=admin_h,
           json={"candidate_id": cid, "action": "activate_90"}, timeout=15)
    r_exp = s.post(f"{API}/admin/dev/action", headers=admin_h,
                   json={"candidate_id": cid, "action": "expire_now"}, timeout=15)
    assert r_exp.status_code == 200
    assert r_exp.json()["membership"]["is_active"] is False

    # Renew after expiry → starts from now (~90 days remaining)
    r2 = s.post(f"{API}/admin/dev/action", headers=admin_h,
                json={"candidate_id": cid, "action": "simulate_renewal"}, timeout=15)
    assert r2.status_code == 200
    days = r2.json()["membership"]["days_remaining"]
    assert 88 <= days <= 90, f"renewal after expiry should start from today, got {days}"


def test_expire_now_blocks_premium_access(s, admin_h):
    email = f"TEST_block_{uuid.uuid4().hex[:6]}@jobradar.io"
    reg = s.post(f"{API}/auth/register", json={
        "full_name": "TEST Block", "email": email, "mobile": "9999944444",
        "password": "Test@12345", "confirm_password": "Test@12345", "consent": True}, timeout=15).json()
    cid = reg["user"]["user_id"]
    token = reg["token"]
    h = {"Authorization": f"Bearer {token}"}

    s.post(f"{API}/admin/dev/action", headers=admin_h,
           json={"candidate_id": cid, "action": "activate_90"}, timeout=15)

    # Confirm member sees full details
    lst = s.get(f"{API}/jobs", headers=h, timeout=15).json()
    assert lst["is_member"] is True
    assert "application_link" in lst["jobs"][0]

    # Expire now
    s.post(f"{API}/admin/dev/action", headers=admin_h,
           json={"candidate_id": cid, "action": "expire_now"}, timeout=15)

    lst2 = s.get(f"{API}/jobs", headers=h, timeout=15).json()
    assert lst2["is_member"] is False
    assert lst2["jobs"][0]["locked"] is True
    assert "application_link" not in lst2["jobs"][0]


# ---------- Dev Panel actions ----------
@pytest.mark.parametrize("action", [
    "activate_180", "activate_365", "expiry_7", "expiry_3", "expiry_1",
    "reminder_7", "reminder_3", "reminder_1",
    "simulate_failed_payment", "reset_account", "delete_subscription",
])
def test_dev_actions_smoke(s, admin_h, action):
    email = f"TEST_dev_{uuid.uuid4().hex[:6]}@jobradar.io"
    reg = s.post(f"{API}/auth/register", json={
        "full_name": "TEST Dev", "email": email, "mobile": "9999955555",
        "password": "Test@12345", "confirm_password": "Test@12345", "consent": True}, timeout=15).json()
    cid = reg["user"]["user_id"]

    # Most actions need an active sub first (except activate_180/365, simulate_failed_payment, reset_account)
    if action not in ("activate_180", "activate_365", "simulate_failed_payment", "reset_account"):
        s.post(f"{API}/admin/dev/action", headers=admin_h,
               json={"candidate_id": cid, "action": "activate_90"}, timeout=15)

    r = s.post(f"{API}/admin/dev/action", headers=admin_h,
               json={"candidate_id": cid, "action": action}, timeout=20)
    assert r.status_code == 200, f"{action} failed: {r.status_code} {r.text}"
    assert r.json().get("success") is True


# ---------- Admin job CRUD ----------
def test_admin_job_crud_flow(s, admin_h):
    payload = {
        "title": "TEST QA Engineer", "company": "TEST Corp",
        "function": "IT & Technology", "location": "Remote",
        "description": "TEST desc", "recruiter_email": "hr@test.com",
        "application_link": "https://example.com/apply", "status": "Published"}
    r = s.post(f"{API}/admin/jobs", headers=admin_h, json=payload, timeout=15)
    assert r.status_code == 200
    job_id = r.json()["job"]["job_id"]

    # feature
    r2 = s.post(f"{API}/admin/jobs/{job_id}/feature", headers=admin_h, json={"featured": True}, timeout=15)
    assert r2.status_code == 200

    # duplicate
    r3 = s.post(f"{API}/admin/jobs/{job_id}/duplicate", headers=admin_h, timeout=15)
    assert r3.status_code == 200
    dup_id = r3.json()["job"]["job_id"]

    # status change
    r4 = s.post(f"{API}/admin/jobs/{job_id}/status", headers=admin_h, json={"status": "Unpublished"}, timeout=15)
    assert r4.status_code == 200

    # update
    payload["title"] = "TEST QA Engineer Updated"
    r5 = s.put(f"{API}/admin/jobs/{job_id}", headers=admin_h, json=payload, timeout=15)
    assert r5.status_code == 200
    assert r5.json()["job"]["title"] == "TEST QA Engineer Updated"

    # delete both
    for jid in [job_id, dup_id]:
        rd = s.delete(f"{API}/admin/jobs/{jid}", headers=admin_h, timeout=15)
        assert rd.status_code == 200


# ---------- Emails logged ----------
def test_email_logs_recorded(s, admin_h):
    r = s.get(f"{API}/admin/emails", headers=admin_h, timeout=15)
    assert r.status_code == 200
    emails = r.json()["emails"]
    types = {e["email_type"] for e in emails}
    # We triggered welcome + membership_activated via fresh_candidate + demo checkout
    assert "welcome" in types
    assert "membership_activated" in types


# ---------- Forgot / reset password ----------
def test_forgot_password_ok(s):
    r = s.post(f"{API}/auth/forgot-password", json={"email": TEST_EMAIL}, timeout=15)
    assert r.status_code == 200
    assert r.json()["success"] is True
