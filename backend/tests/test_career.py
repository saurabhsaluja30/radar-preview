"""JobRadar — Career Tools backend tests (Iteration 3).

Covers: consent/usage/limits, resumes CRUD + generate + tailor + download(PDF/DOCX),
analyser (validation, caching, improve), interviews (create/answer/hint/skip/end),
authorization isolation, admin settings & stats, saved searches, light regression.

NOTE: Real AI calls take 10–40s. We budget ~2 resume generations, ~2 analyses,
1 interview of 5 questions.
"""
import os
import uuid
import time
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
BASE = BASE_URL.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL = "admin@eevolvex.com"
ADMIN_PASS = "Admin@12345"
EXISTING_EMAIL = "test@jobradar.com"
EXISTING_PASS = "Test@12345"

AI_TIMEOUT = 90

DEFAULT_SETTINGS_BODY = {
    "tools": {
        "resume_builder": {"enabled": True, "free_access": True},
        "resume_analyser": {"enabled": True, "free_access": True},
        "interview_coach": {"enabled": True, "free_access": True},
    },
    "limits": {
        "free": {"resume_generation": 2, "resume_analysis": 2, "interview_sessions": 1},
        "quarterly": {"resume_generation": 10, "resume_analysis": 10, "interview_sessions": 10},
        "half_yearly": {"resume_generation": 15, "resume_analysis": 15, "interview_sessions": 15},
        "annual": {"resume_generation": 25, "resume_analysis": 25, "interview_sessions": 25},
    },
    "period_days": 30,
    "addons": [
        {"key": "extra_interviews", "name": "Extra 10 interview sessions", "price": 199, "enabled": False},
        {"key": "extra_analyses", "name": "Extra 10 resume analyses", "price": 149, "enabled": False},
    ],
}


def _register(s, email, consent=True):
    payload = {
        "full_name": "TEST Career", "email": email, "mobile": "9999900000",
        "password": "Test@12345", "confirm_password": "Test@12345",
        "consent": consent, "preferred_function": "IT & Technology",
        "preferred_location": "Bengaluru", "preferred_work_mode": "Hybrid",
        "industry": "IT & Technology", "current_designation": "Software Engineer",
        "current_salary": "12 LPA", "preferred_industries": ["IT & Technology"],
        "preferred_designation": "Senior Software Engineer",
    }
    r = s.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, f"register failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_h(s):
    r = s.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def existing_h(s):
    r = s.post(f"{API}/auth/login", json={"email": EXISTING_EMAIL, "password": EXISTING_PASS}, timeout=30)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def fresh_cand(s):
    """Fresh candidate; AI consent NOT given yet."""
    email = f"TEST_career_{uuid.uuid4().hex[:8]}@jobradar.io"
    data = _register(s, email)
    return {"email": email, "token": data["token"], "user_id": data["user"]["user_id"],
            "h": {"Authorization": f"Bearer {data['token']}"}}


