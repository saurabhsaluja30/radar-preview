"""JobRadar — Iteration 7: Resume file upload, Launch offer/waitlist, plans hidden, single-device sessions.

NOTE: every email registration consumes a launch spot. Settings are restored to
enabled:true, plans_hidden:true, free_spots:100, free_days:90 at module teardown.
Real AI extraction (10-40s) is limited to 2 calls (docx + pdf).
"""
import io
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
API = f"{BASE_URL.rstrip('/')}/api"
ADMIN = {"email": "admin@eevolvex.com", "password": "Admin@12345"}
AI_TIMEOUT = 120
RESTORE = {"enabled": True, "plans_hidden": True, "free_spots": 100, "free_days": 90}

RESUME_LINES = [
    "Priya Sharma", "priya.sharma.test@example.com | +91 98765 43210 | Bengaluru, India",
    "PROFESSIONAL SUMMARY",
    "Senior Software Engineer with 7 years of experience building scalable backend systems in Python and Go.",
    "WORK EXPERIENCE",
    "Senior Software Engineer | Flipkart | Jan 2021 - Present",
    "- Led a team of 6 engineers to rebuild the order pipeline, cutting latency by 40%.",
    "- Designed event-driven microservices handling 2M orders per day on Kafka and Kubernetes.",
    "Software Engineer | Infosys | Jun 2017 - Dec 2020",
    "- Built REST APIs in Django for banking clients; improved test coverage from 30% to 85%.",
    "EDUCATION", "B.Tech Computer Science | VIT Vellore | 2017",
    "SKILLS", "Python, Go, Django, FastAPI, Kafka, Kubernetes, AWS, PostgreSQL, MongoDB",
]


def _docx_bytes():
    import docx
    d = docx.Document()
    for ln in RESUME_LINES:
        d.add_paragraph(ln)
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _pdf_bytes(lines):
    from reportlab.pdfgen import canvas
    buf = io.BytesIO()
    c = canvas.Canvas(buf)
    y = 800
    for ln in lines:
        c.drawString(40, y, ln)
        y -= 18
    c.save()
    return buf.getvalue()


def _register(tag):
    email = f"test_{tag}_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "full_name": f"TEST {tag}", "email": email, "mobile": "9876543210",
        "password": "Test@12345", "confirm_password": "Test@12345", "consent": True,
        "industry": "IT & Technology", "current_designation": "Engineer", "current_salary": "10 LPA",
        "preferred_location": "Bengaluru", "preferred_work_mode": "Hybrid",
        "preferred_function": "IT & Technology"}, timeout=30)
    assert r.status_code == 200, r.text
    return email, r.json()


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{API}/auth/admin/login", json=ADMIN, timeout=30)
    assert r.status_code == 200, r.text
    h = _h(r.json()["token"])
    yield h
    requests.put(f"{API}/admin/launch-offer", json=RESTORE, headers=h, timeout=30)


@pytest.fixture(scope="module")
def granted(admin_h):
    # make sure offer is on with spots before registering
    s = requests.get(f"{API}/admin/launch-offer", headers=admin_h, timeout=30).json()["settings"]
    requests.put(f"{API}/admin/launch-offer", json=RESTORE | {"free_spots": max(100, s.get("granted", 0) + 5)},
                 headers=admin_h, timeout=30)
    email, data = _register("granted")
    tok = data["token"]
    requests.post(f"{API}/career/consent", headers=_h(tok), timeout=30)
    return {"email": email, "token": tok, "user": data["user"]}


