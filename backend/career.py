"""Career Tools: ATS Resume Builder, Resume Analyser, AI Interview Coach, Saved Searches.

All access rules and usage limits are enforced here on the backend.
"""
import io
import os
import re
import json
import time
import uuid
import hashlib
import logging
from datetime import timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("jobradar.career")

AI_MODEL = ("anthropic", "claude-sonnet-4-6")
# Estimated pricing in USD per 1M tokens (input, output) — used only for admin cost estimates.
AI_PRICE = (3.0, 15.0)

KINDS = ["resume_generation", "resume_analysis", "interview_sessions"]
TOOL_KIND = {"resume_builder": "resume_generation", "resume_analyser": "resume_analysis",
             "interview_coach": "interview_sessions"}
TIERS = ["free", "quarterly", "half_yearly", "annual"]

DEFAULT_SETTINGS = {
    "settings_id": "career",
    "tools": {
        "resume_builder": {"enabled": True, "free_access": True},
        "resume_analyser": {"enabled": True, "free_access": True},
        "interview_coach": {"enabled": True, "free_access": True},
    },
    "limits": {
        "free": {"resume_generation": 2, "resume_analysis": 2, "interview_sessions": 1},
        "quarterly": {"resume_generation": 15, "resume_analysis": 15, "interview_sessions": 15},
        "half_yearly": {"resume_generation": 25, "resume_analysis": 25, "interview_sessions": 25},
        "annual": {"resume_generation": 40, "resume_analysis": 40, "interview_sessions": 40},
    },
    "period_days": 30,
    "addons": [
        {"key": "extra_interviews", "name": "Extra 10 interview sessions", "price": 199, "enabled": False},
        {"key": "extra_analyses", "name": "Extra 10 resume analyses", "price": 149, "enabled": False},
    ],
}

AI_DISCLAIMER = ("AI-generated scores and suggestions are estimates for practice and guidance only. They are not an "
                 "official employer assessment and do not guarantee that a resume will pass any ATS or that you "
                 "will be shortlisted, interviewed or hired.")

NO_INVENT = ("STRICT RULE: Never invent, assume or exaggerate experience, employers, dates, qualifications, "
             "certifications, skills, metrics or achievements. Use only facts the candidate provided. You may "
             "rephrase for clarity and professionalism. If something important is missing, leave it out.")

# Visual templates — all single-column, standard headings, selectable text (ATS-friendly).
TEMPLATES = {
    "classic": {"docx_font": "Calibri", "pdf_font": ("Helvetica-Bold", "Helvetica"), "name": 18, "head": 11.5,
                "body": 11, "color": "", "rule": False},
    "modern": {"docx_font": "Arial", "pdf_font": ("Helvetica-Bold", "Helvetica"), "name": 20, "head": 11.5,
               "body": 10.5, "color": "#1F3A5F", "rule": True},
    "compact": {"docx_font": "Georgia", "pdf_font": ("Times-Bold", "Times-Roman"), "name": 16, "head": 11,
                "body": 10.5, "color": "", "rule": True},
}

_inflight: set = set()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class Personal(BaseModel):
    full_name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    preferred_location: str = ""
    linkedin: str = ""


class Section(BaseModel):
    id: Optional[str] = None
    title: str = Field("", max_length=80)
    content: str = Field("", max_length=8000)
    hint: Optional[str] = Field("", max_length=600)


class ResumeGenerateReq(BaseModel):
    resume_type: str
    title: Optional[str] = None
    personal: Personal
    answers: Dict[str, str]


class ResumeSaveReq(BaseModel):
    title: str = Field(..., max_length=100)
    resume_type: str = "experienced"
    personal: Personal
    sections: List[Section]
    target_job: Optional[str] = ""
    template: Optional[str] = "classic"
    missing_fields: Optional[List[str]] = None


class ExtractReq(BaseModel):
    resume_text: str
    title: Optional[str] = None


class TailorReq(BaseModel):
    jd_text: str


class DownloadReq(BaseModel):
    format: str


class AnalyseReq(BaseModel):
    resume_text: str
    jd_text: str


class InterviewReq(BaseModel):
    job_title: str
    company: Optional[str] = ""
    jd_text: str
    industry: Optional[str] = ""
    experience_level: str
    interview_type: str
    difficulty: str
    num_questions: int
    feedback_mode: str = "each"
    job_id: Optional[str] = None


class AnswerReq(BaseModel):
    index: int
    answer: str


class IndexReq(BaseModel):
    index: int


class SavedSearchReq(BaseModel):
    name: str = Field(..., max_length=60)
    filters: Dict[str, str]


class SettingsReq(BaseModel):
    tools: Dict[str, Dict[str, bool]]
    limits: Dict[str, Dict[str, int]]
    period_days: int = 30
    addons: List[Dict] = []


EXP_LEVELS = ["Fresher", "0-2 years", "3-5 years", "6-10 years", "10+ years"]
INTERVIEW_TYPES = ["HR Interview", "Technical Interview", "Functional/Role-Specific Interview",
                   "Managerial Interview", "Behavioural Interview", "Complete Mock Interview"]
DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"]


def _clean(s: Optional[str], max_len: int) -> str:
    return (s or "").strip()[:max_len]


