"""JobRadar — Iteration 4: ATS Resume Builder v2 (fresher templates, experienced extract,
template rendering, missing_fields, hints-never-exported).

Budget: ~1 AI extract + ~1 AI tailor + light manual CRUD. Light regression on plans & analyser.
"""
import io
import os
import uuid
import pytest
import requests
from pathlib import Path

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith(("EXPO_PUBLIC_BACKEND_URL=", "EXPO_BACKEND_URL=")):
            BASE_URL = line.split("=", 1)[1].strip().strip('"')
            break
BASE = BASE_URL.rstrip("/")
API = f"{BASE}/api"

ADMIN_EMAIL, ADMIN_PASS = "admin@eevolvex.com", "Admin@12345"
TEST_EMAIL, TEST_PASS = "test@jobradar.com", "Test@12345"
AI_TIMEOUT = 120

DEFAULT_SETTINGS = {
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

MESSY_RESUME = """
John Doe
johndoe at example dot com
Bengaluru

SUMMARY
Finance graduate with 2 years working in accounts payable and reconciliation at Infosys BPM.
Strong Excel, SAP FI and reconciliation experience.

EXPERIENCE
Infosys BPM - Accounts Executive
Mar 2022 - Present
- Processed 300+ vendor invoices per month
- Monthly bank reconciliation across 4 accounts
- Reduced reporting cycle by 2 days

Deloitte India - Audit Intern - Jun 2021 to Aug 2021
Assisted senior auditors with vouching and sampling.

EDUCATION
B.Com (Hons), Christ University, 2021

SKILLS
MS Excel (VLOOKUP, Pivot), SAP FI, Tally, GST, Reconciliation, Accounts Payable
"""

GROCERY_TEXT = (
    "SHOPPING LIST FOR THIS WEEK " + ("Milk, bread, eggs, butter, tomatoes, onions, potatoes, apples, "
    "bananas, chicken, rice, wheat flour, sugar, salt, pepper, oil, cheese, yogurt, pasta, cereal. ") * 4
)


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_h(s):
    r = s.post(f"{API}/auth/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="session")
def user_h(s):
    r = s.post(f"{API}/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASS}, timeout=30)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


_created = {"ids": []}


def _track(rid):
    _created["ids"].append(rid)
    return rid


# ------------------------------------------------------------------
# A. Extract — valid resume -> ok with missing_fields; <150 -> 400; grocery -> 422 no usage
# ------------------------------------------------------------------
def test_extract_short_text_returns_400(s, user_h):
    r = s.post(f"{API}/career/resumes/extract", headers=user_h,
               json={"resume_text": "too short"}, timeout=20)
    assert r.status_code == 400, r.text


def test_extract_grocery_returns_422_and_no_usage(s, user_h):
    before = s.get(f"{API}/career/usage", headers=user_h, timeout=15).json()["usage"]["resume_generation"]["used"]
    r = s.post(f"{API}/career/resumes/extract", headers=user_h,
               json={"resume_text": GROCERY_TEXT}, timeout=AI_TIMEOUT)
    assert r.status_code == 422, f"expected 422 non-resume, got {r.status_code}: {r.text[:200]}"
    after = s.get(f"{API}/career/usage", headers=user_h, timeout=15).json()["usage"]["resume_generation"]["used"]
    assert before == after, "422 must NOT consume usage"


def test_extract_valid_resume_builds_sections_and_missing_fields(s, user_h):
    before = s.get(f"{API}/career/usage", headers=user_h, timeout=15).json()["usage"]["resume_generation"]["used"]
    r = s.post(f"{API}/career/resumes/extract", headers=user_h,
               json={"resume_text": MESSY_RESUME, "title": "TEST Extracted"}, timeout=AI_TIMEOUT)
    assert r.status_code == 200, r.text
    res = r.json()["resume"]
    _track(res["resume_id"])
    assert res["source"] == "ai_extract"
    assert res["resume_type"] == "experienced"
    assert res["template"] == "classic"
    titles = " ".join((sec["title"] or "").upper() for sec in res["sections"])
    assert "WORK EXPERIENCE" in titles or "EXPERIENCE" in titles
    # Missing fields should be a list; phone number was absent in input
    assert isinstance(res["missing_fields"], list)
    missing_joined = " ".join(res["missing_fields"]).lower()
    assert "phone" in missing_joined, f"should flag missing phone — got {res['missing_fields']}"
    # Usage incremented by 1
    after = s.get(f"{API}/career/usage", headers=user_h, timeout=15).json()["usage"]["resume_generation"]["used"]
    assert after == before + 1, f"usage must consume exactly 1 ({before} -> {after})"


# ------------------------------------------------------------------
# B. Manual create with hints — save, update, download never contains hint text
# ------------------------------------------------------------------
HINT_SNIPPET = "SAMPLE_HINT_TOKEN_SHOULD_NEVER_LEAK"


def test_manual_create_with_hints_preserved(s, user_h):
    body = {
        "title": "TEST Hints Manual",
        "resume_type": "fresher",
        "template": "modern",
        "personal": {"full_name": "Test Fresher", "email": "tf@example.com",
                     "phone": "9999900003", "location": "Bengaluru",
                     "preferred_location": "Bengaluru", "linkedin": ""},
        "sections": [
            {"id": None, "title": "SUMMARY", "content": "Short summary line about myself.",
             "hint": f"{HINT_SNIPPET} Describe your objective in 2 lines"},
            {"id": None, "title": "SKILLS", "content": "",  # empty content -> excluded on export
             "hint": f"{HINT_SNIPPET} Add 6-8 skills as bullet list"},
            {"id": None, "title": "EDUCATION", "content": "- B.Tech CSE, VIT Vellore, 2024, CGPA 8.5",
             "hint": f"{HINT_SNIPPET} Add degree, college, year, CGPA"},
        ],
        "target_job": "",
        "missing_fields": ["Projects"],
    }
    r = s.post(f"{API}/career/resumes", headers=user_h, json=body, timeout=20)
    assert r.status_code == 200, r.text
    res = r.json()["resume"]
    _track(res["resume_id"])
    assert res["template"] == "modern"
    assert res["missing_fields"] == ["Projects"]
    hints = [sec.get("hint") or "" for sec in res["sections"]]
    assert any(HINT_SNIPPET in h for h in hints), "hint should be persisted on the sections"


def test_update_resume_template_and_missing_fields(s, user_h):
    rid = _created["ids"][-1]
    body = {
        "title": "TEST Hints Manual",
        "resume_type": "fresher",
        "template": "compact",
        "personal": {"full_name": "Test Fresher", "email": "tf@example.com",
                     "phone": "9999900003", "location": "Bengaluru",
                     "preferred_location": "Bengaluru", "linkedin": ""},
        "sections": [
            {"id": None, "title": "SUMMARY", "content": "Updated summary.",
             "hint": f"{HINT_SNIPPET} keep this hint"},
            {"id": None, "title": "EDUCATION",
             "content": "- B.Tech CSE, VIT Vellore, 2024, CGPA 8.5", "hint": ""},
        ],
        "target_job": "",
        "missing_fields": ["Projects", "Certifications"],
    }
    r = s.put(f"{API}/career/resumes/{rid}", headers=user_h, json=body, timeout=20)
    assert r.status_code == 200, r.text
    updated = r.json()["resume"]
    assert updated["template"] == "compact"
    assert set(updated["missing_fields"]) == {"Projects", "Certifications"}


# ------------------------------------------------------------------
# C. Download — PDF/DOCX exclude empty sections and never contain hint text
# ------------------------------------------------------------------
def _dl(s, user_h, rid, fmt):
    r = s.post(f"{API}/career/resumes/{rid}/download-link", headers=user_h,
               json={"format": fmt}, timeout=15)
    assert r.status_code == 200, r.text
    r2 = s.get(f"{BASE}{r.json()['path']}", timeout=60)
    assert r2.status_code == 200
    return r2.content


def _pdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except Exception:
        from PyPDF2 import PdfReader  # type: ignore
    reader = PdfReader(io.BytesIO(data))
    return "\n".join(p.extract_text() or "" for p in reader.pages)


def _docx_text(data: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs)


def test_download_pdf_excludes_hints_and_empty_sections(s, user_h):
    # Set up resume with one empty section + a hint containing a unique token
    body = {
        "title": "TEST Download Hints",
        "resume_type": "fresher",
        "template": "classic",
        "personal": {"full_name": "Downloader Test", "email": "d@example.com",
                     "phone": "9999900004", "location": "Pune",
                     "preferred_location": "Pune", "linkedin": ""},
        "sections": [
            {"id": None, "title": "SUMMARY", "content": "A concrete summary line present in output.",
             "hint": f"{HINT_SNIPPET} LEAK_PDF_DO_NOT_INCLUDE"},
            {"id": None, "title": "SKILLS", "content": "",
             "hint": f"{HINT_SNIPPET} LEAK_PDF_EMPTY_SECTION"},
            {"id": None, "title": "EDUCATION", "content": "- B.Com, Delhi University, 2023",
             "hint": ""},
        ],
        "target_job": "",
        "missing_fields": [],
    }
    r = s.post(f"{API}/career/resumes", headers=user_h, json=body, timeout=15)
    assert r.status_code == 200
    rid = _track(r.json()["resume"]["resume_id"])

    pdf = _dl(s, user_h, rid, "pdf")
    assert pdf.startswith(b"%PDF")
    pdf_text = _pdf_text(pdf)
    assert "A concrete summary line" in pdf_text
    assert "B.Com, Delhi University" in pdf_text
    # Empty section must not appear (no SKILLS heading)
    assert "SKILLS" not in pdf_text.upper().split("EDUCATION")[0].replace("SUMMARY", ""), \
        "empty SKILLS section leaked into PDF"
    assert HINT_SNIPPET not in pdf_text
    assert "LEAK_PDF" not in pdf_text

    docx = _dl(s, user_h, rid, "docx")
    assert docx.startswith(b"PK")
    dtxt = _docx_text(docx)
    assert "A concrete summary line" in dtxt
    assert "B.Com, Delhi University" in dtxt
    assert "SKILLS" not in dtxt.upper().split("EDUCATION")[0].replace("SUMMARY", ""), \
        "empty SKILLS section leaked into DOCX"
    assert HINT_SNIPPET not in dtxt
    assert "LEAK_PDF" not in dtxt


@pytest.mark.parametrize("template", ["classic", "modern", "compact"])
def test_each_template_renders_valid_pdf_and_docx(s, user_h, template):
    body = {
        "title": f"TEST Tpl {template}",
        "resume_type": "experienced",
        "template": template,
        "personal": {"full_name": f"Tpl {template}", "email": "t@example.com",
                     "phone": "9999900005", "location": "Chennai", "preferred_location": "", "linkedin": ""},
        "sections": [
            {"id": None, "title": "SUMMARY", "content": "Backend engineer with 3+ years.", "hint": ""},
            {"id": None, "title": "SKILLS", "content": "- Python\n- FastAPI\n- SQL", "hint": ""},
        ],
        "target_job": "",
        "missing_fields": [],
    }
    r = s.post(f"{API}/career/resumes", headers=user_h, json=body, timeout=15)
    rid = _track(r.json()["resume"]["resume_id"])
    pdf = _dl(s, user_h, rid, "pdf")
    assert pdf.startswith(b"%PDF") and len(pdf) > 800
    docx = _dl(s, user_h, rid, "docx")
    assert docx.startswith(b"PK") and len(docx) > 800


# ------------------------------------------------------------------
# D. resume_builder access check on manual create
# ------------------------------------------------------------------
def _register_fresh(s):
    email = f"TEST_rb_{uuid.uuid4().hex[:6]}@jobradar.io"
    payload = {
        "full_name": "TEST RB", "email": email, "mobile": "9999900099",
        "password": "Test@12345", "confirm_password": "Test@12345",
        "consent": True, "preferred_function": "IT & Technology",
        "preferred_location": "Bengaluru", "preferred_work_mode": "Hybrid",
        "industry": "IT & Technology", "current_designation": "Software Engineer",
        "current_salary": "12 LPA", "preferred_industries": ["IT & Technology"],
        "preferred_designation": "Senior Software Engineer",
    }
    r = s.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_manual_create_blocked_when_tool_disabled(s, admin_h):
    h = _register_fresh(s)
    s.post(f"{API}/career/consent", headers=h, timeout=15)
    body = {k: v for k, v in DEFAULT_SETTINGS.items()}
    body["tools"] = {k: dict(v) for k, v in DEFAULT_SETTINGS["tools"].items()}
    body["tools"]["resume_builder"]["enabled"] = False
    rs = s.put(f"{API}/admin/career/settings", headers=admin_h, json=body, timeout=15)
    assert rs.status_code == 200
    try:
        r = s.post(f"{API}/career/resumes", headers=h, json={
            "title": "x", "resume_type": "fresher",
            "personal": {"full_name": "X", "email": "", "phone": "", "location": "", "linkedin": ""},
            "sections": [{"id": None, "title": "SKILLS", "content": "- Python"}],
            "target_job": "",
        }, timeout=15)
        assert r.status_code == 403, f"expected 403 when resume_builder disabled, got {r.status_code}: {r.text}"
    finally:
        s.put(f"{API}/admin/career/settings", headers=admin_h, json=DEFAULT_SETTINGS, timeout=15)


def test_manual_create_blocked_when_free_access_false(s, admin_h):
    h = _register_fresh(s)
    s.post(f"{API}/career/consent", headers=h, timeout=15)
    body = {k: v for k, v in DEFAULT_SETTINGS.items()}
    body["tools"] = {k: dict(v) for k, v in DEFAULT_SETTINGS["tools"].items()}
    body["tools"]["resume_builder"]["free_access"] = False
    rs = s.put(f"{API}/admin/career/settings", headers=admin_h, json=body, timeout=15)
    assert rs.status_code == 200
    try:
        r = s.post(f"{API}/career/resumes", headers=h, json={
            "title": "x", "resume_type": "fresher",
            "personal": {"full_name": "X", "email": "", "phone": "", "location": "", "linkedin": ""},
            "sections": [{"id": None, "title": "SKILLS", "content": "- Python"}],
            "target_job": "",
        }, timeout=15)
        assert r.status_code == 403, f"expected 403 for free user when free_access=false, got {r.status_code}: {r.text}"
    finally:
        s.put(f"{API}/admin/career/settings", headers=admin_h, json=DEFAULT_SETTINGS, timeout=15)


def test_admin_settings_restored_to_defaults(s, admin_h):
    r = s.get(f"{API}/admin/career/settings", headers=admin_h, timeout=15)
    assert r.status_code == 200
    settings = r.json()["settings"]
    # Verify defaults
    for tool, val in DEFAULT_SETTINGS["tools"].items():
        assert settings["tools"][tool]["enabled"] is True, f"tool {tool} not enabled after restore"
        assert settings["tools"][tool]["free_access"] is True, f"tool {tool} free_access not true after restore"
    assert settings["limits"]["free"]["resume_generation"] == 2
    assert settings["limits"]["quarterly"]["resume_generation"] == 10
    assert settings["limits"]["half_yearly"]["resume_generation"] == 15
    assert settings["limits"]["annual"]["resume_generation"] == 25
    assert settings["period_days"] == 30


# ------------------------------------------------------------------
# E. Tailor keeps template; duplicate keeps template
# ------------------------------------------------------------------
def test_tailor_returns_notes_and_preserves_template(s, user_h):
    # Create a modern-template resume to tailor
    body = {
        "title": "TEST Tailor Src",
        "resume_type": "experienced",
        "template": "modern",
        "personal": {"full_name": "Tailor Src", "email": "ts@example.com",
                     "phone": "9999900006", "location": "Hyderabad", "preferred_location": "", "linkedin": ""},
        "sections": [
            {"id": None, "title": "SUMMARY", "content": "3+ years Python backend engineer with FastAPI, PostgreSQL."},
            {"id": None, "title": "WORK EXPERIENCE",
             "content": "Acme Pvt Ltd — Backend Engineer | Jan 2021 – Present\n- Built FastAPI microservices\n- Optimised PostgreSQL queries"},
            {"id": None, "title": "SKILLS", "content": "- Python\n- FastAPI\n- PostgreSQL\n- Docker"},
        ],
        "target_job": "",
        "missing_fields": [],
    }
    r = s.post(f"{API}/career/resumes", headers=user_h, json=body, timeout=15)
    rid = _track(r.json()["resume"]["resume_id"])
    jd = ("We are hiring a Senior Backend Engineer in Hyderabad. Must have 3+ years with Python, FastAPI, "
          "PostgreSQL and Docker. Experience with Kubernetes and AWS is a plus. You'll own services end-to-end "
          "and mentor junior engineers.")
    r2 = s.post(f"{API}/career/resumes/{rid}/tailor", headers=user_h, json={"jd_text": jd}, timeout=AI_TIMEOUT)
    assert r2.status_code == 200, r2.text
    out = r2.json()["resume"]
    _track(out["resume_id"])
    assert "tailored" in out["title"].lower()
    assert out["source"] == "ai_tailor"
    assert out["template"] == "modern", f"tailor should preserve template, got {out['template']}"
    assert isinstance(out.get("notes"), list) and len(out["notes"]) >= 1, "tailor must return notes[]"


def test_duplicate_preserves_template(s, user_h):
    rid = _created["ids"][-1]  # the tailored one (modern)
    r = s.post(f"{API}/career/resumes/{rid}/duplicate", headers=user_h, timeout=20)
    assert r.status_code == 200
    dup = r.json()["resume"]
    _track(dup["resume_id"])
    assert "(Copy)" in dup["title"]
    assert dup["template"] == "modern", f"duplicate should preserve template, got {dup['template']}"


# ------------------------------------------------------------------
# F. Light regression — plans at 599/799/999; analyser quick validation
# ------------------------------------------------------------------
def test_plans_prices_599_799_999(s):
    r = s.get(f"{API}/plans", timeout=15)
    assert r.status_code == 200
    plans = {p["duration_days"]: p for p in r.json()["plans"]}
    assert plans[90]["price"] == 599, f"quarterly must be 599, got {plans[90]['price']}"
    assert plans[180]["price"] == 799, f"half-yearly must be 799, got {plans[180]['price']}"
    assert plans[365]["price"] == 999, f"annual must be 999, got {plans[365]['price']}"


def test_analyser_validation_still_works(s, user_h):
    # Only validation path — no actual AI call
    r = s.post(f"{API}/career/analyse", headers=user_h,
               json={"resume_text": "short", "jd_text": "y" * 100}, timeout=15)
    assert r.status_code == 400


def test_interview_validation_still_works(s, user_h):
    r = s.post(f"{API}/career/interviews", headers=user_h, json={
        "job_title": "", "jd_text": "x" * 100, "experience_level": "Fresher",
        "interview_type": "HR Interview", "difficulty": "Beginner", "num_questions": 5,
    }, timeout=15)
    assert r.status_code == 400


# ------------------------------------------------------------------
# G. Cleanup
# ------------------------------------------------------------------
def test_cleanup(s, user_h):
    for rid in _created["ids"]:
        s.delete(f"{API}/career/resumes/{rid}", headers=user_h, timeout=15)