# ---------------- Launch offer (public + grant)
class TestLaunchOfferGrant:
    def test_public_launch_offer(self):
        r = requests.get(f"{API}/launch-offer", timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("enabled", "plans_hidden", "free_days", "spots_total", "spots_left"):
            assert k in d
        assert isinstance(d["spots_left"], int)

    def test_register_granted(self, granted):
        u = granted["user"]
        assert u["launch_offer"] == "granted"
        assert isinstance(u.get("launch_offer_rank"), int) and u["launch_offer_rank"] >= 1

    def test_membership_active_90_days(self, granted):
        m = requests.get(f"{API}/membership", headers=_h(granted["token"]), timeout=30).json()
        m = m.get("membership", m)
        assert m["is_active"] is True
        exp = datetime.fromisoformat(m["expiry_date"].replace("Z", "+00:00"))
        days = (exp - datetime.now(timezone.utc)).days
        assert 88 <= days <= 90, days

    def test_usage_quarterly_15(self, granted):
        d = requests.get(f"{API}/career/usage", headers=_h(granted["token"]), timeout=30).json()
        assert d["tier"] == "quarterly"
        assert d["usage"]["resume_generation"]["limit"] == 15, d["usage"]


# ---------------- Resume file upload
class TestResumeUpload:
    def _up(self, tok, name, data, mime):
        return requests.post(f"{API}/career/resumes/extract-file", headers=_h(tok),
                             files={"file": (name, data, mime)}, timeout=AI_TIMEOUT)

    def test_requires_auth(self):
        r = requests.post(f"{API}/career/resumes/extract-file",
                          files={"file": ("a.docx", b"x", "application/octet-stream")}, timeout=30)
        assert r.status_code == 401

    def test_txt_unsupported(self, granted):
        r = self._up(granted["token"], "cv.txt", ("\n".join(RESUME_LINES)).encode(), "text/plain")
        assert r.status_code == 400 and "Unsupported" in r.json()["detail"]

    def test_empty(self, granted):
        r = self._up(granted["token"], "cv.pdf", b"", "application/pdf")
        assert r.status_code == 400 and "empty" in r.json()["detail"].lower()

    def test_too_large(self, granted):
        r = self._up(granted["token"], "cv.pdf", b"%PDF-1.4\n" + b"0" * (5 * 1024 * 1024 + 10), "application/pdf")
        assert r.status_code == 400 and "5 MB" in r.json()["detail"]

    def test_short_pdf(self, granted):
        r = self._up(granted["token"], "short.pdf", _pdf_bytes(["Hello"]), "application/pdf")
        assert r.status_code == 400 and "couldn't read enough text" in r.json()["detail"]

    def test_corrupt_docx(self, granted):
        r = self._up(granted["token"], "bad.docx", b"not a real docx" * 20, "application/octet-stream")
        assert r.status_code == 400

    def test_docx_extract(self, granted):
        before = requests.get(f"{API}/career/usage", headers=_h(granted["token"]), timeout=30).json()
        used0 = before["usage"]["resume_generation"]["used"]
        r = self._up(granted["token"], "Priya_CV.docx", _docx_bytes(),
                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        assert r.status_code == 200, r.text
        d = r.json()
        res = d.get("resume", d)
        assert res["title"] == "Experienced Resume (Priya_CV)"
        assert "Priya" in res["personal"]["full_name"]
        assert len(res["sections"]) >= 3
        assert isinstance(res.get("missing_fields"), list)
        after = requests.get(f"{API}/career/usage", headers=_h(granted["token"]), timeout=30).json()
        assert after["usage"]["resume_generation"]["used"] == used0 + 1

    def test_pdf_extract(self, granted):
        r = self._up(granted["token"], "Priya_Resume.pdf", _pdf_bytes(RESUME_LINES), "application/pdf")
        assert r.status_code == 200, r.text
        res = r.json().get("resume", r.json())
        assert res["title"] == "Experienced Resume (Priya_Resume)"
        assert res["sections"]


# ---------------- Waitlist + approve + admin auth
class TestWaitlist:
    def test_waitlist_flow(self, admin_h, granted):
        s = requests.get(f"{API}/admin/launch-offer", headers=admin_h, timeout=30).json()["settings"]
        r = requests.put(f"{API}/admin/launch-offer", json=RESTORE | {"free_spots": s["granted"]},
                         headers=admin_h, timeout=30)
        assert r.status_code == 200
        pub = requests.get(f"{API}/launch-offer", timeout=30).json()
        assert pub["spots_left"] == 0
        email, data = _register("waitlist")
        u, tok = data["user"], data["token"]
        assert u["launch_offer"] == "waitlisted"
        m = requests.get(f"{API}/membership", headers=_h(tok), timeout=30).json()
        assert m.get("membership", m)["is_active"] is False
        wl = requests.get(f"{API}/admin/launch-offer", headers=admin_h, timeout=30).json()["waitlist"]
        assert any(w["user_id"] == u["user_id"] for w in wl)
        # approve
        r = requests.post(f"{API}/admin/launch-offer/approve/{u['user_id']}", headers=admin_h, timeout=30)
        assert r.status_code == 200, r.text
        me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=30).json()
        assert me["user"]["launch_offer"] == "approved"
        assert me["membership"]["is_active"] is True
        exp = datetime.fromisoformat(me["membership"]["expiry_date"].replace("Z", "+00:00"))
        assert 88 <= (exp - datetime.now(timezone.utc)).days <= 90
        # email logged
        em = requests.get(f"{API}/admin/emails", headers=admin_h, timeout=30)
        if em.status_code == 200:
            body = em.json()
            items = body.get("emails", body.get("items", body)) if isinstance(body, dict) else body
            assert any(e.get("email_type") == "waitlist_approved" and e.get("candidate_id") == u["user_id"]
                       for e in items), "waitlist_approved email not logged"
        # approve again -> 404
        r2 = requests.post(f"{API}/admin/launch-offer/approve/{u['user_id']}", headers=admin_h, timeout=30)
        assert r2.status_code == 404

    def test_candidate_forbidden(self, granted):
        h = _h(granted["token"])
        assert requests.get(f"{API}/admin/launch-offer", headers=h, timeout=30).status_code == 403
        assert requests.put(f"{API}/admin/launch-offer", json=RESTORE, headers=h, timeout=30).status_code == 403
        assert requests.post(f"{API}/admin/launch-offer/approve/x", headers=h, timeout=30).status_code == 403


# ---------------- Checkout hidden
class TestCheckoutHidden:
    def test_checkout_hidden_then_open(self, admin_h):
        plans = requests.get(f"{API}/plans", timeout=30).json()
        plans = plans.get("plans", plans) if isinstance(plans, dict) else plans
        pid = sorted(plans, key=lambda p: p["duration_days"])[0]["plan_id"]
        requests.put(f"{API}/admin/launch-offer", json=RESTORE | {"enabled": False}, headers=admin_h, timeout=30)
        _, data = _register("nooffer")
        assert data["user"].get("launch_offer") in (None, "none")
        tok = data["token"]
        r = requests.post(f"{API}/checkout/demo", json={"plan_id": pid}, headers=_h(tok), timeout=30)
        assert r.status_code == 400 and r.json()["detail"] == "Membership plans are not available right now."
        requests.put(f"{API}/admin/launch-offer", json=RESTORE | {"plans_hidden": False}, headers=admin_h, timeout=30)
        r = requests.post(f"{API}/checkout/demo", json={"plan_id": pid}, headers=_h(tok), timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["membership"]["is_active"] is True
        requests.put(f"{API}/admin/launch-offer", json=RESTORE, headers=admin_h, timeout=30)


# ---------------- Single device
class TestSingleDevice:
    def test_candidate_one_device(self, granted):
        cred = {"email": granted["email"], "password": "Test@12345"}
        t1 = requests.post(f"{API}/auth/login", json=cred, timeout=30).json()["token"]
        t2 = requests.post(f"{API}/auth/login", json=cred, timeout=30).json()["token"]
        r1 = requests.get(f"{API}/auth/me", headers=_h(t1), timeout=30)
        assert r1.status_code == 401 and "another device" in r1.json()["detail"]
        assert requests.get(f"{API}/auth/me", headers=_h(t2), timeout=30).status_code == 200
        # registration token from fixture also revoked
        assert requests.get(f"{API}/auth/me", headers=_h(granted["token"]), timeout=30).status_code == 401

    def test_admin_multi_device(self):
        t1 = requests.post(f"{API}/auth/admin/login", json=ADMIN, timeout=30).json()["token"]
        t2 = requests.post(f"{API}/auth/admin/login", json=ADMIN, timeout=30).json()["token"]
        assert requests.get(f"{API}/auth/me", headers=_h(t1), timeout=30).status_code == 200
        assert requests.get(f"{API}/auth/me", headers=_h(t2), timeout=30).status_code == 200


# ---------------- Regression
class TestRegression:
    def test_jobs_list_and_gating(self):
        r = requests.get(f"{API}/jobs", timeout=30)
        assert r.status_code == 200
        body = r.json()
        jobs = body.get("jobs", body.get("items", body)) if isinstance(body, dict) else body
        assert len(jobs) > 0
        d = requests.get(f"{API}/jobs/{jobs[0]['job_id']}", timeout=30)
        assert d.status_code == 200
        gj = d.json().get("job", d.json())
        assert gj.get("locked") is True and "application_link" not in gj

    def test_free_member_unlocked(self, granted):
        # launch-offer member gets premium job details
        tok = requests.post(f"{API}/auth/login", json={"email": granted["email"], "password": "Test@12345"},
                            timeout=30).json()["token"]
        body = requests.get(f"{API}/jobs", headers=_h(tok), timeout=30).json()
        assert body["is_member"] is True
        d = requests.get(f"{API}/jobs/{body['jobs'][0]['job_id']}", headers=_h(tok), timeout=30).json()["job"]
        assert d.get("locked") is False

    def test_final_restore(self, admin_h):
        r = requests.put(f"{API}/admin/launch-offer", json=RESTORE, headers=admin_h, timeout=30)
        s = r.json()["settings"]
        assert s["enabled"] and s["plans_hidden"] and s["free_spots"] == 100 and s["free_days"] == 90