def build_router(db, get_current_user, require_admin, compute_membership, now_utc, now_iso, parse_dt):
    r = APIRouter()

    # ------------------------------------------------------------------ helpers
    async def get_settings() -> dict:
        s = await db.career_settings.find_one({"settings_id": "career"}, {"_id": 0})
        if not s:
            await db.career_settings.insert_one(dict(DEFAULT_SETTINGS))
            s = {k: v for k, v in DEFAULT_SETTINGS.items()}
        return s

    async def get_tier(user) -> str:
        m = await compute_membership(user["user_id"])
        if not m["is_active"]:
            return "free"
        plan = await db.plans.find_one({"plan_id": m.get("plan_id")}, {"_id": 0, "duration_days": 1})
        days = (plan or {}).get("duration_days", 90)
        return "annual" if days >= 365 else "half_yearly" if days >= 180 else "quarterly"

    async def usage_snapshot(user) -> dict:
        s = await get_settings()
        tier = await get_tier(user)
        # Paid members: limits apply to the whole plan they purchased (counted from that purchase).
        # Free users: limits reset every `period_days`.
        period_label = f"resets every {s.get('period_days', 30)} days"
        since = (now_utc() - timedelta(days=int(s.get("period_days", 30)))).isoformat()
        if tier != "free":
            m = await compute_membership(user["user_id"])
            sub = await db.subscriptions.find_one({"subscription_id": m.get("subscription_id")},
                                                  {"_id": 0, "created_at": 1})
            since = (sub or {}).get("created_at") or since
            period_label = f"for your {m.get('plan_name') or 'plan'} (valid till {(m.get('expiry_date') or '')[:10]})"
        usage = {}
        for k in KINDS:
            used = await db.career_usage.count_documents(
                {"user_id": user["user_id"], "kind": k, "created_at": {"$gte": since}})
            limit = int(s["limits"].get(tier, {}).get(k, 0))
            usage[k] = {"used": used, "limit": limit, "remaining": max(0, limit - used)}
        tools = {}
        for t, cfg in s["tools"].items():
            reason = None
            if not cfg.get("enabled", True):
                reason = "This tool is temporarily unavailable."
            elif tier == "free" and not cfg.get("free_access", False):
                reason = "This tool requires an active JobRadar membership."
            elif usage[TOOL_KIND[t]]["remaining"] <= 0:
                reason = ("You have used all your sessions for this period." if tier == "free" else
                          "You have used all sessions included in your plan. Renew or upgrade to continue.")
            tools[t] = {"enabled": cfg.get("enabled", True), "free_access": cfg.get("free_access", False),
                        "accessible": reason is None, "reason": reason}
        u = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "ai_consent": 1})
        return {"tier": tier, "usage": usage, "tools": tools, "period_days": s.get("period_days", 30),
                "period_label": period_label,
                "ai_configured": bool(os.environ.get("EMERGENT_LLM_KEY")),
                "ai_consent": bool((u or {}).get("ai_consent")),
                "addons": [a for a in s.get("addons", []) if a.get("enabled")],
                "disclaimer": AI_DISCLAIMER}

    async def require_tool(user, tool: str, ai: bool = True):
        if user.get("role") != "candidate":
            raise HTTPException(403, "Career Tools are available to candidate accounts only")
        snap = await usage_snapshot(user)
        if not ai:
            cfg = snap["tools"][tool]
            if not cfg["enabled"]:
                raise HTTPException(403, "This tool is temporarily unavailable.")
            if snap["tier"] == "free" and not cfg["free_access"]:
                raise HTTPException(403, "This tool requires an active JobRadar membership.")
            return snap
        if not snap["ai_configured"]:
            raise HTTPException(503, "AI provider is not configured on the server. Please contact support.")
        if not snap["ai_consent"]:
            raise HTTPException(428, "Please accept the AI processing consent to use Career Tools")
        t = snap["tools"][tool]
        if not t["accessible"]:
            raise HTTPException(403, t["reason"])
        return snap

    async def record_usage(user, kind: str, ref_id: str):
        await db.career_usage.insert_one({"usage_id": f"use_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"],
                                          "kind": kind, "ref_id": ref_id, "created_at": now_iso()})

    class Lock:
        def __init__(self, user, purpose):
            self.key = (user["user_id"], purpose)

        def __enter__(self):
            if self.key in _inflight:
                raise HTTPException(409, "A request is already in progress. Please wait.")
            _inflight.add(self.key)

        def __exit__(self, *a):
            _inflight.discard(self.key)

    async def ai_json(user, purpose: str, system: str, prompt: str, max_tokens: int = 4000) -> dict:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not key:
            raise HTTPException(503, "AI provider is not configured on the server.")
        started = time.time()
        log = {"call_id": f"ai_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"], "purpose": purpose,
               "model": AI_MODEL[1], "created_at": now_iso(), "success": False, "error": None,
               "input_tokens": 0, "output_tokens": 0, "est_cost_usd": 0.0}
        text, usage = "", None
        try:
            chat = LlmChat(api_key=key, session_id=f"career_{uuid.uuid4().hex}",
                           system_message=system + "\nRespond with ONLY a valid JSON object. No markdown fences."
                           ).with_model(*AI_MODEL).with_params(max_tokens=max_tokens)
            async for ev in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    text += ev.content or ""
                elif isinstance(ev, StreamDone):
                    usage = ev.usage
                    if ev.content:
                        text = ev.content
                    break
            m = re.search(r"\{.*\}", text, re.S)
            if not m:
                raise ValueError("AI returned an unexpected format")
            data = json.loads(m.group(0))
            log["success"] = True
            return data
        except HTTPException:
            raise
        except Exception as e:
            log["error"] = f"{type(e).__name__}: {str(e)[:200]}"
            logger.warning(f"AI call failed ({purpose}): {log['error']}")
            raise HTTPException(502, "The AI service could not complete this request. Please try again shortly.")
        finally:
            it = getattr(usage, "input_tokens", 0) or len(system + prompt) // 4
            ot = getattr(usage, "output_tokens", 0) or len(text) // 4
            log.update({"input_tokens": it, "output_tokens": ot, "latency_ms": int((time.time() - started) * 1000),
                        "est_cost_usd": round(it / 1e6 * AI_PRICE[0] + ot / 1e6 * AI_PRICE[1], 5)})
            await db.ai_calls.insert_one(dict(log))

    def norm_sections(raw) -> list:
        out = []
        for s in raw or []:
            title = _clean(s.get("title") if isinstance(s, dict) else s.title, 80)
            content = (s.get("content") if isinstance(s, dict) else s.content) or ""
            if isinstance(content, list):
                content = "\n".join(f"- {c}" for c in content)
            hint = (s.get("hint") if isinstance(s, dict) else s.hint) or ""
            if title or str(content).strip():
                out.append({"id": (s.get("id") if isinstance(s, dict) else s.id) or uuid.uuid4().hex[:8],
                            "title": title, "content": str(content).strip()[:8000], "hint": _clean(hint, 600)})
        return out

    async def own(coll, id_field, item_id, user):
        doc = await db[coll].find_one({id_field: item_id, "user_id": user["user_id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Not found")
        return doc

    async def save_resume(user, title, rtype, personal, sections, target_job="", source=None,
                          template="classic", missing_fields=None, notes=None) -> dict:
        doc = {"template": template if template in TEMPLATES else "classic",
               "missing_fields": missing_fields or [], "notes": notes or [],"resume_id": f"res_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"],
               "title": _clean(title, 100) or "My Resume", "resume_type": rtype,
               "personal": personal, "sections": norm_sections(sections), "target_job": _clean(target_job, 120),
               "source": source, "created_at": now_iso(), "updated_at": now_iso()}
        await db.resumes.insert_one(dict(doc))
        return doc

    RESUME_SCHEMA = ('{"sections":[{"title":"PROFESSIONAL SUMMARY","content":"..."}]} — content is plain text; '
                     'use lines starting with "- " for bullet points. Use standard ATS headings in this order where '
                     'data exists: PROFESSIONAL SUMMARY (or CAREER OBJECTIVE for freshers), SKILLS, EXPERIENCE '
                     '(Job Title | Company | Dates, then bullets), INTERNSHIPS & PROJECTS, EDUCATION, CERTIFICATIONS, '
                     'RELEVANT COURSEWORK, ACHIEVEMENTS & ACTIVITIES. Do not include contact details as a section.')

    # ------------------------------------------------------------------ usage / consent
    @r.get("/career/usage")
    async def career_usage(user=Depends(get_current_user)):
        return await usage_snapshot(user)

    @r.post("/career/consent")
    async def career_consent(user=Depends(get_current_user)):
        await db.users.update_one({"user_id": user["user_id"]},
                                  {"$set": {"ai_consent": True, "ai_consent_at": now_iso()}})
        return {"success": True}

    # ------------------------------------------------------------------ resumes
    @r.get("/career/resumes")
    async def list_resumes(user=Depends(get_current_user)):
        items = await db.resumes.find({"user_id": user["user_id"]}, {"_id": 0, "sections": 0}).sort(
            "updated_at", -1).to_list(200)
        return {"resumes": items}

    @r.get("/career/resumes/{resume_id}")
    async def get_resume(resume_id: str, user=Depends(get_current_user)):
        return {"resume": await own("resumes", "resume_id", resume_id, user)}

    @r.post("/career/resumes")
    async def create_resume(req: ResumeSaveReq, user=Depends(get_current_user)):
        await require_tool(user, "resume_builder", ai=False)
        doc = await save_resume(user, req.title, req.resume_type, req.personal.dict(), req.sections, req.target_job,
                                "manual", req.template, req.missing_fields)
        return {"resume": doc}

    @r.put("/career/resumes/{resume_id}")
    async def update_resume(resume_id: str, req: ResumeSaveReq, user=Depends(get_current_user)):
        await own("resumes", "resume_id", resume_id, user)
        await db.resumes.update_one({"resume_id": resume_id, "user_id": user["user_id"]}, {"$set": {
            "title": _clean(req.title, 100) or "My Resume", "resume_type": req.resume_type,
            "personal": req.personal.dict(), "sections": norm_sections(req.sections),
            "target_job": _clean(req.target_job, 120), "updated_at": now_iso(),
            "template": req.template if req.template in TEMPLATES else "classic",
            "missing_fields": [_clean(m, 80) for m in (req.missing_fields or [])][:20]}})
        return {"resume": await own("resumes", "resume_id", resume_id, user)}

    @r.delete("/career/resumes/{resume_id}")
    async def delete_resume(resume_id: str, user=Depends(get_current_user)):
        res = await db.resumes.delete_one({"resume_id": resume_id, "user_id": user["user_id"]})
        if not res.deleted_count:
            raise HTTPException(404, "Not found")
        return {"success": True}

    @r.post("/career/resumes/{resume_id}/duplicate")
    async def duplicate_resume(resume_id: str, user=Depends(get_current_user)):
        d = await own("resumes", "resume_id", resume_id, user)
        doc = await save_resume(user, f"{d['title']} (Copy)"[:100], d["resume_type"], d["personal"], d["sections"],
                                d.get("target_job", ""), "duplicate", d.get("template", "classic"),
                                d.get("missing_fields"))
        return {"resume": doc}

    @r.post("/career/resumes/generate")
    async def generate_resume(req: ResumeGenerateReq, user=Depends(get_current_user)):
        if req.resume_type not in ("fresher", "experienced"):
            raise HTTPException(400, "Choose Fresher or Experienced")
        if not req.personal.full_name.strip():
            raise HTTPException(400, "Full name is required")
        answers = {k[:40]: _clean(v, 4000) for k, v in req.answers.items() if v and v.strip()}
        if sum(len(v) for v in answers.values()) < 40:
            raise HTTPException(400, "Please fill in more details so we can build your resume")
        await require_tool(user, "resume_builder")
        with Lock(user, "resume_generation"):
            data = await ai_json(user, "resume_generation",
                                 "You are an expert ATS resume writer for Indian and international job markets. "
                                 + NO_INVENT,
                                 f"Create a clean, single-column ATS-friendly {req.resume_type} resume from these "
                                 f"candidate answers. Return JSON: {RESUME_SCHEMA}\n\nCANDIDATE ANSWERS:\n"
                                 + json.dumps(answers, ensure_ascii=False))
            doc = await save_resume(user, req.title or f"{req.resume_type.title()} Resume", req.resume_type,
                                    req.personal.dict(), data.get("sections"), "", "ai_builder")
            await record_usage(user, "resume_generation", doc["resume_id"])
        return {"resume": doc}

    @r.post("/career/resumes/extract")
    async def extract_resume(req: ExtractReq, user=Depends(get_current_user)):
        text = _clean(req.resume_text, 15000)
        if len(text) < 150:
            raise HTTPException(400, "Please paste your complete resume (at least 150 characters) so we can read it")
        await require_tool(user, "resume_builder")
        with Lock(user, "resume_generation"):
            data = await ai_json(user, "resume_extract",
                                 "You are an expert resume parser and ATS resume writer. " + NO_INVENT +
                                 " Text may be badly formatted (copied from PDF/Word); reconstruct it carefully.",
                                 'Extract and organise this pasted resume. Return JSON: {"is_resume":true|false,'
                                 '"personal":{"full_name":"","email":"","phone":"","location":"","linkedin":""},'
                                 '"missing_fields":["only important items that are missing or unclear, e.g. '
                                 '\'Phone number\', \'Employment dates for <Company>\', \'Education year\'"],'
                                 f'{RESUME_SCHEMA[1:]} Use "WORK EXPERIENCE" as the experience heading and keep '
                                 'every role (Job Title | Company | Start – End, then "- " bullets) in it. '
                                 'Use conventional dates like "Jan 2021 – Present". Leave a field empty rather '
                                 'than guessing.\n\nPASTED RESUME:\n' + text, 5000)
            if data.get("is_resume") is False or not data.get("sections"):
                raise HTTPException(422, "We couldn't recognise a resume in the pasted text. Please paste the full "
                                         "text of your resume (name, experience, education, skills) and try again.")
            pers = {k: _clean((data.get("personal") or {}).get(k), 120) for k in Personal.__fields__}
            missing = [_clean(m, 80) for m in (data.get("missing_fields") or []) if isinstance(m, str)][:15]
            for k, label in (("full_name", "Full name"), ("email", "Email"), ("phone", "Phone number")):
                if not pers.get(k) and label not in missing:
                    missing.insert(0, label)
            doc = await save_resume(user, req.title or "Experienced Resume", "experienced", pers,
                                    data.get("sections"), "", "ai_extract", "classic", missing)
            await record_usage(user, "resume_generation", doc["resume_id"])
        return {"resume": doc}

    @r.post("/career/resumes/{resume_id}/tailor")
    async def tailor_resume(resume_id: str, req: TailorReq, user=Depends(get_current_user)):
        jd = _clean(req.jd_text, 12000)
        if len(jd) < 80:
            raise HTTPException(400, "Please paste the complete job description (at least 80 characters)")
        d = await own("resumes", "resume_id", resume_id, user)
        await require_tool(user, "resume_builder")
        with Lock(user, "resume_generation"):
            data = await ai_json(user, "resume_tailor",
                                 "You are an expert ATS resume writer. " + NO_INVENT +
                                 " Tailor wording, ordering and emphasis to the job description, and use the JD's "
                                 "terminology ONLY where the candidate genuinely has that skill/experience.",
                                 'Return JSON: {"changes":["short description of each suggested change and why"],'
                                 f'{RESUME_SCHEMA[1:]}\n\nCURRENT RESUME SECTIONS:\n'
                                 f"{json.dumps(d['sections'], ensure_ascii=False)}\n\nJOB DESCRIPTION:\n{jd}")
            jd_title = jd.splitlines()[0][:60]
            notes = [_clean(c, 300) for c in (data.get("changes") or []) if isinstance(c, str)][:12]
            doc = await save_resume(user, f"{d['title']} — tailored"[:100], d["resume_type"], d["personal"],
                                    data.get("sections"), jd_title, "ai_tailor", d.get("template", "classic"),
                                    d.get("missing_fields"), notes)
            await record_usage(user, "resume_generation", doc["resume_id"])
        return {"resume": doc}

    # ------------------------------------------------------------------ export
    def contact_line(p: dict) -> list:
        pref = p.get("preferred_location")
        return [v for v in [p.get("email"), p.get("phone"), p.get("location"),
                            f"Preferred location: {pref}" if pref else "", p.get("linkedin")] if v]

    def export_sections(d: dict) -> list:
        # Only content the candidate entered/confirmed is exported; guidance hints never are.
        return [s for s in d.get("sections", []) if (s.get("content") or "").strip()]

    def render_docx(d: dict) -> bytes:
        from docx import Document
        from docx.shared import Pt, RGBColor
        from docx.oxml.ns import qn
        from docx.oxml import OxmlElement
        t = TEMPLATES.get(d.get("template"), TEMPLATES["classic"])
        doc = Document()
        st = doc.styles["Normal"]
        st.font.name = t["docx_font"]
        st.font.size = Pt(t["body"])
        st.paragraph_format.space_after = Pt(2)
        p = d.get("personal") or {}
        h = doc.add_paragraph()
        run = h.add_run(p.get("full_name") or "")
        run.bold = True
        run.font.size = Pt(t["name"])
        if t["color"]:
            run.font.color.rgb = RGBColor.from_string(t["color"][1:])
        contact = " | ".join(contact_line(p))
        if contact:
            doc.add_paragraph(contact)
        for s in export_sections(d):
            hp = doc.add_paragraph()
            hp.paragraph_format.space_before = Pt(8)
            hr = hp.add_run((s.get("title") or "").upper())
            hr.bold = True
            hr.font.size = Pt(t["head"])
            if t["color"]:
                hr.font.color.rgb = RGBColor.from_string(t["color"][1:])
            if t["rule"]:
                pPr = hp._p.get_or_add_pPr()
                bdr = OxmlElement("w:pBdr")
                b = OxmlElement("w:bottom")
                for k, v in (("w:val", "single"), ("w:sz", "6"), ("w:space", "1"), ("w:color", "999999")):
                    b.set(qn(k), v)
                bdr.append(b)
                pPr.append(bdr)
            for line in (s.get("content") or "").splitlines():
                line = line.rstrip()
                if not line:
                    continue
                if line.lstrip().startswith(("- ", "• ", "* ")):
                    doc.add_paragraph(line.lstrip()[2:], style="List Bullet")
                else:
                    doc.add_paragraph(line)
        buf = io.BytesIO()
        doc.save(buf)
        return buf.getvalue()

    def render_pdf(d: dict) -> bytes:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.lib.colors import HexColor
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
        from xml.sax.saxutils import escape as x
        t = TEMPLATES.get(d.get("template"), TEMPLATES["classic"])
        col = HexColor(t["color"]) if t["color"] else HexColor("#111111")
        buf = io.BytesIO()
        pdf = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                                topMargin=16 * mm, bottomMargin=16 * mm, title=d.get("title") or "Resume")
        fb, fr = t["pdf_font"]
        name = ParagraphStyle("n", fontName=fb, fontSize=t["name"], leading=t["name"] + 4, textColor=col)
        body = ParagraphStyle("b", fontName=fr, fontSize=t["body"] - 0.5, leading=t["body"] + 3.5)
        head = ParagraphStyle("h", fontName=fb, fontSize=t["head"], leading=t["head"] + 4, spaceBefore=10,
                              spaceAfter=3, textColor=col)
        bullet = ParagraphStyle("bl", parent=body, leftIndent=12, bulletIndent=2)
        p = d.get("personal") or {}
        flow = [Paragraph(x(p.get("full_name") or ""), name)]
        contact = " | ".join(x(v) for v in contact_line(p))
        if contact:
            flow.append(Paragraph(contact, body))
        flow.append(Spacer(1, 4))
        for s in export_sections(d):
            flow.append(Paragraph(x((s.get("title") or "").upper()), head))
            if t["rule"]:
                flow.append(HRFlowable(width="100%", thickness=0.6, color=HexColor("#999999"), spaceAfter=4))
            for line in (s.get("content") or "").splitlines():
                line = line.rstrip()
                if not line:
                    continue
                if line.lstrip().startswith(("- ", "• ", "* ")):
                    flow.append(Paragraph(x(line.lstrip()[2:]), bullet, bulletText="•"))
                else:
                    flow.append(Paragraph(x(line), body))
        pdf.build(flow)
        return buf.getvalue()

    @r.post("/career/resumes/{resume_id}/download-link")
    async def download_link(resume_id: str, req: DownloadReq, user=Depends(get_current_user)):
        if req.format not in ("pdf", "docx"):
            raise HTTPException(400, "Format must be pdf or docx")
        await own("resumes", "resume_id", resume_id, user)
        token = uuid.uuid4().hex + uuid.uuid4().hex
        await db.download_tokens.insert_one({"token": token, "user_id": user["user_id"], "resume_id": resume_id,
                                             "format": req.format,
                                             "expires_at": (now_utc() + timedelta(minutes=10)).isoformat()})
        return {"path": f"/api/career/download/{token}"}

    @r.get("/career/download/{token}")
    async def download(token: str):
        t = await db.download_tokens.find_one({"token": token}, {"_id": 0})
        if not t or (parse_dt(t["expires_at"]) or now_utc()) < now_utc():
            raise HTTPException(404, "Download link expired. Please try again from the app.")
        d = await db.resumes.find_one({"resume_id": t["resume_id"], "user_id": t["user_id"]}, {"_id": 0})
        if not d:
            raise HTTPException(404, "Resume not found")
        fname = re.sub(r"[^A-Za-z0-9_-]+", "_", f"{(d.get('personal') or {}).get('full_name') or 'Resume'}_{d['title']}")[:80]
        if t["format"] == "pdf":
            data, mt = render_pdf(d), "application/pdf"
        else:
            data = render_docx(d)
            mt = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        return StreamingResponse(io.BytesIO(data), media_type=mt, headers={
            "Content-Disposition": f'attachment; filename="{fname}.{t["format"]}"'})

    # ------------------------------------------------------------------ analyser
    ANALYSIS_SCHEMA = """{
 "match_score": 0-100 integer,
 "score_explanation": "how the score was calculated, in 2-3 sentences",
 "score_breakdown": [{"factor":"Skills match","weight":40,"score":0-100},{"factor":"Experience match","weight":25,"score":0-100},{"factor":"Qualifications & certifications","weight":15,"score":0-100},{"factor":"Keywords coverage","weight":10,"score":0-100},{"factor":"ATS readiness","weight":10,"score":0-100}],
 "matching_skills": [{"item":"...","evidence":"short quote/reason from resume"}],
 "missing_skills": [{"item":"...","status":"missing" or "unclear","note":"missing = not mentioned at all; unclear = possibly present but not evidenced, candidate may have simply omitted it"}],
 "experience_match": {"summary":"...","experience":"...","education":"...","certifications":"..."},
 "keyword_analysis": {"present":["..."],"missing":["..."]},
 "ats_check": [{"area":"Contact details|Section headings|Structure|Formatting|Readability|Dates","status":"ok|warning|issue","note":"..."}],
 "suggestions": {"summary":["..."],"skills":["..."],"experience":["..."],"achievements":["..."]},
 "limitations": "1-2 sentences on limits of this estimate"
}"""

    @r.post("/career/analyse")
    async def analyse(req: AnalyseReq, user=Depends(get_current_user)):
        resume, jd = _clean(req.resume_text, 15000), _clean(req.jd_text, 12000)
        if len(resume) < 150:
            raise HTTPException(400, "Please paste your full resume text (at least 150 characters)")
        if len(jd) < 80:
            raise HTTPException(400, "Please paste the complete job description (at least 80 characters)")
        h = hashlib.sha256((resume + "\n||\n" + jd).encode()).hexdigest()
        cached = await db.resume_analyses.find_one({"user_id": user["user_id"], "input_hash": h}, {"_id": 0})
        if cached:
            return {"analysis": cached, "reused": True}
        await require_tool(user, "resume_analyser")
        with Lock(user, "resume_analysis"):
            data = await ai_json(user, "resume_analysis",
                                 "You are a fair, precise ATS and recruitment analyst. Assess only what is written. "
                                 "Never encourage the candidate to claim skills they do not have. The score is an "
                                 "estimate, not a guarantee.",
                                 f"Compare the RESUME with the JOB DESCRIPTION. Return JSON exactly in this shape:\n"
                                 f"{ANALYSIS_SCHEMA}\n\nRESUME:\n{resume}\n\nJOB DESCRIPTION:\n{jd}", 5000)
            try:
                data["match_score"] = max(0, min(100, int(data.get("match_score", 0))))
            except Exception:
                data["match_score"] = 0
            first = next((ln.strip() for ln in jd.splitlines() if ln.strip()), "Job")[:70]
            doc = {"analysis_id": f"ana_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"], "input_hash": h,
                   "job_label": first, "resume_text": resume, "jd_text": jd, "result": data,
                   "improved_resume_id": None, "created_at": now_iso()}
            await db.resume_analyses.insert_one(dict(doc))
            await record_usage(user, "resume_analysis", doc["analysis_id"])
        return {"analysis": doc, "reused": False}

    @r.get("/career/analyses")
    async def list_analyses(user=Depends(get_current_user)):
        items = await db.resume_analyses.find({"user_id": user["user_id"]},
                                              {"_id": 0, "resume_text": 0, "jd_text": 0}).sort("created_at", -1).to_list(200)
        return {"analyses": [{"analysis_id": a["analysis_id"], "job_label": a["job_label"],
                              "match_score": a["result"].get("match_score"), "created_at": a["created_at"]}
                             for a in items]}

    @r.get("/career/analyses/{analysis_id}")
    async def get_analysis(analysis_id: str, user=Depends(get_current_user)):
        return {"analysis": await own("resume_analyses", "analysis_id", analysis_id, user)}

    @r.delete("/career/analyses/{analysis_id}")
    async def delete_analysis(analysis_id: str, user=Depends(get_current_user)):
        res = await db.resume_analyses.delete_one({"analysis_id": analysis_id, "user_id": user["user_id"]})
        if not res.deleted_count:
            raise HTTPException(404, "Not found")
        return {"success": True}

    @r.post("/career/analyses/{analysis_id}/improve")
    async def improve(analysis_id: str, user=Depends(get_current_user)):
        a = await own("resume_analyses", "analysis_id", analysis_id, user)
        if a.get("improved_resume_id"):
            ex = await db.resumes.find_one({"resume_id": a["improved_resume_id"], "user_id": user["user_id"]},
                                           {"_id": 0})
            if ex:
                return {"resume": ex, "reused": True}
        await require_tool(user, "resume_builder")
        with Lock(user, "resume_generation"):
            data = await ai_json(user, "resume_improve",
                                 "You are an expert ATS resume writer. " + NO_INVENT +
                                 " Improve structure, headings, wording and keyword alignment using only the "
                                 "candidate's genuine content.",
                                 'Return JSON: {"personal":{"full_name":"","email":"","phone":"","location":"",'
                                 f'"linkedin":""}},"resume_type":"fresher|experienced",{RESUME_SCHEMA[1:]}\n'
                                 "Extract personal details only from the resume text.\n\n"
                                 f"ORIGINAL RESUME:\n{a['resume_text']}\n\nJOB DESCRIPTION:\n{a['jd_text']}\n\n"
                                 f"ANALYSIS SUGGESTIONS:\n{json.dumps(a['result'].get('suggestions', {}))}", 5000)
            pers = {k: _clean((data.get("personal") or {}).get(k), 120) for k in Personal.__fields__}
            rtype = data.get("resume_type") if data.get("resume_type") in ("fresher", "experienced") else "experienced"
            doc = await save_resume(user, f"Improved — {a['job_label']}"[:100], rtype, pers, data.get("sections"),
                                    a["job_label"], "ai_improve")
            await db.resume_analyses.update_one({"analysis_id": analysis_id}, {"$set": {
                "improved_resume_id": doc["resume_id"]}})
            await record_usage(user, "resume_generation", doc["resume_id"])
        return {"resume": doc, "reused": False}

    # ------------------------------------------------------------------ interview coach
    @r.get("/career/job-prefill/{job_id}")
    async def job_prefill(job_id: str, user=Depends(get_current_user)):
        job = await db.jobs.find_one({"job_id": job_id, "status": "Published"}, {"_id": 0})
        if not job:
            raise HTTPException(404, "Job not found")
        m = await compute_membership(user["user_id"])
        desc = job.get("description") or ""
        parts = [f"{job.get('title')} at {job.get('company')} ({job.get('city') or job.get('location')}, "
                 f"{job.get('country') or 'India'})"]
        if m["is_active"]:
            parts += [desc, "Key responsibilities:\n" + (job.get("key_responsibilities") or ""),
                      "Required skills: " + (job.get("required_skills") or ""),
                      "Preferred skills: " + (job.get("preferred_skills") or "")]
        else:
            parts.append(desc[:180])
        if job.get("experience_required"):
            parts.append("Experience required: " + job["experience_required"])
        return {"job_title": job.get("title"), "company": job.get("company"),
                "industry": job.get("industry_category") or job.get("industry"),
                "experience_required": job.get("experience_required"),
                "jd_text": "\n\n".join(p for p in parts if p.strip()), "full_jd": m["is_active"]}

    @r.post("/career/interviews")
    async def create_interview(req: InterviewReq, user=Depends(get_current_user)):
        if req.experience_level not in EXP_LEVELS:
            raise HTTPException(400, "Select a valid experience level")
        if req.interview_type not in INTERVIEW_TYPES:
            raise HTTPException(400, "Select a valid interview type")
        if req.difficulty not in DIFFICULTIES:
            raise HTTPException(400, "Select a valid difficulty")
        if req.num_questions not in (5, 10, 15):
            raise HTTPException(400, "Number of questions must be 5, 10 or 15")
        if req.feedback_mode not in ("each", "end"):
            raise HTTPException(400, "Invalid feedback mode")
        title, jd = _clean(req.job_title, 120), _clean(req.jd_text, 12000)
        if len(title) < 2:
            raise HTTPException(400, "Target job title is required")
        if len(jd) < 50:
            raise HTTPException(400, "Please paste the job description (at least 50 characters)")
        await require_tool(user, "interview_coach")
        with Lock(user, "interview_sessions"):
            focus = ("Focus on education, projects, internships, skills, problem-solving and career motivation."
                     if req.experience_level in ("Fresher", "0-2 years") else
                     "Focus on relevant experience, achievements, decision-making, role-specific knowledge, "
                     "leadership and business impact.")
            mix = ("Include a sensible mix: introduction & career background, technical/functional, role-specific, "
                   "situational & behavioural, problem-solving, managerial (if relevant), experience & achievements."
                   if req.interview_type == "Complete Mock Interview" else
                   f"All questions should be {req.interview_type} questions.")
            data = await ai_json(user, "interview_questions",
                                 "You are a senior interviewer and career coach. Generate realistic, role-specific "
                                 "interview questions; avoid generic questions where role-specific ones are possible.",
                                 f"Generate exactly {req.num_questions} interview questions.\nRole: {title}\n"
                                 f"Company: {req.company or 'Not specified'}\nIndustry: {req.industry or 'Not specified'}\n"
                                 f"Experience level: {req.experience_level}\nDifficulty: {req.difficulty}\n{mix}\n{focus}\n"
                                 'Return JSON: {"questions":[{"question":"...","category":"Introduction|Technical|'
                                 'Functional|Role-specific|Behavioural|Situational|Problem-solving|Managerial|'
                                 'Experience"}]}\n\nJOB DESCRIPTION:\n' + jd, 3000)
            qs = [q for q in (data.get("questions") or []) if isinstance(q, dict) and q.get("question")]
            if not qs:
                raise HTTPException(502, "Could not generate questions. Please try again.")
            doc = {"session_id": f"int_{uuid.uuid4().hex[:12]}", "user_id": user["user_id"],
                   "job_title": title, "company": _clean(req.company, 120), "industry": _clean(req.industry, 80),
                   "jd_text": jd, "experience_level": req.experience_level, "interview_type": req.interview_type,
                   "difficulty": req.difficulty, "feedback_mode": req.feedback_mode, "job_id": req.job_id,
                   "questions": [{"question": _clean(q["question"], 600), "category": _clean(q.get("category"), 40),
                                  "status": "pending", "answer": None, "feedback": None, "hint": None}
                                 for q in qs[:req.num_questions]],
                   "status": "in_progress", "report": None, "overall_score": None,
                   "created_at": now_iso(), "updated_at": now_iso()}
            await db.interview_sessions.insert_one(dict(doc))
            await record_usage(user, "interview_sessions", doc["session_id"])
        doc.pop("_id", None)
        return {"session": doc}

    async def own_session(session_id, user, editable=True):
        s = await own("interview_sessions", "session_id", session_id, user)
        if editable and s["status"] != "in_progress":
            raise HTTPException(400, "This interview has already ended")
        return s

    def q_at(s, index):
        if index < 0 or index >= len(s["questions"]):
            raise HTTPException(400, "Invalid question")
        return s["questions"][index]

    EVAL_SCHEMA = ('{"score":0-100,"dimensions":{"relevance":0-10,"role_knowledge":0-10,"structure_clarity":0-10,'
                   '"specific_examples":0-10,"communication":0-10,"completeness":0-10},"did_well":["..."],'
                   '"missing":["..."],"how_to_improve":["..."],"stronger_structure":"EXAMPLE answer structure — '
                   'an outline/template only, with placeholders like [your example]; never invent personal '
                   'experience","star_tip":"STAR guidance if behavioural/situational else empty",'
                   '"follow_up":"a follow-up question or empty"}')

    def eval_context(s):
        return (f"Role: {s['job_title']} | Experience level: {s['experience_level']} | Difficulty: "
                f"{s['difficulty']}\nJD (excerpt): {s['jd_text'][:3000]}")

    @r.post("/career/interviews/{session_id}/answer")
    async def answer(session_id: str, req: AnswerReq, user=Depends(get_current_user)):
        s = await own_session(session_id, user)
        q = q_at(s, req.index)
        ans = _clean(req.answer, 5000)
        if len(ans) < 5:
            raise HTTPException(400, "Please type your answer before submitting")
        upd = {f"questions.{req.index}.answer": ans, f"questions.{req.index}.status": "answered",
               "updated_at": now_iso()}
        if s["feedback_mode"] == "each":
            with Lock(user, f"answer_{session_id}"):
                fb = await ai_json(user, "interview_evaluation",
                                   "You are a fair, encouraging interview coach. Evaluate the answer honestly. "
                                   "For technical questions assess accuracy where you reasonably can. Any example "
                                   "must be clearly an example structure; never invent the candidate's experience.",
                                   f"{eval_context(s)}\n\nQUESTION ({q['category']}): {q['question']}\n\n"
                                   f"CANDIDATE ANSWER: {ans}\n\nReturn JSON: {EVAL_SCHEMA}", 1800)
            try:
                fb["score"] = max(0, min(100, int(fb.get("score", 0))))
            except Exception:
                fb["score"] = 0
            upd[f"questions.{req.index}.feedback"] = fb
        await db.interview_sessions.update_one({"session_id": session_id}, {"$set": upd})
        return {"session": await own("interview_sessions", "session_id", session_id, user)}

    @r.post("/career/interviews/{session_id}/hint")
    async def hint(session_id: str, req: IndexReq, user=Depends(get_current_user)):
        s = await own_session(session_id, user)
        q = q_at(s, req.index)
        if q.get("hint"):
            return {"hint": q["hint"]}
        with Lock(user, f"hint_{session_id}"):
            data = await ai_json(user, "interview_hint", "You are an interview coach giving short hints.",
                                 f"{eval_context(s)}\n\nQUESTION: {q['question']}\nGive a 2-3 sentence hint on what "
                                 'a strong answer should cover, without writing the answer. Return JSON: {"hint":"..."}',
                                 400)
        h = _clean(data.get("hint"), 800)
        await db.interview_sessions.update_one({"session_id": session_id},
                                               {"$set": {f"questions.{req.index}.hint": h}})
        return {"hint": h}

    @r.post("/career/interviews/{session_id}/skip")
    async def skip(session_id: str, req: IndexReq, user=Depends(get_current_user)):
        s = await own_session(session_id, user)
        q_at(s, req.index)
        await db.interview_sessions.update_one({"session_id": session_id}, {"$set": {
            f"questions.{req.index}.status": "skipped", "updated_at": now_iso()}})
        return {"session": await own("interview_sessions", "session_id", session_id, user)}

    @r.post("/career/interviews/{session_id}/end")
    async def end(session_id: str, user=Depends(get_current_user)):
        s = await own("interview_sessions", "session_id", session_id, user)
        if s.get("report"):
            return {"session": s}
        answered = [(i, q) for i, q in enumerate(s["questions"]) if q["status"] == "answered"]
        if not answered:
            await db.interview_sessions.update_one({"session_id": session_id}, {"$set": {
                "status": "ended", "updated_at": now_iso(), "report": {"empty": True, "overall_score": 0,
                "summary": "No questions were answered in this session.", "disclaimer": AI_DISCLAIMER}}})
            return {"session": await own("interview_sessions", "session_id", session_id, user)}
        qa = [{"index": i, "category": q["category"], "question": q["question"], "answer": q["answer"],
               "score": (q.get("feedback") or {}).get("score")} for i, q in answered]
        skipped = [q["question"] for q in s["questions"] if q["status"] != "answered"]
        need_scores = s["feedback_mode"] == "end"
        with Lock(user, f"report_{session_id}"):
            data = await ai_json(user, "interview_report",
                                 "You are a senior interview coach writing a practice performance report. Be "
                                 "specific, honest and supportive. Never invent the candidate's experiences.",
                                 f"{eval_context(s)}\n\nANSWERED QUESTIONS:\n{json.dumps(qa, ensure_ascii=False)}\n"
                                 f"SKIPPED/UNANSWERED: {json.dumps(skipped, ensure_ascii=False)}\n\n"
                                 + ("Score each answered question (0-100) and give brief feedback in "
                                    '"question_feedback":[{"index":n,"score":0-100,"did_well":"...","improve":"..."}].\n'
                                    if need_scores else "") +
                                 'Return JSON: {"overall_score":0-100,"summary":"...","strengths":["..."],'
                                 '"areas_for_improvement":["..."],"knowledge_gaps":["..."],'
                                 '"communication_feedback":"...","answered_well":["question text"],'
                                 '"needs_preparation":["question text"],"topics_to_study":["..."],'
                                 '"practice_questions":["..."],"preparation_plan":["Day/step: ..."]'
                                 + (',"question_feedback":[...]' if need_scores else "") + "}", 4500)
        upd = {}
        if need_scores:
            for qf in data.get("question_feedback") or []:
                try:
                    idx = int(qf.get("index"))
                    sc = max(0, min(100, int(qf.get("score", 0))))
                except Exception:
                    continue
                if 0 <= idx < len(s["questions"]):
                    upd[f"questions.{idx}.feedback"] = {"score": sc, "did_well": [qf.get("did_well", "")],
                                                        "how_to_improve": [qf.get("improve", "")], "summary_only": True}
        try:
            overall = max(0, min(100, int(data.get("overall_score", 0))))
        except Exception:
            overall = 0
        data["overall_score"] = overall
        data["disclaimer"] = AI_DISCLAIMER
        data.pop("question_feedback", None)
        upd.update({"status": "completed", "report": data, "overall_score": overall, "updated_at": now_iso()})
        await db.interview_sessions.update_one({"session_id": session_id}, {"$set": upd})
        return {"session": await own("interview_sessions", "session_id", session_id, user)}

    @r.get("/career/interviews")
    async def list_interviews(user=Depends(get_current_user)):
        items = await db.interview_sessions.find({"user_id": user["user_id"]},
                                                 {"_id": 0, "jd_text": 0, "questions": 0, "report": 0}).sort(
            "created_at", -1).to_list(200)
        return {"sessions": items}

    @r.get("/career/interviews/{session_id}")
    async def get_interview(session_id: str, user=Depends(get_current_user)):
        return {"session": await own("interview_sessions", "session_id", session_id, user)}

    @r.delete("/career/interviews/{session_id}")
    async def delete_interview(session_id: str, user=Depends(get_current_user)):
        res = await db.interview_sessions.delete_one({"session_id": session_id, "user_id": user["user_id"]})
        if not res.deleted_count:
            raise HTTPException(404, "Not found")
        return {"success": True}

    @r.delete("/career/data")
    async def delete_all(user=Depends(get_current_user)):
        uid = {"user_id": user["user_id"]}
        await db.resumes.delete_many(uid)
        await db.resume_analyses.delete_many(uid)
        await db.interview_sessions.delete_many(uid)
        await db.download_tokens.delete_many(uid)
        return {"success": True}

    # ------------------------------------------------------------------ saved searches
    @r.get("/saved-searches")
    async def list_searches(user=Depends(get_current_user)):
        items = await db.saved_searches.find({"user_id": user["user_id"]}, {"_id": 0}).sort(
            "created_at", -1).to_list(50)
        return {"searches": items}

    @r.post("/saved-searches")
    async def create_search(req: SavedSearchReq, user=Depends(get_current_user)):
        if await db.saved_searches.count_documents({"user_id": user["user_id"]}) >= 20:
            raise HTTPException(400, "You can save up to 20 searches. Delete one to add another.")
        allowed = ("q", "region", "industry_category", "work_mode", "sort")
        filters = {k: _clean(v, 80) for k, v in req.filters.items() if k in allowed and v and v != "All"}
        if not filters:
            raise HTTPException(400, "Choose at least one filter or search term to save")
        doc = {"search_id": f"ss_{uuid.uuid4().hex[:10]}", "user_id": user["user_id"],
               "name": _clean(req.name, 60) or "My search", "filters": filters, "created_at": now_iso()}
        await db.saved_searches.insert_one(dict(doc))
        doc.pop("_id", None)
        return {"search": doc}

    @r.delete("/saved-searches/{search_id}")
    async def delete_search(search_id: str, user=Depends(get_current_user)):
        await db.saved_searches.delete_one({"search_id": search_id, "user_id": user["user_id"]})
        return {"success": True}

    # ------------------------------------------------------------------ admin
    @r.get("/admin/career/settings")
    async def admin_get_settings(admin=Depends(require_admin)):
        return {"settings": await get_settings()}

    @r.put("/admin/career/settings")
    async def admin_put_settings(req: SettingsReq, admin=Depends(require_admin)):
        tools = {t: {"enabled": bool(req.tools.get(t, {}).get("enabled", True)),
                     "free_access": bool(req.tools.get(t, {}).get("free_access", False))} for t in TOOL_KIND}
        limits = {tier: {k: max(0, min(1000, int(req.limits.get(tier, {}).get(k, 0)))) for k in KINDS}
                  for tier in TIERS}
        addons = [{"key": _clean(a.get("key"), 40), "name": _clean(a.get("name"), 80),
                   "price": max(0, float(a.get("price") or 0)), "enabled": bool(a.get("enabled"))}
                  for a in req.addons[:10]]
        await db.career_settings.update_one({"settings_id": "career"}, {"$set": {
            "tools": tools, "limits": limits, "period_days": max(1, min(365, req.period_days)),
            "addons": addons, "updated_at": now_iso()}}, upsert=True)
        return {"settings": await get_settings()}

    @r.get("/admin/career/stats")
    async def admin_stats(admin=Depends(require_admin)):
        since = (now_utc() - timedelta(days=30)).isoformat()
        usage = {}
        for k in KINDS:
            usage[k] = {"total": await db.career_usage.count_documents({"kind": k}),
                        "last_30d": await db.career_usage.count_documents({"kind": k, "created_at": {"$gte": since}})}
        users = await db.career_usage.distinct("user_id")
        calls = await db.ai_calls.find({}, {"_id": 0, "purpose": 1, "success": 1, "input_tokens": 1,
                                            "output_tokens": 1, "est_cost_usd": 1, "created_at": 1}).to_list(20000)
        by_purpose: dict = {}
        for c in calls:
            b = by_purpose.setdefault(c["purpose"], {"calls": 0, "failed": 0, "cost_usd": 0.0})
            b["calls"] += 1
            b["failed"] += 0 if c.get("success") else 1
            b["cost_usd"] = round(b["cost_usd"] + (c.get("est_cost_usd") or 0), 4)
        failures = await db.ai_calls.find({"success": False}, {"_id": 0, "purpose": 1, "error": 1,
                                                                "created_at": 1}).sort("created_at", -1).to_list(20)
        return {
            "usage": usage, "unique_users": len(users),
            "saved_resumes": await db.resumes.count_documents({}),
            "saved_analyses": await db.resume_analyses.count_documents({}),
            "interview_sessions": await db.interview_sessions.count_documents({}),
            "completed_interviews": await db.interview_sessions.count_documents({"status": "completed"}),
            "ai": {"total_calls": len(calls), "failed_calls": sum(1 for c in calls if not c.get("success")),
                   "input_tokens": sum(c.get("input_tokens") or 0 for c in calls),
                   "output_tokens": sum(c.get("output_tokens") or 0 for c in calls),
                   "est_cost_usd": round(sum(c.get("est_cost_usd") or 0 for c in calls), 4),
                   "by_purpose": by_purpose, "model": AI_MODEL[1]},
            "recent_failures": failures,
            "ai_configured": bool(os.environ.get("EMERGENT_LLM_KEY")),
        }

    return r