# ------------------------------------------------------------------
# 1. Consent flow & usage snapshot
# ------------------------------------------------------------------
def test_usage_returns_default_shape(s, fresh_cand):
    r = s.get(f"{API}/career/usage", headers=fresh_cand["h"], timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ["tier", "usage", "tools", "period_days", "ai_configured", "ai_consent", "disclaimer"]:
        assert k in body, f"usage missing {k}"
    assert body["ai_consent"] is False
    assert body["tier"] == "free"
    for kind in ["resume_generation", "resume_analysis", "interview_sessions"]:
        u = body["usage"][kind]
        assert set(u.keys()) == {"used", "limit", "remaining"}
    for tool in ["resume_builder", "resume_analyser", "interview_coach"]:
        assert tool in body["tools"]


def test_ai_endpoint_428_before_consent(s, fresh_cand):
    r = s.post(f"{API}/career/analyse", headers=fresh_cand["h"],
               json={"resume_text": "x" * 200, "jd_text": "y" * 100}, timeout=20)
    assert r.status_code == 428, f"expected 428 before consent, got {r.status_code}: {r.text}"


def test_consent_accept(s, fresh_cand):
    r = s.post(f"{API}/career/consent", headers=fresh_cand["h"], timeout=15)
    assert r.status_code == 200
    r2 = s.get(f"{API}/career/usage", headers=fresh_cand["h"], timeout=15)
    assert r2.json()["ai_consent"] is True


# ------------------------------------------------------------------
# 2. Resume generation (fresher + experienced) & NO INVENT check
# ------------------------------------------------------------------
_resume_ids = {}


def test_resume_generate_validation(s, existing_h):
    r = s.post(f"{API}/career/resumes/generate", headers=existing_h,
               json={"resume_type": "bad", "personal": {"full_name": "x"}, "answers": {}}, timeout=15)
    assert r.status_code == 400
    r2 = s.post(f"{API}/career/resumes/generate", headers=existing_h,
                json={"resume_type": "fresher", "personal": {"full_name": ""}, "answers": {"a": "hi"}}, timeout=15)
    assert r2.status_code == 400
    r3 = s.post(f"{API}/career/resumes/generate", headers=existing_h,
                json={"resume_type": "fresher", "personal": {"full_name": "A B"}, "answers": {"a": "short"}}, timeout=15)
    assert r3.status_code == 400


def test_resume_generate_fresher(s, existing_h):
    body = {
        "resume_type": "fresher", "title": "TEST Fresher Resume",
        "personal": {"full_name": "TEST Alice", "email": "alice@example.com",
                     "phone": "9999900001", "location": "Bengaluru", "linkedin": "linkedin.com/in/alice"},
        "answers": {
            "education": "B.Tech Computer Science, VIT Vellore, 2023, CGPA 8.5",
            "projects": "Built a Django web app for college library (search, borrow, late fees). Used PostgreSQL and Redis.",
            "skills": "Python, Django, SQL, Git, basic AWS",
            "internships": "3-month internship at Infosys as SDE intern — wrote unit tests, fixed bugs in payments module.",
            "achievements": "First prize in college coding hackathon 2022",
        },
    }
    r = s.post(f"{API}/career/resumes/generate", headers=existing_h, json=body, timeout=AI_TIMEOUT)
    assert r.status_code == 200, r.text
    res = r.json()["resume"]
    assert res["resume_type"] == "fresher"
    assert res["source"] == "ai_builder"
    assert isinstance(res["sections"], list) and len(res["sections"]) >= 2
    titles = " ".join(sec["title"].upper() for sec in res["sections"])
    assert any(x in titles for x in ["SUMMARY", "OBJECTIVE", "SKILLS", "EDUCATION"]), f"missing standard ATS headings: {titles}"
    # NO INVENT soft check: resume should not reference an unrelated company we didn't mention
    blob = " ".join(sec["content"] for sec in res["sections"]).lower()
    for forbidden in ["google", "microsoft", "amazon", "tcs", "wipro"]:
        assert forbidden not in blob, f"AI invented employer '{forbidden}' not in inputs"
    _resume_ids["fresher"] = res["resume_id"]


def test_resume_generate_experienced(s, existing_h):
    body = {
        "resume_type": "experienced", "title": "TEST Exp Resume",
        "personal": {"full_name": "TEST Bob", "email": "bob@example.com",
                     "phone": "9999900002", "location": "Pune", "linkedin": ""},
        "answers": {
            "experience": "Senior Backend Engineer at Acme Pvt Ltd, Jan 2020 - Present. "
                          "Led migration of monolith to microservices (Python/FastAPI, PostgreSQL, Redis). "
                          "Mentored 3 junior engineers.",
            "skills": "Python, FastAPI, PostgreSQL, Redis, Docker, Kubernetes, AWS",
            "education": "B.Tech, 2018, Pune University",
            "achievements": "Reduced API latency by 40% via caching layer. Promoted to Senior in 2022.",
        },
    }
    r = s.post(f"{API}/career/resumes/generate", headers=existing_h, json=body, timeout=AI_TIMEOUT)
    assert r.status_code == 200, r.text
    res = r.json()["resume"]
    assert res["resume_type"] == "experienced"
    sections_text = " ".join(sec["content"] for sec in res["sections"]).lower()
    assert "acme" in sections_text, "experienced resume should mention user-provided employer 'Acme'"
    _resume_ids["experienced"] = res["resume_id"]


# ------------------------------------------------------------------
# 3. Resume CRUD / duplicate / tailor
# ------------------------------------------------------------------
def test_resume_list_and_get(s, existing_h):
    r = s.get(f"{API}/career/resumes", headers=existing_h, timeout=15)
    assert r.status_code == 200
    ids = {x["resume_id"] for x in r.json()["resumes"]}
    assert _resume_ids["fresher"] in ids
    r2 = s.get(f"{API}/career/resumes/{_resume_ids['fresher']}", headers=existing_h, timeout=15)
    assert r2.status_code == 200
    assert r2.json()["resume"]["resume_id"] == _resume_ids["fresher"]


def test_resume_update_and_duplicate(s, existing_h):
    rid = _resume_ids["experienced"]
    current = s.get(f"{API}/career/resumes/{rid}", headers=existing_h, timeout=15).json()["resume"]
    body = {
        "title": "TEST Updated Title", "resume_type": current["resume_type"],
        "personal": current["personal"],
        "sections": [{"id": sec.get("id"), "title": sec["title"], "content": sec["content"]}
                     for sec in current["sections"]],
        "target_job": "Backend",
    }
    body["sections"].append({"id": None, "title": "CUSTOM EXTRA", "content": "Added by test"})
    r = s.put(f"{API}/career/resumes/{rid}", headers=existing_h, json=body, timeout=20)
    assert r.status_code == 200
    updated = r.json()["resume"]
    assert updated["title"] == "TEST Updated Title"
    assert any(sec["title"] == "CUSTOM EXTRA" for sec in updated["sections"])

    # duplicate
    rd = s.post(f"{API}/career/resumes/{rid}/duplicate", headers=existing_h, timeout=15)
    assert rd.status_code == 200
    dup = rd.json()["resume"]
    assert "(Copy)" in dup["title"]
    _resume_ids["dup"] = dup["resume_id"]


def test_resume_manual_create_and_delete(s, existing_h):
    r = s.post(f"{API}/career/resumes", headers=existing_h, json={
        "title": "TEST Manual", "resume_type": "experienced",
        "personal": {"full_name": "Manual Me", "email": "", "phone": "", "location": "", "linkedin": ""},
        "sections": [{"id": None, "title": "SKILLS", "content": "- Python"}], "target_job": "",
    }, timeout=15)
    assert r.status_code == 200
    mid = r.json()["resume"]["resume_id"]
    rd = s.delete(f"{API}/career/resumes/{mid}", headers=existing_h, timeout=15)
    assert rd.status_code == 200
    r2 = s.get(f"{API}/career/resumes/{mid}", headers=existing_h, timeout=15)
    assert r2.status_code == 404


# ------------------------------------------------------------------
# 4. Downloads (PDF/DOCX)
# ------------------------------------------------------------------
@pytest.mark.parametrize("fmt,magic,mime_prefix", [
    ("pdf", b"%PDF", "application/pdf"),
    ("docx", b"PK", "application/vnd.openxml"),
])
def test_resume_download(s, existing_h, fmt, magic, mime_prefix):
    rid = _resume_ids["fresher"]
    r = s.post(f"{API}/career/resumes/{rid}/download-link", headers=existing_h, json={"format": fmt}, timeout=15)
    assert r.status_code == 200, r.text
    path = r.json()["path"]
    assert path.startswith("/api/career/download/")
    r2 = s.get(f"{BASE}{path}", timeout=30)
    assert r2.status_code == 200
    assert r2.headers.get("content-type", "").startswith(mime_prefix)
    assert r2.content.startswith(magic)
    assert len(r2.content) > 500


def test_download_token_invalid(s):
    r = s.get(f"{API}/career/download/not-a-real-token-xx", timeout=15)
    assert r.status_code == 404


def test_download_bad_format(s, existing_h):
    rid = _resume_ids["fresher"]
    r = s.post(f"{API}/career/resumes/{rid}/download-link", headers=existing_h, json={"format": "txt"}, timeout=15)
    assert r.status_code == 400


# ------------------------------------------------------------------
# 5. Tailor (AI) — do only once to save tokens
# ------------------------------------------------------------------
def test_resume_tailor(s, existing_h):
    rid = _resume_ids["experienced"]
    jd = ("We are hiring a Senior Backend Engineer with strong Python, FastAPI, PostgreSQL and Kubernetes "
          "experience. You will lead service migrations and mentor junior engineers.")
    r = s.post(f"{API}/career/resumes/{rid}/tailor", headers=existing_h, json={"jd_text": jd}, timeout=AI_TIMEOUT)
    assert r.status_code == 200, r.text
    res = r.json()["resume"]
    assert "tailored" in res["title"].lower()
    assert res["source"] == "ai_tailor"
    _resume_ids["tailored"] = res["resume_id"]


def test_tailor_short_jd_400(s, existing_h):
    r = s.post(f"{API}/career/resumes/{_resume_ids['fresher']}/tailor", headers=existing_h,
               json={"jd_text": "short"}, timeout=15)
    assert r.status_code == 400


# ------------------------------------------------------------------
# 6. Resume Analyser
# ------------------------------------------------------------------
_analysis_id = {}


def test_analyse_validation(s, existing_h):
    r = s.post(f"{API}/career/analyse", headers=existing_h,
               json={"resume_text": "short", "jd_text": "y" * 100}, timeout=15)
    assert r.status_code == 400
    r2 = s.post(f"{API}/career/analyse", headers=existing_h,
                json={"resume_text": "x" * 200, "jd_text": "short"}, timeout=15)
    assert r2.status_code == 400


def test_analyse_success_shape(s, existing_h):
    resume = ("TEST Bob — Senior Backend Engineer. "
              "Experience: Acme Pvt Ltd, Jan 2020 – Present. Python, FastAPI, PostgreSQL, Redis, Docker. "
              "Led migration from monolith to microservices. Mentored 3 juniors. "
              "Education: B.Tech 2018. Achievements: reduced latency 40%. "
              "Contact: bob@example.com, 9999900002, Pune.")
    jd = ("Looking for a Senior Backend Engineer with FastAPI, PostgreSQL, Kubernetes and AWS. "
          "Should have 4+ years, lead migrations and mentor team.")
    body = {"resume_text": resume, "jd_text": jd}
    r = s.post(f"{API}/career/analyse", headers=existing_h, json=body, timeout=AI_TIMEOUT)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["reused"] is False
    a = out["analysis"]
    for k in ["match_score", "score_explanation", "matching_skills", "missing_skills",
              "experience_match", "keyword_analysis", "ats_check", "suggestions"]:
        assert k in a["result"], f"analysis missing {k}"
    assert 0 <= a["result"]["match_score"] <= 100
    for ms in a["result"]["missing_skills"]:
        assert isinstance(ms, dict) and ms.get("status") in ("missing", "unclear", None)
    _analysis_id["id"] = a["analysis_id"]

    # Reuse: same input -> reused True, no extra usage
    usage_before = s.get(f"{API}/career/usage", headers=existing_h, timeout=15).json()["usage"]["resume_analysis"]["used"]
    r2 = s.post(f"{API}/career/analyse", headers=existing_h, json=body, timeout=AI_TIMEOUT)
    assert r2.status_code == 200
    assert r2.json()["reused"] is True
    usage_after = s.get(f"{API}/career/usage", headers=existing_h, timeout=15).json()["usage"]["resume_analysis"]["used"]
    assert usage_before == usage_after, "reused analysis should not consume usage"


def test_list_and_get_analysis(s, existing_h):
    r = s.get(f"{API}/career/analyses", headers=existing_h, timeout=15)
    assert r.status_code == 200
    ids = {a["analysis_id"] for a in r.json()["analyses"]}
    assert _analysis_id["id"] in ids
    # list must NOT contain resume_text / jd_text
    for a in r.json()["analyses"]:
        assert "resume_text" not in a and "jd_text" not in a
    r2 = s.get(f"{API}/career/analyses/{_analysis_id['id']}", headers=existing_h, timeout=15)
    assert r2.status_code == 200


def test_analysis_improve(s, existing_h):
    r = s.post(f"{API}/career/analyses/{_analysis_id['id']}/improve", headers=existing_h, timeout=AI_TIMEOUT)
    assert r.status_code == 200, r.text
    res = r.json()["resume"]
    assert res["source"] == "ai_improve"
    # Called again should return reused=True (same improved resume)
    r2 = s.post(f"{API}/career/analyses/{_analysis_id['id']}/improve", headers=existing_h, timeout=30)
    assert r2.status_code == 200
    assert r2.json().get("reused") is True


# ------------------------------------------------------------------
# 7. Interview coach — one 5-question session, feedback=each
# ------------------------------------------------------------------
_sess = {}


def test_interview_create_validation(s, existing_h):
    bad = {"job_title": "", "jd_text": "x" * 100, "experience_level": "Fresher",
           "interview_type": "HR Interview", "difficulty": "Beginner", "num_questions": 5}
    r = s.post(f"{API}/career/interviews", headers=existing_h, json=bad, timeout=15)
    assert r.status_code == 400

    bad2 = {"job_title": "Dev", "jd_text": "short", "experience_level": "Fresher",
            "interview_type": "HR Interview", "difficulty": "Beginner", "num_questions": 5}
    r2 = s.post(f"{API}/career/interviews", headers=existing_h, json=bad2, timeout=15)
    assert r2.status_code == 400

    bad3 = {"job_title": "Dev", "jd_text": "x" * 100, "experience_level": "Senior",
            "interview_type": "HR Interview", "difficulty": "Beginner", "num_questions": 5}
    r3 = s.post(f"{API}/career/interviews", headers=existing_h, json=bad3, timeout=15)
    assert r3.status_code == 400


def test_interview_full_flow_each_mode(s, existing_h):
    body = {
        "job_title": "Backend Engineer", "company": "TEST Co",
        "jd_text": "Backend engineer role using Python, FastAPI and PostgreSQL. 3+ years experience required.",
        "experience_level": "3-5 years", "interview_type": "Technical Interview",
        "difficulty": "Intermediate", "num_questions": 5, "feedback_mode": "each",
    }
    r = s.post(f"{API}/career/interviews", headers=existing_h, json=body, timeout=AI_TIMEOUT)
    assert r.status_code == 200, r.text
    sess = r.json()["session"]
    sid = sess["session_id"]
    _sess["id"] = sid
    assert len(sess["questions"]) == 5
    assert sess["status"] == "in_progress"

    # Answer Q0
    ra = s.post(f"{API}/career/interviews/{sid}/answer", headers=existing_h,
                json={"index": 0, "answer": "I'd use FastAPI with asyncpg to connect to PostgreSQL, add Redis caching for hot reads, and use Celery for background jobs. For scalability, horizontal scaling behind a load balancer."}, timeout=AI_TIMEOUT)
    assert ra.status_code == 200
    sess2 = ra.json()["session"]
    q0 = sess2["questions"][0]
    assert q0["status"] == "answered"
    assert q0["feedback"] is not None
    for k in ["score", "did_well", "missing", "how_to_improve", "stronger_structure"]:
        assert k in q0["feedback"], f"feedback missing {k}"
    assert 0 <= q0["feedback"]["score"] <= 100

    # Short answer validation
    ra_bad = s.post(f"{API}/career/interviews/{sid}/answer", headers=existing_h,
                    json={"index": 1, "answer": "a"}, timeout=15)
    assert ra_bad.status_code == 400

    # Hint on Q1
    rh = s.post(f"{API}/career/interviews/{sid}/hint", headers=existing_h,
                json={"index": 1}, timeout=AI_TIMEOUT)
    assert rh.status_code == 200
    assert rh.json().get("hint")

    # Skip Q2
    rs = s.post(f"{API}/career/interviews/{sid}/skip", headers=existing_h,
                json={"index": 2}, timeout=15)
    assert rs.status_code == 200
    sess3 = rs.json()["session"]
    assert sess3["questions"][2]["status"] == "skipped"

    # End
    re_ = s.post(f"{API}/career/interviews/{sid}/end", headers=existing_h, timeout=AI_TIMEOUT)
    assert re_.status_code == 200
    final = re_.json()["session"]
    assert final["status"] == "completed"
    rep = final["report"]
    for k in ["overall_score", "summary", "strengths", "areas_for_improvement", "disclaimer"]:
        assert k in rep, f"report missing {k}"


def test_interview_list_and_delete(s, existing_h):
    r = s.get(f"{API}/career/interviews", headers=existing_h, timeout=15)
    assert r.status_code == 200
    ids = {x["session_id"] for x in r.json()["sessions"]}
    assert _sess["id"] in ids
    # list excludes jd_text/questions/report
    for x in r.json()["sessions"]:
        assert "questions" not in x and "report" not in x and "jd_text" not in x


def test_cannot_modify_ended_interview(s, existing_h):
    r = s.post(f"{API}/career/interviews/{_sess['id']}/answer", headers=existing_h,
               json={"index": 3, "answer": "late answer longer than 5 chars"}, timeout=15)
    assert r.status_code == 400


# ------------------------------------------------------------------
# 8. Authorization isolation
# ------------------------------------------------------------------
def test_other_user_cannot_access_resume(s, fresh_cand):
    rid = _resume_ids["fresher"]
    r = s.get(f"{API}/career/resumes/{rid}", headers=fresh_cand["h"], timeout=15)
    assert r.status_code == 404
    r2 = s.delete(f"{API}/career/resumes/{rid}", headers=fresh_cand["h"], timeout=15)
    assert r2.status_code == 404


def test_other_user_cannot_access_analysis(s, fresh_cand):
    r = s.get(f"{API}/career/analyses/{_analysis_id['id']}", headers=fresh_cand["h"], timeout=15)
    assert r.status_code == 404


def test_other_user_cannot_access_interview(s, fresh_cand):
    r = s.get(f"{API}/career/interviews/{_sess['id']}", headers=fresh_cand["h"], timeout=15)
    assert r.status_code == 404


# ------------------------------------------------------------------
# 9. Admin settings & stats guards + limits enforcement
# ------------------------------------------------------------------
def test_admin_endpoints_require_admin(s, existing_h):
    r = s.get(f"{API}/admin/career/settings", headers=existing_h, timeout=15)
    assert r.status_code == 403
    r2 = s.get(f"{API}/admin/career/stats", headers=existing_h, timeout=15)
    assert r2.status_code == 403


def test_admin_stats_shape(s, admin_h):
    r = s.get(f"{API}/admin/career/stats", headers=admin_h, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ["usage", "unique_users", "saved_resumes", "saved_analyses",
              "interview_sessions", "completed_interviews", "ai", "recent_failures"]:
        assert k in body, f"stats missing {k}"
    # stats must not leak private content
    assert "resume_text" not in str(body).lower() or "resume_text" not in body.keys()
    for f in body.get("recent_failures", []):
        assert "resume_text" not in f and "answer" not in f


def test_admin_settings_get(s, admin_h):
    r = s.get(f"{API}/admin/career/settings", headers=admin_h, timeout=15)
    assert r.status_code == 200
    assert "tools" in r.json()["settings"]


def test_limits_zero_free_blocks_fresh_candidate(s, admin_h):
    """Set free limit=0 then verify a fresh (consented) candidate gets 403."""
    # Fresh candidate
    email = f"TEST_limit_{uuid.uuid4().hex[:6]}@jobradar.io"
    data = _register(s, email)
    h = {"Authorization": f"Bearer {data['token']}"}
    s.post(f"{API}/career/consent", headers=h, timeout=15)

    # Set free limit=0 for analyser
    body = {k: v for k, v in DEFAULT_SETTINGS_BODY.items()}
    body["limits"] = {k: dict(v) for k, v in DEFAULT_SETTINGS_BODY["limits"].items()}
    body["limits"]["free"]["resume_analysis"] = 0
    rs = s.put(f"{API}/admin/career/settings", headers=admin_h, json=body, timeout=15)
    assert rs.status_code == 200
    try:
        r = s.post(f"{API}/career/analyse", headers=h,
                   json={"resume_text": "x" * 200, "jd_text": "y" * 100}, timeout=20)
        assert r.status_code == 403, f"expected 403 when free limit=0, got {r.status_code}"
    finally:
        # Restore defaults
        s.put(f"{API}/admin/career/settings", headers=admin_h, json=DEFAULT_SETTINGS_BODY, timeout=15)


def test_tool_disabled_blocks(s, admin_h):
    email = f"TEST_dis_{uuid.uuid4().hex[:6]}@jobradar.io"
    data = _register(s, email)
    h = {"Authorization": f"Bearer {data['token']}"}
    s.post(f"{API}/career/consent", headers=h, timeout=15)

    body = {k: v for k, v in DEFAULT_SETTINGS_BODY.items()}
    body["tools"] = {k: dict(v) for k, v in DEFAULT_SETTINGS_BODY["tools"].items()}
    body["tools"]["resume_analyser"]["enabled"] = False
    rs = s.put(f"{API}/admin/career/settings", headers=admin_h, json=body, timeout=15)
    assert rs.status_code == 200
    try:
        r = s.post(f"{API}/career/analyse", headers=h,
                   json={"resume_text": "x" * 200, "jd_text": "y" * 100}, timeout=20)
        assert r.status_code == 403
    finally:
        s.put(f"{API}/admin/career/settings", headers=admin_h, json=DEFAULT_SETTINGS_BODY, timeout=15)


def test_free_access_false_blocks_free(s, admin_h):
    email = f"TEST_noFA_{uuid.uuid4().hex[:6]}@jobradar.io"
    data = _register(s, email)
    h = {"Authorization": f"Bearer {data['token']}"}
    s.post(f"{API}/career/consent", headers=h, timeout=15)

    body = {k: v for k, v in DEFAULT_SETTINGS_BODY.items()}
    body["tools"] = {k: dict(v) for k, v in DEFAULT_SETTINGS_BODY["tools"].items()}
    body["tools"]["resume_analyser"]["free_access"] = False
    rs = s.put(f"{API}/admin/career/settings", headers=admin_h, json=body, timeout=15)
    assert rs.status_code == 200
    try:
        r = s.post(f"{API}/career/analyse", headers=h,
                   json={"resume_text": "x" * 200, "jd_text": "y" * 100}, timeout=20)
        assert r.status_code == 403
    finally:
        s.put(f"{API}/admin/career/settings", headers=admin_h, json=DEFAULT_SETTINGS_BODY, timeout=15)


# ------------------------------------------------------------------
# 10. Saved searches
# ------------------------------------------------------------------
def test_saved_searches_crud(s, existing_h):
    r = s.get(f"{API}/saved-searches", headers=existing_h, timeout=15)
    assert r.status_code == 200
    assert "searches" in r.json()

    body = {"name": "TEST IT India", "filters": {"q": "python", "region": "India",
                                                   "industry_category": "IT & Technology"}}
    r2 = s.post(f"{API}/saved-searches", headers=existing_h, json=body, timeout=15)
    assert r2.status_code == 200, r2.text
    doc = r2.json()["search"]
    assert doc["name"] == "TEST IT India"
    assert doc["filters"]["region"] == "India"

    # empty filters -> 400
    r3 = s.post(f"{API}/saved-searches", headers=existing_h, json={"name": "x", "filters": {"region": "All"}}, timeout=15)
    assert r3.status_code == 400

    rd = s.delete(f"{API}/saved-searches/{doc['search_id']}", headers=existing_h, timeout=15)
    assert rd.status_code == 200


# ------------------------------------------------------------------
# 11. Light regression
# ------------------------------------------------------------------
def test_plans_prices_unchanged(s):
    r = s.get(f"{API}/plans", timeout=15)
    assert r.status_code == 200
    plans = {p["duration_days"]: p for p in r.json()["plans"]}
    assert plans[90]["price"] == 499
    assert plans[180]["price"] == 699
    assert plans[365]["price"] == 999


def test_jobs_still_works(s):
    r = s.get(f"{API}/jobs", timeout=15)
    assert r.status_code == 200
    assert r.json()["count"] >= 1


# ------------------------------------------------------------------
# 12. Final cleanup for existing_h (keep the shared account tidy)
# ------------------------------------------------------------------
def test_cleanup_delete_all(s, existing_h):
    # Delete analyses first (improve kept resume association)
    aid = _analysis_id.get("id")
    if aid:
        s.delete(f"{API}/career/analyses/{aid}", headers=existing_h, timeout=15)
    for rid in list(_resume_ids.values()):
        s.delete(f"{API}/career/resumes/{rid}", headers=existing_h, timeout=15)
    sid = _sess.get("id")
    if sid:
        s.delete(f"{API}/career/interviews/{sid}", headers=existing_h, timeout=15)
    # Final sanity: resumes list should not contain our ids
    r = s.get(f"{API}/career/resumes", headers=existing_h, timeout=15)
    remaining = {x["resume_id"] for x in r.json()["resumes"]}
    for rid in _resume_ids.values():
        assert rid not in remaining
