"""
JobRadar by EevolveX — Backend regression tests (Iteration 2).
Covers prior regression + new fields: plan prices, mandatory candidate fields,
international jobs, admin filters/fields, dashboard preference matching.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
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


# ---------------- Helpers ----------------
def _register_payload(email: str, **overrides):
    payload = {
        "full_name": "TEST User",
        "email": email,
        "mobile": "9999900000",
        "password": "Test@12345",
        "confirm_password": "Test@12345",
        "consent": True,
        "preferred_function": "IT & Technology",
        "preferred_location": "Bengaluru",
        "preferred_work_mode": "Hybrid",
        "industry": "IT & Technology",
        "current_designation": "Software Engineer",
        "current_salary": "12 LPA",
        "preferred_industries": ["IT & Technology"],
        "preferred_designation": "Senior Software Engineer",
    }
    payload.update(overrides)
    return payload


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_h(s):
    r = s.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def fresh_candidate(s):
    email = f"TEST_{uuid.uuid4().hex[:8]}@jobradar.io"
    r = s.post(f"{API}/auth/register", json=_register_payload(email), timeout=30)
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
    plist = r.json()["plans"]
    assert len(plist) >= 3
    return {p["duration_days"]: p for p in plist}


# ---------------- Basic ----------------
def test_api_root(s):
    r = s.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_config(s):
    r = s.get(f"{API}/config", timeout=15)
    assert r.status_code == 200
    assert "categories" in r.json()


# ---------------- Plan prices (NEW) ----------------
def test_plan_prices_updated(plans):
    assert 90 in plans and 180 in plans and 365 in plans
    assert plans[90]["price"] == 499, f"Quarterly expected 499 got {plans[90]['price']}"
    assert plans[180]["price"] == 699, f"Half-Yearly expected 699 got {plans[180]['price']}"
    assert plans[365]["price"] == 999, f"Annual expected 999 got {plans[365]['price']}"


# ---------------- Register validation (NEW mandatory fields) ----------------
@pytest.mark.parametrize("missing_field", ["industry", "current_designation",
                                           "current_salary", "preferred_location",
                                           "preferred_work_mode"])
def test_register_rejects_missing_mandatory_field(s, missing_field):
    email = f"TEST_missing_{missing_field}_{uuid.uuid4().hex[:6]}@jobradar.io"
    payload = _register_payload(email, **{missing_field: None})
    r = s.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 400, f"expected 400 for missing {missing_field}, got {r.status_code} {r.text}"


def test_register_stores_new_fields(s):
    email = f"TEST_newfields_{uuid.uuid4().hex[:6]}@jobradar.io"
    r = s.post(f"{API}/auth/register", json=_register_payload(email), timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=15).json()
    u = me["user"]
    assert u["industry"] == "IT & Technology"
    assert u["current_designation"] == "Software Engineer"
    assert u["current_salary"] == "12 LPA"
    assert u["preferred_industries"] == ["IT & Technology"]
    assert u["preferred_work_mode"] == "Hybrid"


# ---------------- Auth basic ----------------
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


# ---------------- Jobs filters & international (NEW) ----------------
def test_jobs_region_international(s):
    r = s.get(f"{API}/jobs?region=International", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    j = body["jobs"][0]
    assert j["region"] == "International"
    for k in ["region", "country", "city", "currency", "visa_info", "industry_category"]:
        assert k in j, f"intl job missing field {k}"


def test_jobs_region_india(s):
    r = s.get(f"{API}/jobs?region=India", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    for j in body["jobs"]:
        assert j["region"] == "India", f"expected India got {j.get('region')}"


def test_jobs_industry_category_filter(s):
    r = s.get(f"{API}/jobs?industry_category=IT %26 Technology", timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] >= 1
    for j in body["jobs"]:
        assert j["industry_category"] == "IT & Technology"


def test_existing_jobs_backfilled(s):
    r = s.get(f"{API}/jobs", timeout=15).json()
    for j in r["jobs"]:
        assert j.get("industry_category"), f"job {j['job_id']} missing industry_category"
        assert j.get("region") in ("India", "International"), f"job {j['job_id']} region={j.get('region')}"


def test_job_detail_non_member_shows_intl_fields(s):
    intl = s.get(f"{API}/jobs?region=International", timeout=15).json()["jobs"]
    assert intl, "no intl jobs seeded"
    job_id = intl[0]["job_id"]
    r = s.get(f"{API}/jobs/{job_id}", timeout=15)
    assert r.status_code == 200
    j = r.json()["job"]
    assert j["locked"] is True
    for k in ["region", "country", "city", "visa_info", "industry_category"]:
        assert k in j, f"non-member detail missing public intl field {k}"
    for k in ["description", "recruiter_email", "application_link", "salary_range"]:
        assert k not in j, f"premium field {k} leaked to non-member"


# ---------------- Premium gating still works ----------------
def test_jobs_list_non_member_locked(s, cand_h):
    r = s.get(f"{API}/jobs", headers=cand_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body["is_member"] is False
    j = body["jobs"][0]
    assert j["locked"] is True
    for k in ["description", "recruiter_email", "application_link"]:
        assert k not in j


# ---------------- Demo checkout with new price ----------------
def test_demo_checkout_quarterly(s, fresh_candidate, cand_h, plans):
    plan = plans[90]
    assert plan["price"] == 499
    r = s.post(f"{API}/checkout/demo", headers=cand_h, json={"plan_id": plan["plan_id"]}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["payment"]["is_demo"] is True
    assert body["payment"]["amount"] == 499
    m = body["membership"]
    assert m["is_active"] is True
    assert 88 <= m["days_remaining"] <= 90


def test_jobs_member_full(s, cand_h):
    r = s.get(f"{API}/jobs", headers=cand_h, timeout=15).json()
    assert r["is_member"] is True
    assert "application_link" in r["jobs"][0]


def test_membership_endpoint(s, cand_h):
    r = s.get(f"{API}/membership", headers=cand_h, timeout=15).json()
    assert r["membership"]["is_active"] is True


# ---------------- Profile update (NEW fields) ----------------
def test_profile_update_new_fields(s, cand_h):
    body = {
        "industry": "Finance & Accounting",
        "current_designation": "Analyst",
        "current_salary": "15 LPA",
        "preferred_industries": ["Finance & Accounting", "IT & Technology"],
        "preferred_designation": "Senior Analyst",
        "preferred_work_mode": "Remote",
        "preferred_location": "Mumbai",
    }
    r = s.put(f"{API}/auth/profile", headers=cand_h, json=body, timeout=15)
    assert r.status_code == 200, r.text
    me = s.get(f"{API}/auth/me", headers=cand_h, timeout=15).json()["user"]
    assert me["industry"] == "Finance & Accounting"
    assert me["current_designation"] == "Analyst"
    assert me["preferred_industries"] == ["Finance & Accounting", "IT & Technology"]
    assert me["preferred_work_mode"] == "Remote"


# ---------------- Dashboard preference matching ----------------
def test_dashboard_preference_matching(s, cand_h):
    # Candidate above now prefers Finance & Accounting + IT, remote
    r = s.get(f"{API}/dashboard", headers=cand_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    recs = body.get("recommended_jobs") or []
    # Allow empty if no match, but if present should be in preferred industries
    cats = {j.get("industry_category") for j in recs}
    assert cats.issubset({"Finance & Accounting", "IT & Technology", None, ""}) or not recs, \
        f"recommended_jobs contain non-preferred industries: {cats}"


# ---------------- Admin job CRUD (NEW fields) ----------------
def test_admin_create_job_with_new_fields(s, admin_h):
    payload = {
        "title": "TEST Intl SRE", "company": "TEST Global",
        "function": "IT & Technology", "industry_category": "IT & Technology",
        "region": "International", "city": "Berlin", "country": "Germany",
        "currency": "EUR", "designation": "Senior SRE",
        "visa_info": "EU Blue Card sponsorship available",
        "location": "Berlin", "description": "TEST desc",
        "recruiter_email": "hr@test.com",
        "application_link": "https://example.com/apply", "status": "Published",
    }
    r = s.post(f"{API}/admin/jobs", headers=admin_h, json=payload, timeout=15)
    assert r.status_code == 200, r.text
    job = r.json()["job"]
    job_id = job["job_id"]
    for k in ["industry_category", "region", "city", "country", "currency", "designation", "visa_info"]:
        assert job.get(k) == payload[k], f"{k} not persisted: {job.get(k)}"

    # update
    payload["city"] = "Munich"
    payload["currency"] = "USD"
    r2 = s.put(f"{API}/admin/jobs/{job_id}", headers=admin_h, json=payload, timeout=15)
    assert r2.status_code == 200
    j2 = r2.json()["job"]
    assert j2["city"] == "Munich"
    assert j2["currency"] == "USD"

    # admin filter by region=International should include this job
    rf = s.get(f"{API}/admin/jobs?region=International", headers=admin_h, timeout=15).json()
    ids = [j["job_id"] for j in rf["jobs"]]
    assert job_id in ids

    # admin filter by industry_category
    rf2 = s.get(f"{API}/admin/jobs?industry_category=IT %26 Technology", headers=admin_h, timeout=15).json()
    for j in rf2["jobs"]:
        assert j["industry_category"] == "IT & Technology"

    # admin filter by country
    rf3 = s.get(f"{API}/admin/jobs?country=Germany", headers=admin_h, timeout=15).json()
    assert any(j["job_id"] == job_id for j in rf3["jobs"])

    # cleanup
    rd = s.delete(f"{API}/admin/jobs/{job_id}", headers=admin_h, timeout=15)
    assert rd.status_code == 200


# ---------------- Admin candidate filter by industry (NEW) ----------------
def test_admin_candidates_industry_filter(s, admin_h):
    r = s.get(f"{API}/admin/candidates?industry=IT %26 Technology", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    cands = body.get("candidates") or body.get("items") or []
    assert len(cands) >= 1
    sample = cands[0]
    for k in ["industry", "current_designation", "current_salary",
              "preferred_industries", "preferred_designation", "preferred_work_mode"]:
        assert k in sample, f"admin candidate missing field {k}"


# ---------------- Admin dashboard regression ----------------
def test_admin_dashboard_real_vs_demo(s, admin_h):
    r = s.get(f"{API}/admin/dashboard", headers=admin_h, timeout=30).json()
    for k in ["total_candidates", "active_members", "real_revenue", "demo_revenue", "jobs_published"]:
        assert k in r
    assert r["real_revenue"] == 0
    assert r["demo_revenue"] >= 0


# ---------------- Forgot password ----------------
def test_forgot_password(s):
    r = s.post(f"{API}/auth/forgot-password", json={"email": TEST_EMAIL}, timeout=15)
    assert r.status_code == 200
