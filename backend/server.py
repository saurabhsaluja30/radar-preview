import os
import re
import uuid
import logging
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import httpx
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Header, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("jobradar")

app = FastAPI(title="JobRadar by Evolveminds")
api = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Email (Emergent-managed Resend)
# ---------------------------------------------------------------------------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "JobRadar by Evolveminds")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


def _wrap_email(title: str, inner: str) -> str:
    return (
        '<table role="presentation" width="100%" style="background:#F5F3FF;padding:24px 0;'
        'font-family:Arial,Helvetica,sans-serif"><tr><td align="center">'
        '<table role="presentation" width="560" style="background:#FFFFFF;border-radius:16px;overflow:hidden">'
        '<tr><td style="background:#6D28D9;padding:20px 28px">'
        '<span style="color:#FFFFFF;font-size:20px;font-weight:700">JobRadar</span>'
        '<span style="color:#DDD6FE;font-size:13px"> by Evolveminds</span></td></tr>'
        f'<tr><td style="padding:28px"><h1 style="color:#4C1D95;font-size:20px;margin:0 0 16px">{escape(title)}</h1>'
        f'{inner}</td></tr>'
        '<tr><td style="padding:18px 28px;background:#F5F3FF">'
        '<p style="color:#6B7280;font-size:12px;margin:0">JobRadar by Evolveminds &mdash; Stop Searching. Start Discovering.</p>'
        '<p style="color:#9CA3AF;font-size:11px;margin:8px 0 0">We never ask for your password or card details by email. '
        'JobRadar provides curated job information for discovery only and does not guarantee employment.</p>'
        '</td></tr></table></td></tr></table>'
    )


async def send_and_log_email(*, candidate_id: Optional[str], to: str, email_type: str, subject: str, html: str):
    """Log every email, attempt real send via Resend, never raise to the caller."""
    log = {
        "email_id": f"email_{uuid.uuid4().hex[:12]}",
        "candidate_id": candidate_id,
        "to": to,
        "email_type": email_type,
        "subject": subject,
        "date_sent": now_iso(),
        "delivery_status": "logged",
        "error_message": None,
        "created_at": now_iso(),
    }
    try:
        _assert_safe_email(subject, html)
        if EMAIL_KEY:
            async with httpx.AsyncClient(timeout=30) as c:
                resp = await c.post(
                    f"{EMAIL_BASE_URL}/api/v1/email/send",
                    headers={"X-Email-Key": EMAIL_KEY},
                    json={"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME},
                )
            if resp.status_code in (200, 202):
                log["delivery_status"] = "sent"
                try:
                    log["provider_id"] = resp.json().get("id")
                except Exception:
                    pass
            else:
                log["delivery_status"] = "failed"
                log["error_message"] = f"{resp.status_code}: {resp.text[:200]}"
    except Exception as e:
        log["delivery_status"] = "failed"
        log["error_message"] = str(e)[:200]
    await db.email_logs.insert_one(dict(log))
    return log


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def check_pw(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def parse_dt(v) -> Optional[datetime]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    try:
        d = datetime.fromisoformat(str(v))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


async def create_session(user_id: str) -> str:
    token = f"jr_{uuid.uuid4().hex}{uuid.uuid4().hex}"
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": now_iso(),
        "expires_at": (now_utc() + timedelta(days=7)).isoformat(),
    })
    return token


DISCLAIMER = ("JobRadar by Evolveminds provides curated job information for discovery purposes only. "
              "We do not guarantee interviews, selection, employment, salary, or response from employers. "
              "Candidates are responsible for applying directly and verifying job information.")


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------
async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = parse_dt(session.get("expires_at"))
    if exp and exp < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail="Account suspended")
    return user


async def get_optional_user(authorization: Optional[str] = Header(None)):
    if not authorization:
        return None
    try:
        return await get_current_user(authorization)
    except HTTPException:
        return None


async def require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ---------------------------------------------------------------------------
# Membership computation
# ---------------------------------------------------------------------------
async def compute_membership(candidate_id: str) -> dict:
    """Compute effective membership status dynamically from latest subscription."""
    sub = await db.subscriptions.find_one(
        {"candidate_id": candidate_id}, {"_id": 0}, sort=[("created_at", -1)]
    )
    base = {
        "status": "no_membership", "is_active": False, "plan_id": None, "plan_name": None,
        "start_date": None, "expiry_date": None, "days_remaining": 0,
        "is_demo": False, "subscription_id": None,
    }
    if not sub:
        return base
    status = sub.get("status")
    expiry = parse_dt(sub.get("expiry_date"))
    days = 0
    if expiry:
        days = (expiry - now_utc()).days
    if status == "cancelled":
        eff = "cancelled"
        is_active = False
    elif status == "payment_failed":
        eff = "payment_failed"
        is_active = False
    elif status == "pending":
        eff = "pending"
        is_active = False
    elif status == "active":
        if expiry and expiry < now_utc():
            eff = "expired"
            is_active = False
            days = 0
        elif days <= 7:
            eff = "expiring_soon"
            is_active = True
        else:
            eff = "active"
            is_active = True
    else:
        eff = "expired"
        is_active = False
        days = 0
    return {
        "status": eff, "is_active": is_active,
        "plan_id": sub.get("plan_id"), "plan_name": sub.get("plan_name"),
        "start_date": sub.get("start_date"), "expiry_date": sub.get("expiry_date"),
        "days_remaining": max(0, days), "is_demo": sub.get("is_demo", True),
        "subscription_id": sub.get("subscription_id"),
    }


# ---------------------------------------------------------------------------
# Job serialization
# ---------------------------------------------------------------------------
PREVIEW_FIELDS = ["job_id", "title", "company", "function", "sub_function", "industry",
                  "industry_category", "designation", "region", "location", "city", "country",
                  "currency", "visa_info", "experience_required", "work_mode", "employment_type",
                  "date_added", "last_updated", "featured", "status", "application_deadline",
                  "company_logo", "views", "saves"]
PREMIUM_FIELDS = ["description", "key_responsibilities", "required_skills", "preferred_skills",
                  "recruiter_name", "recruiter_email", "application_link", "source_link",
                  "salary_range"]


def serialize_job(job: dict, is_member: bool, is_saved: bool = False) -> dict:
    out = {k: job.get(k) for k in PREVIEW_FIELDS}
    desc = job.get("description") or ""
    out["preview"] = (desc[:180] + "...") if len(desc) > 180 else desc
    out["is_saved"] = is_saved
    out["locked"] = not is_member
    if is_member:
        for k in PREMIUM_FIELDS:
            out[k] = job.get(k)
    return out


# ---------------------------------------------------------------------------
# Pydantic request models
# ---------------------------------------------------------------------------
class RegisterReq(BaseModel):
    full_name: str
    email: EmailStr
    mobile: str
    password: str
    confirm_password: str
    preferred_function: Optional[str] = None
    preferred_location: Optional[str] = None
    preferred_experience: Optional[str] = None
    industry: Optional[str] = None
    current_designation: Optional[str] = None
    current_salary: Optional[str] = None
    preferred_industries: Optional[List[str]] = None
    preferred_designation: Optional[str] = None
    preferred_work_mode: Optional[str] = None
    consent: bool = False


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class SessionReq(BaseModel):
    session_id: str


class ForgotReq(BaseModel):
    email: EmailStr


class ResetReq(BaseModel):
    email: EmailStr
    token: str
    new_password: str


class ChangePwReq(BaseModel):
    current_password: str
    new_password: str


class ProfileReq(BaseModel):
    full_name: Optional[str] = None
    mobile: Optional[str] = None
    preferred_function: Optional[str] = None
    preferred_location: Optional[str] = None
    preferred_experience: Optional[str] = None
    industry: Optional[str] = None
    current_designation: Optional[str] = None
    current_salary: Optional[str] = None
    preferred_industries: Optional[List[str]] = None
    preferred_designation: Optional[str] = None
    preferred_work_mode: Optional[str] = None


class CheckoutReq(BaseModel):
    plan_id: str


class JobReq(BaseModel):
    title: str
    company: str
    function: Optional[str] = ""
    sub_function: Optional[str] = ""
    industry: Optional[str] = ""
    industry_category: Optional[str] = ""
    designation: Optional[str] = ""
    region: Optional[str] = "India"
    location: Optional[str] = ""
    city: Optional[str] = ""
    country: Optional[str] = "India"
    currency: Optional[str] = "INR"
    visa_info: Optional[str] = ""
    work_mode: Optional[str] = "Work From Office"
    experience_required: Optional[str] = ""
    salary_range: Optional[str] = ""
    employment_type: Optional[str] = "Full-time"
    description: Optional[str] = ""
    key_responsibilities: Optional[str] = ""
    required_skills: Optional[str] = ""
    preferred_skills: Optional[str] = ""
    recruiter_name: Optional[str] = ""
    recruiter_email: Optional[str] = ""
    application_link: Optional[str] = ""
    source_link: Optional[str] = ""
    application_deadline: Optional[str] = ""
    status: Optional[str] = "Published"
    featured: Optional[bool] = False
    verification_score: Optional[int] = 80
    admin_notes: Optional[str] = ""
    company_logo: Optional[str] = ""


class PlanReq(BaseModel):
    name: str
    price: float
    duration_days: int
    currency: str = "INR"
    active: bool = True
    featured: bool = False
    tagline: Optional[str] = ""


class DevActionReq(BaseModel):
    candidate_id: str
    action: str


class AnnouncementReq(BaseModel):
    subject: str
    message: str


# ===========================================================================
# AUTH ROUTES
# ===========================================================================
@api.post("/auth/register")
async def register(req: RegisterReq):
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if not req.consent:
        raise HTTPException(status_code=400, detail="You must accept the Terms and Privacy Policy")
    for _f, _label in (("industry", "Industry"), ("current_designation", "Current Designation"),
                       ("current_salary", "Current Salary"), ("preferred_location", "Preferred Job Location"),
                       ("preferred_work_mode", "Preferred Work Mode")):
        if not getattr(req, _f):
            raise HTTPException(status_code=400, detail=f"{_label} is required")
    existing = await db.users.find_one({"email": req.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": req.email.lower(),
        "full_name": req.full_name,
        "mobile": req.mobile,
        "password": hash_pw(req.password),
        "role": "candidate",
        "auth_provider": "password",
        "preferred_function": req.preferred_function,
        "preferred_location": req.preferred_location,
        "preferred_experience": req.preferred_experience,
        "industry": req.industry,
        "current_designation": req.current_designation,
        "current_salary": req.current_salary,
        "preferred_industries": req.preferred_industries or [],
        "preferred_designation": req.preferred_designation,
        "preferred_work_mode": req.preferred_work_mode,
        "consent": req.consent,
        "suspended": False,
        "picture": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "status": "active",
    }
    await db.users.insert_one(dict(doc))
    token = await create_session(user_id)
    inner = (f'<p style="color:#374151;font-size:15px">Hi {escape(req.full_name)},</p>'
             '<p style="color:#374151;font-size:15px">Welcome to JobRadar by Evolveminds! Your account is ready. '
             'Choose a membership plan to unlock curated job opportunities and apply directly to employers.</p>')
    await send_and_log_email(candidate_id=user_id, to=req.email.lower(), email_type="welcome",
                             subject="Welcome to JobRadar by Evolveminds", html=_wrap_email("Welcome aboard!", inner))
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    return {"token": token, "user": user}


@api.post("/auth/login")
async def login(req: LoginReq):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or not user.get("password") or not check_pw(req.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("suspended"):
        raise HTTPException(status_code=403, detail="Your account has been suspended")
    token = await create_session(user["user_id"])
    safe = {k: v for k, v in user.items() if k not in ("_id", "password")}
    return {"token": token, "user": safe}


@api.post("/auth/admin/login")
async def admin_login(req: LoginReq):
    user = await db.users.find_one({"email": req.email.lower(), "role": "admin"})
    if not user or not check_pw(req.password, user.get("password", "")):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    token = await create_session(user["user_id"])
    safe = {k: v for k, v in user.items() if k not in ("_id", "password")}
    return {"token": token, "user": safe}


@api.post("/auth/session")
async def google_session(req: SessionReq):
    async with httpx.AsyncClient(timeout=30) as c:
        resp = await c.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": req.session_id},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    data = resp.json()
    email = (data.get("email") or "").lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {
            "picture": data.get("picture"), "updated_at": now_iso()}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "full_name": data.get("name"),
            "mobile": None, "password": None, "role": "candidate", "auth_provider": "google",
            "picture": data.get("picture"), "preferred_function": None, "preferred_location": None,
            "preferred_experience": None, "consent": True, "suspended": False,
            "created_at": now_iso(), "updated_at": now_iso(), "status": "active",
        })
        inner = (f'<p style="color:#374151;font-size:15px">Hi {escape(data.get("name") or "there")},</p>'
                 '<p style="color:#374151;font-size:15px">Welcome to JobRadar by Evolveminds! '
                 'Choose a membership plan to unlock curated job opportunities.</p>')
        await send_and_log_email(candidate_id=user_id, to=email, email_type="welcome",
                                 subject="Welcome to JobRadar by Evolveminds",
                                 html=_wrap_email("Welcome aboard!", inner))
    token = await create_session(user_id)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password": 0})
    return {"session_token": token, "token": token, "user": user}


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    membership = await compute_membership(user["user_id"]) if user.get("role") != "admin" else None
    return {"user": user, "membership": membership}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"success": True}


@api.post("/auth/forgot-password")
async def forgot_password(req: ForgotReq):
    user = await db.users.find_one({"email": req.email.lower()})
    if user and user.get("auth_provider") == "password":
        token = f"{uuid.uuid4().hex[:8].upper()}"
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {
            "reset_token": token, "reset_expires": (now_utc() + timedelta(hours=1)).isoformat()}})
        inner = (f'<p style="color:#374151;font-size:15px">Hi {escape(user.get("full_name") or "there")},</p>'
                 '<p style="color:#374151;font-size:15px">Use the code below to reset your password. '
                 'It expires in 1 hour.</p>'
                 f'<p style="font-size:26px;font-weight:700;color:#6D28D9;letter-spacing:4px">{token}</p>')
        await send_and_log_email(candidate_id=user["user_id"], to=user["email"], email_type="password_reset",
                                 subject="Reset your JobRadar password",
                                 html=_wrap_email("Password reset code", inner))
    return {"success": True, "message": "If an account exists, a reset code has been sent."}


@api.post("/auth/reset-password")
async def reset_password(req: ResetReq):
    user = await db.users.find_one({"email": req.email.lower()})
    if not user or user.get("reset_token") != req.token:
        raise HTTPException(status_code=400, detail="Invalid or expired reset code")
    exp = parse_dt(user.get("reset_expires"))
    if not exp or exp < now_utc():
        raise HTTPException(status_code=400, detail="Reset code has expired")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    await db.users.update_one({"user_id": user["user_id"]}, {
        "$set": {"password": hash_pw(req.new_password), "updated_at": now_iso()},
        "$unset": {"reset_token": "", "reset_expires": ""}})
    return {"success": True}


@api.post("/auth/change-password")
async def change_password(req: ChangePwReq, user=Depends(get_current_user)):
    full = await db.users.find_one({"user_id": user["user_id"]})
    if not full.get("password") or not check_pw(req.current_password, full["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    await db.users.update_one({"user_id": user["user_id"]},
                              {"$set": {"password": hash_pw(req.new_password), "updated_at": now_iso()}})
    return {"success": True}


@api.put("/auth/profile")
async def update_profile(req: ProfileReq, user=Depends(get_current_user)):
    updates = {k: v for k, v in req.dict().items() if v is not None}
    updates["updated_at"] = now_iso()
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": updates})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "password": 0})
    return {"user": updated}


# ===========================================================================
# PUBLIC / CANDIDATE — CONFIG, PLANS, JOBS, MEMBERSHIP
# ===========================================================================
@api.get("/config")
async def get_config():
    return {
        "brand": "JobRadar by Evolveminds",
        "tagline": "Stop Searching. Start Discovering.",
        "disclaimer": DISCLAIMER,
        "categories": [
            "HR & Recruitment", "Finance & Accounting", "Operations & Customer Experience",
            "Travel & Hospitality", "Sales & Business Development", "IT & Technology",
            "Other Professional Roles",
        ],
        "industries": [
            "HR & Recruitment", "Finance & Accounting", "IT & Technology",
            "Travel & Hospitality", "BPO / Customer Experience",
        ],
        "regions": ["India", "International"],
    }


@api.get("/plans")
async def get_plans():
    plans = await db.plans.find({"active": True}, {"_id": 0}).sort("duration_days", 1).to_list(50)
    return {"plans": plans}


@api.get("/jobs")
async def list_jobs(
    user=Depends(get_optional_user),
    q: Optional[str] = None,
    function: Optional[str] = None,
    location: Optional[str] = None,
    experience: Optional[str] = None,
    work_mode: Optional[str] = None,
    industry: Optional[str] = None,
    industry_category: Optional[str] = None,
    region: Optional[str] = None,
    country: Optional[str] = None,
    featured: Optional[bool] = None,
    sort: str = "newest",
    limit: int = 50,
):
    query: dict = {"status": "Published"}
    if function and function != "All":
        query["function"] = function
    if location:
        query["location"] = {"$regex": re.escape(location), "$options": "i"}
    if work_mode and work_mode != "All":
        query["work_mode"] = work_mode
    if industry and industry != "All":
        query["industry"] = industry
    if industry_category and industry_category != "All":
        query["industry_category"] = industry_category
    if region and region != "All":
        query["region"] = region
    if country and country != "All":
        query["country"] = {"$regex": re.escape(country), "$options": "i"}
    if experience:
        query["experience_required"] = {"$regex": re.escape(experience), "$options": "i"}
    if featured is not None:
        query["featured"] = featured
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"title": rx}, {"company": rx}, {"required_skills": rx}, {"description": rx}]
    sort_field = "featured" if sort == "relevance" else "date_added"
    cursor = db.jobs.find(query, {"_id": 0, "admin_notes": 0, "verification_score": 0}).sort(
        [(sort_field, -1), ("date_added", -1)]).limit(min(limit, 100))
    jobs = await cursor.to_list(100)
    is_member = False
    saved_ids: set = set()
    if user and user.get("role") == "candidate":
        m = await compute_membership(user["user_id"])
        is_member = m["is_active"]
        saved = await db.saved_jobs.find({"candidate_id": user["user_id"]}, {"_id": 0, "job_id": 1}).to_list(500)
        saved_ids = {s["job_id"] for s in saved}
    return {"jobs": [serialize_job(j, is_member, j["job_id"] in saved_ids) for j in jobs],
            "is_member": is_member, "count": len(jobs)}


@api.get("/jobs/{job_id}")
async def get_job(job_id: str, user=Depends(get_optional_user)):
    job = await db.jobs.find_one({"job_id": job_id, "status": "Published"},
                                 {"_id": 0, "admin_notes": 0, "verification_score": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    await db.jobs.update_one({"job_id": job_id}, {"$inc": {"views": 1}})
    is_member = False
    is_saved = False
    if user and user.get("role") == "candidate":
        m = await compute_membership(user["user_id"])
        is_member = m["is_active"]
        is_saved = bool(await db.saved_jobs.find_one({"candidate_id": user["user_id"], "job_id": job_id}))
    data = serialize_job(job, is_member, is_saved)
    data["disclaimer"] = DISCLAIMER
    return {"job": data, "is_member": is_member, "authenticated": bool(user)}


@api.post("/jobs/{job_id}/save")
async def save_job(job_id: str, user=Depends(get_current_user)):
    job = await db.jobs.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    existing = await db.saved_jobs.find_one({"candidate_id": user["user_id"], "job_id": job_id})
    if not existing:
        await db.saved_jobs.insert_one({
            "saved_id": f"sav_{uuid.uuid4().hex[:12]}", "candidate_id": user["user_id"],
            "job_id": job_id, "created_at": now_iso()})
        await db.jobs.update_one({"job_id": job_id}, {"$inc": {"saves": 1}})
    return {"success": True, "saved": True}


@api.delete("/jobs/{job_id}/save")
async def unsave_job(job_id: str, user=Depends(get_current_user)):
    res = await db.saved_jobs.delete_one({"candidate_id": user["user_id"], "job_id": job_id})
    if res.deleted_count:
        await db.jobs.update_one({"job_id": job_id}, {"$inc": {"saves": -1}})
    return {"success": True, "saved": False}


@api.get("/saved-jobs")
async def saved_jobs(user=Depends(get_current_user)):
    m = await compute_membership(user["user_id"])
    saved = await db.saved_jobs.find({"candidate_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(500)
    ids = [s["job_id"] for s in saved]
    jobs = await db.jobs.find({"job_id": {"$in": ids}}, {"_id": 0, "admin_notes": 0, "verification_score": 0}).to_list(500)
    jmap = {j["job_id"]: j for j in jobs}
    out = [serialize_job(jmap[i], m["is_active"], True) for i in ids if i in jmap]
    return {"jobs": out, "is_member": m["is_active"]}


@api.post("/jobs/{job_id}/apply-click")
async def apply_click(job_id: str, user=Depends(get_current_user)):
    m = await compute_membership(user["user_id"])
    if not m["is_active"]:
        raise HTTPException(status_code=403, detail="Active membership required")
    await db.jobs.update_one({"job_id": job_id}, {"$inc": {"apply_clicks": 1}})
    await db.application_clicks.insert_one({
        "click_id": f"clk_{uuid.uuid4().hex[:12]}", "candidate_id": user["user_id"],
        "job_id": job_id, "created_at": now_iso(), "status": "clicked"})
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0, "application_link": 1, "source_link": 1})
    return {"success": True, "application_link": (job or {}).get("application_link")}


@api.get("/membership")
async def membership(user=Depends(get_current_user)):
    m = await compute_membership(user["user_id"])
    payments = await db.payments.find({"candidate_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    plans = await db.plans.find({"active": True}, {"_id": 0}).sort("duration_days", 1).to_list(50)
    return {"membership": m, "payments": payments, "plans": plans}


@api.get("/payments")
async def my_payments(user=Depends(get_current_user)):
    payments = await db.payments.find({"candidate_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"payments": payments}


async def _activate_subscription(candidate_id: str, plan: dict, is_demo: bool, payment_id: str) -> dict:
    """Apply activation/renewal logic; stack duration onto active memberships."""
    current = await compute_membership(candidate_id)
    duration = int(plan["duration_days"])
    if current["is_active"] and current.get("expiry_date"):
        start = parse_dt(current["expiry_date"]) or now_utc()
        base_start = parse_dt(current.get("start_date")) or now_utc()
    else:
        start = now_utc()
        base_start = now_utc()
    expiry = start + timedelta(days=duration)
    sub_id = f"sub_{uuid.uuid4().hex[:12]}"
    renewal = current["is_active"]
    await db.subscriptions.insert_one({
        "subscription_id": sub_id, "candidate_id": candidate_id,
        "plan_id": plan["plan_id"], "plan_name": plan["name"],
        "start_date": base_start.isoformat(), "expiry_date": expiry.isoformat(),
        "status": "active", "is_demo": is_demo, "payment_id": payment_id,
        "is_renewal": renewal, "reminders_sent": [],
        "created_at": now_iso(), "updated_at": now_iso(),
    })
    return await compute_membership(candidate_id)


@api.post("/checkout/demo")
async def checkout_demo(req: CheckoutReq, user=Depends(get_current_user)):
    plan = await db.plans.find_one({"plan_id": req.plan_id, "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    order_id = f"order_demo_{uuid.uuid4().hex[:12]}"
    payment_id = f"pay_demo_{uuid.uuid4().hex[:12]}"
    payment = {
        "payment_id": payment_id, "order_id": order_id,
        "transaction_id": f"txn_demo_{uuid.uuid4().hex[:10]}", "gateway": "demo",
        "candidate_id": user["user_id"], "plan_id": plan["plan_id"], "plan_name": plan["name"],
        "amount": plan["price"], "currency": plan.get("currency", "INR"),
        "status": "successful", "payment_date": now_iso(),
        "gateway_response": {"demo": True, "message": "Simulated successful payment"},
        "webhook_status": "not_applicable", "is_demo": True, "subscription_id": None,
        "created_at": now_iso(),
    }
    await db.payments.insert_one(dict(payment))
    m = await _activate_subscription(user["user_id"], plan, True, payment_id)
    await db.payments.update_one({"payment_id": payment_id}, {"$set": {"subscription_id": m["subscription_id"]}})
    inner = (f'<p style="color:#374151;font-size:15px">Hi {escape(user.get("full_name") or "there")},</p>'
             f'<p style="color:#374151;font-size:15px">Your <strong>{escape(plan["name"])}</strong> membership is now active. '
             f'It is valid until <strong>{escape(m["expiry_date"][:10])}</strong>. '
             'You now have full access to curated job details and direct application links.</p>')
    await send_and_log_email(candidate_id=user["user_id"], to=user["email"], email_type="membership_activated",
                             subject="Your JobRadar membership is active",
                             html=_wrap_email("Membership activated", inner))
    return {"success": True, "membership": m, "payment": payment}


@api.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    m = await compute_membership(user["user_id"])
    saved = await db.saved_jobs.find({"candidate_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    saved_ids = [s["job_id"] for s in saved]
    saved_jobs_docs = await db.jobs.find({"job_id": {"$in": saved_ids}},
                                         {"_id": 0, "admin_notes": 0, "verification_score": 0}).to_list(20)
    smap = {j["job_id"]: j for j in saved_jobs_docs}
    recent = await db.jobs.find({"status": "Published"}, {"_id": 0, "admin_notes": 0, "verification_score": 0}).sort(
        "date_added", -1).limit(6).to_list(6)
    pref_inds = user.get("preferred_industries") or []
    if not pref_inds and user.get("industry"):
        pref_inds = [user.get("industry")]
    rec_query = {"status": "Published"}
    if pref_inds:
        rec_query["industry_category"] = {"$in": pref_inds}
    wm = user.get("preferred_work_mode")
    if wm and wm not in ("Any", "All"):
        rec_query["work_mode"] = wm
    recommended = await db.jobs.find(rec_query, {"_id": 0, "admin_notes": 0, "verification_score": 0}).sort(
        [("featured", -1), ("date_added", -1)]).limit(8).to_list(8)
    if not recommended and pref_inds:
        recommended = await db.jobs.find(
            {"status": "Published", "industry_category": {"$in": pref_inds}},
            {"_id": 0, "admin_notes": 0, "verification_score": 0}).limit(8).to_list(8)
    if not recommended:
        recommended = await db.jobs.find({"status": "Published"},
            {"_id": 0, "admin_notes": 0, "verification_score": 0}).sort("featured", -1).limit(6).to_list(6)
    payments = await db.payments.find({"candidate_id": user["user_id"]}, {"_id": 0}).sort("created_at", -1).to_list(20)
    return {
        "user": {"full_name": user.get("full_name"), "email": user.get("email"), "picture": user.get("picture")},
        "membership": m,
        "saved_jobs": [serialize_job(smap[i], m["is_active"], True) for i in saved_ids if i in smap],
        "recent_jobs": [serialize_job(j, m["is_active"]) for j in recent],
        "recommended_jobs": [serialize_job(j, m["is_active"]) for j in recommended],
        "payments": payments,
    }


@api.post("/contact")
async def contact(payload: dict):
    await db.contact_messages.insert_one({
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "name": payload.get("name"), "email": payload.get("email"),
        "message": payload.get("message"), "created_at": now_iso(), "status": "new"})
    return {"success": True, "message": "Thank you. Our team will get back to you soon."}


# ===========================================================================
# ADMIN ROUTES
# ===========================================================================
@api.get("/admin/dashboard")
async def admin_dashboard(admin=Depends(require_admin)):
    total_candidates = await db.users.count_documents({"role": "candidate"})
    all_subs = await db.subscriptions.find({}, {"_id": 0}).to_list(5000)
    candidates = await db.users.find({"role": "candidate"}, {"_id": 0, "user_id": 1}).to_list(5000)
    active = expired = 0
    for c in candidates:
        m = await compute_membership(c["user_id"])
        if m["is_active"]:
            active += 1
        elif m["status"] == "expired":
            expired += 1
    payments = await db.payments.find({}, {"_id": 0}).to_list(10000)
    real_success = [p for p in payments if p["status"] == "successful" and not p.get("is_demo")]
    demo_success = [p for p in payments if p["status"] == "successful" and p.get("is_demo")]
    real_revenue = sum(p["amount"] for p in real_success)
    demo_revenue = sum(p["amount"] for p in demo_success)
    now = now_utc()
    month_revenue = sum(p["amount"] for p in real_success
                        if (parse_dt(p.get("payment_date")) or now).month == now.month and
                        (parse_dt(p.get("payment_date")) or now).year == now.year)
    week_ago = now - timedelta(days=7)
    new_regs = await db.users.count_documents({"role": "candidate", "created_at": {"$gte": week_ago.isoformat()}})
    plan_counts: dict = {}
    for s in all_subs:
        plan_counts[s.get("plan_name", "?")] = plan_counts.get(s.get("plan_name", "?"), 0) + 1
    popular = max(plan_counts, key=plan_counts.get) if plan_counts else None
    jobs_published = await db.jobs.count_documents({"status": "Published"})
    jobs_week = await db.jobs.count_documents({"date_added": {"$gte": week_ago.isoformat()}})
    all_jobs = await db.jobs.find({}, {"_id": 0, "views": 1}).to_list(5000)
    total_views = sum(j.get("views", 0) for j in all_jobs)
    most_saved = await db.jobs.find({}, {"_id": 0, "title": 1, "company": 1, "saves": 1}).sort("saves", -1).limit(5).to_list(5)
    return {
        "total_candidates": total_candidates, "active_members": active, "expired_members": expired,
        "new_registrations_week": new_regs, "total_successful_payments": len(real_success) + len(demo_success),
        "real_revenue": real_revenue, "demo_revenue": demo_revenue, "monthly_revenue": month_revenue,
        "popular_plan": popular, "jobs_published": jobs_published, "jobs_added_week": jobs_week,
        "total_job_views": total_views, "most_saved_jobs": most_saved,
    }


@api.get("/admin/jobs")
async def admin_list_jobs(admin=Depends(require_admin), q: Optional[str] = None, status: Optional[str] = None,
                          industry_category: Optional[str] = None, region: Optional[str] = None,
                          country: Optional[str] = None):
    query: dict = {}
    if status and status != "All":
        query["status"] = status
    if industry_category and industry_category != "All":
        query["industry_category"] = industry_category
    if region and region != "All":
        query["region"] = region
    if country:
        query["country"] = {"$regex": re.escape(country), "$options": "i"}
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"title": rx}, {"company": rx}]
    jobs = await db.jobs.find(query, {"_id": 0}).sort("date_added", -1).to_list(500)
    return {"jobs": jobs}


@api.post("/admin/jobs")
async def admin_create_job(req: JobReq, admin=Depends(require_admin)):
    job = req.dict()
    job.update({
        "job_id": f"job_{uuid.uuid4().hex[:10]}", "date_added": now_iso(), "last_updated": now_iso(),
        "views": 0, "saves": 0, "apply_clicks": 0,
    })
    await db.jobs.insert_one(dict(job))
    job.pop("_id", None)
    return {"job": job}


@api.get("/admin/jobs/{job_id}")
async def admin_get_job(job_id: str, admin=Depends(require_admin)):
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job": job}


@api.put("/admin/jobs/{job_id}")
async def admin_update_job(job_id: str, req: JobReq, admin=Depends(require_admin)):
    updates = req.dict()
    updates["last_updated"] = now_iso()
    res = await db.jobs.update_one({"job_id": job_id}, {"$set": updates})
    if not res.matched_count:
        raise HTTPException(status_code=404, detail="Job not found")
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    return {"job": job}


@api.delete("/admin/jobs/{job_id}")
async def admin_delete_job(job_id: str, admin=Depends(require_admin)):
    await db.jobs.delete_one({"job_id": job_id})
    return {"success": True}


@api.post("/admin/jobs/{job_id}/status")
async def admin_job_status(job_id: str, payload: dict, admin=Depends(require_admin)):
    status = payload.get("status")
    if status not in ("Draft", "Published", "Unpublished", "Expired"):
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.jobs.update_one({"job_id": job_id}, {"$set": {"status": status, "last_updated": now_iso()}})
    return {"success": True}


@api.post("/admin/jobs/{job_id}/feature")
async def admin_feature_job(job_id: str, payload: dict, admin=Depends(require_admin)):
    await db.jobs.update_one({"job_id": job_id}, {"$set": {"featured": bool(payload.get("featured")), "last_updated": now_iso()}})
    return {"success": True}


@api.post("/admin/jobs/{job_id}/duplicate")
async def admin_duplicate_job(job_id: str, admin=Depends(require_admin)):
    job = await db.jobs.find_one({"job_id": job_id}, {"_id": 0})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.update({"job_id": f"job_{uuid.uuid4().hex[:10]}", "title": job["title"] + " (Copy)",
                "status": "Draft", "date_added": now_iso(), "last_updated": now_iso(),
                "views": 0, "saves": 0, "apply_clicks": 0})
    await db.jobs.insert_one(dict(job))
    job.pop("_id", None)
    return {"job": job}


@api.get("/admin/candidates")
async def admin_candidates(admin=Depends(require_admin), q: Optional[str] = None, industry: Optional[str] = None):
    query: dict = {"role": "candidate"}
    conds = []
    if industry and industry != "All":
        conds.append({"$or": [{"industry": industry}, {"preferred_industries": industry}]})
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        conds.append({"$or": [{"full_name": rx}, {"email": rx}, {"mobile": rx},
                              {"current_designation": rx}, {"preferred_designation": rx}, {"industry": rx}]})
    if conds:
        query["$and"] = conds
    users = await db.users.find(query, {"_id": 0, "password": 0}).sort("created_at", -1).to_list(1000)
    out = []
    for u in users:
        m = await compute_membership(u["user_id"])
        out.append({**u, "membership_status": m["status"], "is_active": m["is_active"],
                    "plan_name": m["plan_name"], "expiry_date": m["expiry_date"]})
    return {"candidates": out}


@api.get("/admin/candidates/{candidate_id}")
async def admin_candidate_detail(candidate_id: str, admin=Depends(require_admin)):
    u = await db.users.find_one({"user_id": candidate_id}, {"_id": 0, "password": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Candidate not found")
    m = await compute_membership(candidate_id)
    subs = await db.subscriptions.find({"candidate_id": candidate_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    payments = await db.payments.find({"candidate_id": candidate_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"candidate": u, "membership": m, "subscriptions": subs, "payments": payments}


@api.post("/admin/candidates/{candidate_id}/suspend")
async def admin_suspend(candidate_id: str, payload: dict, admin=Depends(require_admin)):
    await db.users.update_one({"user_id": candidate_id}, {"$set": {"suspended": bool(payload.get("suspended")), "updated_at": now_iso()}})
    return {"success": True}


@api.post("/admin/candidates/{candidate_id}/extend")
async def admin_extend(candidate_id: str, payload: dict, admin=Depends(require_admin)):
    days = int(payload.get("days", 30))
    sub = await db.subscriptions.find_one({"candidate_id": candidate_id}, {"_id": 0}, sort=[("created_at", -1)])
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription to extend")
    expiry = parse_dt(sub.get("expiry_date")) or now_utc()
    if expiry < now_utc():
        expiry = now_utc()
    new_expiry = expiry + timedelta(days=days)
    await db.subscriptions.update_one({"subscription_id": sub["subscription_id"]},
                                      {"$set": {"expiry_date": new_expiry.isoformat(), "status": "active", "updated_at": now_iso()}})
    return {"success": True, "membership": await compute_membership(candidate_id)}


@api.get("/admin/subscriptions")
async def admin_subscriptions(admin=Depends(require_admin), status: Optional[str] = None):
    subs = await db.subscriptions.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    out = []
    for s in subs:
        m = await compute_membership(s["candidate_id"])
        u = await db.users.find_one({"user_id": s["candidate_id"]}, {"_id": 0, "full_name": 1, "email": 1})
        eff = m["status"] if m["subscription_id"] == s["subscription_id"] else s["status"]
        if status and status != "All" and eff != status:
            continue
        out.append({**s, "effective_status": eff, "candidate_name": (u or {}).get("full_name"),
                    "candidate_email": (u or {}).get("email")})
    return {"subscriptions": out}


@api.post("/admin/subscriptions/{subscription_id}/cancel")
async def admin_cancel_sub(subscription_id: str, admin=Depends(require_admin)):
    await db.subscriptions.update_one({"subscription_id": subscription_id},
                                      {"$set": {"status": "cancelled", "updated_at": now_iso()}})
    return {"success": True}


@api.get("/admin/payments")
async def admin_payments(admin=Depends(require_admin), status: Optional[str] = None, demo: Optional[str] = None):
    query: dict = {}
    if status and status != "All":
        query["status"] = status
    if demo == "real":
        query["is_demo"] = False
    elif demo == "demo":
        query["is_demo"] = True
    payments = await db.payments.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    for p in payments:
        u = await db.users.find_one({"user_id": p["candidate_id"]}, {"_id": 0, "full_name": 1, "email": 1})
        p["candidate_name"] = (u or {}).get("full_name")
        p["candidate_email"] = (u or {}).get("email")
    return {"payments": payments}


@api.get("/admin/emails")
async def admin_emails(admin=Depends(require_admin)):
    logs = await db.email_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return {"emails": logs}


@api.post("/admin/announcement")
async def admin_announcement(req: AnnouncementReq, admin=Depends(require_admin)):
    candidates = await db.users.find({"role": "candidate", "suspended": {"$ne": True}},
                                     {"_id": 0, "user_id": 1, "email": 1, "full_name": 1}).to_list(2000)
    sent = 0
    inner = f'<p style="color:#374151;font-size:15px">{escape(req.message)}</p>'
    html = _wrap_email(req.subject, inner)
    for c in candidates:
        if c.get("email"):
            await send_and_log_email(candidate_id=c["user_id"], to=c["email"], email_type="announcement",
                                     subject=req.subject, html=html)
            sent += 1
    return {"success": True, "sent": sent}


@api.get("/admin/plans")
async def admin_plans(admin=Depends(require_admin)):
    plans = await db.plans.find({}, {"_id": 0}).sort("duration_days", 1).to_list(50)
    return {"plans": plans}


@api.post("/admin/plans")
async def admin_create_plan(req: PlanReq, admin=Depends(require_admin)):
    plan = req.dict()
    plan["plan_id"] = f"plan_{uuid.uuid4().hex[:8]}"
    plan["created_at"] = now_iso()
    plan["updated_at"] = now_iso()
    await db.plans.insert_one(dict(plan))
    plan.pop("_id", None)
    return {"plan": plan}


@api.put("/admin/plans/{plan_id}")
async def admin_update_plan(plan_id: str, req: PlanReq, admin=Depends(require_admin)):
    updates = req.dict()
    updates["updated_at"] = now_iso()
    await db.plans.update_one({"plan_id": plan_id}, {"$set": updates})
    plan = await db.plans.find_one({"plan_id": plan_id}, {"_id": 0})
    return {"plan": plan}


# ===========================================================================
# DEVELOPER / DEMO TEST PANEL
# ===========================================================================
async def _send_reminder(candidate_id: str, days: int):
    u = await db.users.find_one({"user_id": candidate_id}, {"_id": 0})
    sub = await db.subscriptions.find_one({"candidate_id": candidate_id}, {"_id": 0}, sort=[("created_at", -1)])
    if not u or not sub:
        return False
    key = f"reminder_{days}"
    reminders = sub.get("reminders_sent", [])
    if key in reminders:
        return False  # idempotent — avoid duplicate reminder for same period
    label = "tomorrow" if days == 1 else f"in {days} days"
    inner = (f'<p style="color:#374151;font-size:15px">Hi {escape(u.get("full_name") or "there")},</p>'
             f'<p style="color:#374151;font-size:15px">Your JobRadar membership expires <strong>{label}</strong>. '
             'Renew now to keep uninterrupted access to curated job opportunities.</p>')
    await send_and_log_email(candidate_id=candidate_id, to=u["email"], email_type=f"expiry_reminder_{days}d",
                             subject=f"Your JobRadar membership expires {label}",
                             html=_wrap_email("Membership expiring soon", inner))
    await db.subscriptions.update_one({"subscription_id": sub["subscription_id"]},
                                      {"$addToSet": {"reminders_sent": key}})
    return True


@api.post("/admin/dev/action")
async def dev_action(req: DevActionReq, admin=Depends(require_admin)):
    cid = req.candidate_id
    action = req.action
    user = await db.users.find_one({"user_id": cid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Candidate not found")

    async def _demo_payment(plan, status="successful"):
        pid = f"pay_demo_{uuid.uuid4().hex[:12]}"
        await db.payments.insert_one({
            "payment_id": pid, "order_id": f"order_demo_{uuid.uuid4().hex[:10]}",
            "transaction_id": f"txn_demo_{uuid.uuid4().hex[:10]}", "gateway": "demo",
            "candidate_id": cid, "plan_id": plan["plan_id"], "plan_name": plan["name"],
            "amount": plan["price"], "currency": plan.get("currency", "INR"), "status": status,
            "payment_date": now_iso(), "gateway_response": {"demo": True}, "webhook_status": "not_applicable",
            "is_demo": True, "subscription_id": None, "created_at": now_iso()})
        return pid

    async def _get_plan_by_days(days):
        return await db.plans.find_one({"duration_days": days}, {"_id": 0}) or \
               await db.plans.find_one({"active": True}, {"_id": 0})

    if action in ("activate_90", "activate_180", "activate_365"):
        days = {"activate_90": 90, "activate_180": 180, "activate_365": 365}[action]
        plan = await _get_plan_by_days(days)
        pid = await _demo_payment(plan)
        m = await _activate_subscription(cid, plan, True, pid)
        await db.payments.update_one({"payment_id": pid}, {"$set": {"subscription_id": m["subscription_id"]}})
        return {"success": True, "message": f"Activated {days}-day plan", "membership": m}

    if action == "simulate_renewal":
        m = await compute_membership(cid)
        plan = await db.plans.find_one({"plan_id": m.get("plan_id")}, {"_id": 0}) if m.get("plan_id") else None
        if not plan:
            plan = await _get_plan_by_days(90)
        pid = await _demo_payment(plan)
        m2 = await _activate_subscription(cid, plan, True, pid)
        await db.payments.update_one({"payment_id": pid}, {"$set": {"subscription_id": m2["subscription_id"]}})
        u = await db.users.find_one({"user_id": cid}, {"_id": 0})
        inner = ('<p style="color:#374151;font-size:15px">Your JobRadar membership has been renewed successfully. '
                 f'New expiry: <strong>{escape(m2["expiry_date"][:10])}</strong>.</p>')
        await send_and_log_email(candidate_id=cid, to=u["email"], email_type="renewal_success",
                                 subject="Membership renewed", html=_wrap_email("Membership renewed", inner))
        return {"success": True, "message": "Renewal simulated", "membership": m2}

    if action == "simulate_failed_payment":
        plan = await _get_plan_by_days(90)
        await _demo_payment(plan, status="failed")
        await db.subscriptions.insert_one({
            "subscription_id": f"sub_{uuid.uuid4().hex[:12]}", "candidate_id": cid,
            "plan_id": plan["plan_id"], "plan_name": plan["name"], "start_date": None,
            "expiry_date": None, "status": "payment_failed", "is_demo": True, "reminders_sent": [],
            "created_at": now_iso(), "updated_at": now_iso()})
        u = await db.users.find_one({"user_id": cid}, {"_id": 0})
        inner = '<p style="color:#374151;font-size:15px">Your recent payment attempt for JobRadar could not be completed. Please try again.</p>'
        await send_and_log_email(candidate_id=cid, to=u["email"], email_type="payment_failed",
                                 subject="Payment failed", html=_wrap_email("Payment failed", inner))
        return {"success": True, "message": "Failed payment simulated"}

    sub = await db.subscriptions.find_one({"candidate_id": cid}, {"_id": 0}, sort=[("created_at", -1)])

    if action in ("expire_now", "expiry_7", "expiry_3", "expiry_1"):
        if not sub:
            raise HTTPException(status_code=400, detail="No subscription — activate a plan first")
        if action == "expire_now":
            new_exp = now_utc() - timedelta(days=1)
        else:
            d = {"expiry_7": 7, "expiry_3": 3, "expiry_1": 1}[action]
            new_exp = now_utc() + timedelta(days=d)
        await db.subscriptions.update_one({"subscription_id": sub["subscription_id"]},
                                          {"$set": {"expiry_date": new_exp.isoformat(), "status": "active",
                                                    "updated_at": now_iso(), "reminders_sent": []}})
        m = await compute_membership(cid)
        if action == "expire_now":
            u = await db.users.find_one({"user_id": cid}, {"_id": 0})
            inner = '<p style="color:#374151;font-size:15px">Your JobRadar membership has expired. Renew now to restore full access.</p>'
            await send_and_log_email(candidate_id=cid, to=u["email"], email_type="membership_expired",
                                     subject="Your membership has expired", html=_wrap_email("Membership expired", inner))
        return {"success": True, "message": f"Applied {action}", "membership": m}

    if action in ("reminder_7", "reminder_3", "reminder_1"):
        days = {"reminder_7": 7, "reminder_3": 3, "reminder_1": 1}[action]
        ok = await _send_reminder(cid, days)
        return {"success": True, "message": ("Reminder sent" if ok else "Reminder already sent or no subscription")}

    if action == "reset_account":
        await db.subscriptions.delete_many({"candidate_id": cid})
        await db.payments.delete_many({"candidate_id": cid})
        return {"success": True, "message": "Test account reset (subscriptions & payments cleared)"}

    if action == "delete_subscription":
        if sub:
            await db.subscriptions.delete_one({"subscription_id": sub["subscription_id"]})
        return {"success": True, "message": "Latest subscription deleted"}

    raise HTTPException(status_code=400, detail=f"Unknown action: {action}")


@api.get("/admin/dev/candidates")
async def dev_candidates(admin=Depends(require_admin)):
    users = await db.users.find({"role": "candidate"}, {"_id": 0, "user_id": 1, "full_name": 1, "email": 1}).sort("created_at", -1).to_list(1000)
    out = []
    for u in users:
        m = await compute_membership(u["user_id"])
        out.append({**u, "status": m["status"], "expiry_date": m["expiry_date"], "days_remaining": m["days_remaining"]})
    return {"candidates": out}


# ===========================================================================
# SEED DATA
# ===========================================================================
SAMPLE_JOBS = [
    ("HR Recruiter", "TechNova Solutions", "HR & Recruitment", "Talent Acquisition", "IT Services",
     "Bengaluru", "2-4 years", "Rs 4-6 LPA", "Hybrid"),
    ("Talent Acquisition Specialist", "PeopleFirst Consulting", "HR & Recruitment", "Recruitment", "Consulting",
     "Mumbai", "3-6 years", "Rs 6-9 LPA", "Work From Office"),
    ("Finance Manager", "Meridian Capital", "Finance & Accounting", "Corporate Finance", "Financial Services",
     "Gurugram", "6-10 years", "Rs 15-22 LPA", "Work From Office"),
    ("Senior Accountant", "Larsen Industries", "Finance & Accounting", "Accounting", "Manufacturing",
     "Pune", "4-7 years", "Rs 8-12 LPA", "Hybrid"),
    ("Operations Manager", "SwiftLogix", "Operations & Customer Experience", "Operations", "Logistics",
     "Chennai", "5-9 years", "Rs 10-16 LPA", "Work From Office"),
    ("Customer Experience Manager", "Delight Retail", "Operations & Customer Experience", "CX", "Retail",
     "Hyderabad", "4-8 years", "Rs 9-14 LPA", "Hybrid"),
    ("Travel Consultant", "WanderWell Holidays", "Travel & Hospitality", "Travel", "Hospitality",
     "New Delhi", "1-3 years", "Rs 3-5 LPA", "Work From Office"),
    ("Business Development Manager", "GrowthArc", "Sales & Business Development", "B2B Sales", "SaaS",
     "Remote", "3-7 years", "Rs 8-15 LPA", "Remote"),
    ("Data Analyst", "InsightIQ", "IT & Technology", "Analytics", "Technology",
     "Bengaluru", "2-5 years", "Rs 7-12 LPA", "Hybrid"),
    ("Payroll Specialist", "PayEdge Services", "Other Professional Roles", "Payroll", "BPO",
     "Noida", "2-4 years", "Rs 4-7 LPA", "Work From Office"),
]


INTL_JOBS = [
    ("Senior Travel Consultant", "Emirates Holidays", "Travel & Hospitality", "Travel", "Hospitality",
     "Dubai", "UAE", "AED", "AED 8,000-12,000/mo", "Hybrid", "Visa sponsorship available for eligible candidates."),
    ("IT Support Engineer", "NorthBridge Tech", "IT & Technology", "IT Support", "Technology",
     "London", "United Kingdom", "GBP", "GBP 32,000-40,000", "Work From Office", "Requires valid UK work authorization; Skilled Worker visa considered."),
    ("Finance Analyst", "Summit Capital", "Finance & Accounting", "FP&A", "Financial Services",
     "Singapore", "Singapore", "SGD", "SGD 60,000-80,000", "Hybrid", "Employment Pass (EP) sponsorship for strong candidates."),
]


async def _seed_international_jobs():
    if await db.jobs.count_documents({"region": "International"}) > 0:
        return
    for i, (title, company, cat, sub, ind, city, country, cur, sal, mode, visa) in enumerate(INTL_JOBS):
        await db.jobs.insert_one({
            "job_id": f"job_{uuid.uuid4().hex[:10]}", "title": title, "company": company,
            "function": cat, "industry_category": cat, "sub_function": sub, "industry": ind,
            "designation": title, "region": "International", "location": city, "city": city,
            "country": country, "currency": cur, "work_mode": mode, "experience_required": "3-7 years",
            "salary_range": sal, "visa_info": visa, "employment_type": "Full-time",
            "description": (f"{company} is hiring a {title} in {city}, {country}. A curated international "
                            "opportunity for professionals open to global roles. Apply directly via the employer link."),
            "key_responsibilities": ("Deliver on core responsibilities for the role.\n"
                                     "Collaborate across global teams.\nMeet quality and compliance standards."),
            "required_skills": "Communication, Domain expertise, Cross-cultural collaboration",
            "preferred_skills": "International experience, Relevant certifications",
            "recruiter_name": "Global Talent Team", "recruiter_email": "careers@example.com",
            "application_link": "https://www.linkedin.com/jobs/", "source_link": "https://www.linkedin.com/jobs/",
            "application_deadline": (now_utc() + timedelta(days=45)).isoformat(),
            "status": "Published", "featured": i == 0, "verification_score": 80,
            "admin_notes": "Sample international demo job.", "company_logo": "",
            "date_added": now_iso(), "last_updated": now_iso(), "views": 0, "saves": 0, "apply_clicks": 0})
    logger.info("Seeded international demo jobs")


async def seed():
    # --- idempotent, non-destructive migrations for existing data ---
    await db.plans.update_many({"duration_days": 180}, {"$set": {"price": 799}})
    await db.plans.update_many({"duration_days": 365}, {"$set": {"price": 999}})
    await db.plans.update_many({"duration_days": 90}, {"$set": {"price": 599}})
    await db.jobs.update_many({"region": {"$exists": False}}, {"$set": {"region": "India"}})
    await db.jobs.update_many({"currency": {"$exists": False}}, {"$set": {"currency": "INR"}})
    try:
        await db.jobs.update_many({"$or": [{"city": {"$exists": False}}, {"city": ""}]},
                                  [{"$set": {"city": "$location"}}])
    except Exception as e:
        logger.warning(f"city backfill: {e}")
    _cat_map = {
        "HR & Recruitment": "HR & Recruitment",
        "Finance & Accounting": "Finance & Accounting",
        "IT & Technology": "IT & Technology",
        "Travel & Hospitality": "Travel & Hospitality",
        "Operations & Customer Experience": "BPO / Customer Experience",
    }
    for _src, _dst in _cat_map.items():
        await db.jobs.update_many({"function": _src, "industry_category": {"$exists": False}},
                                  {"$set": {"industry_category": _dst}})
    await db.jobs.update_many({"industry_category": {"$exists": False}}, {"$set": {"industry_category": "Other"}})
    await _seed_international_jobs()

    if await db.plans.count_documents({}) == 0:
        base_plans = [
            {"name": "Quarterly Plan", "price": 599, "duration_days": 90, "featured": True,
             "tagline": "Recommended starter"},
            {"name": "Half-Yearly Plan", "price": 799, "duration_days": 180, "featured": False,
             "tagline": "Great value"},
            {"name": "Annual Plan", "price": 999, "duration_days": 365, "featured": False,
             "tagline": "Best long-term value"},
        ]
        for p in base_plans:
            await db.plans.insert_one({
                "plan_id": f"plan_{uuid.uuid4().hex[:8]}", "currency": "INR", "active": True,
                "created_at": now_iso(), "updated_at": now_iso(), **p})
        logger.info("Seeded plans")

    if await db.jobs.count_documents({}) == 0:
        for i, (title, company, func, sub, ind, loc, exp, sal, mode) in enumerate(SAMPLE_JOBS):
            await db.jobs.insert_one({
                "job_id": f"job_{uuid.uuid4().hex[:10]}", "title": title, "company": company,
                "function": func, "sub_function": sub, "industry": ind, "location": loc, "country": "India",
                "industry_category": _cat_map.get(func, "Other"), "designation": title,
                "region": "India", "city": loc, "currency": "INR", "visa_info": "",
                "work_mode": mode, "experience_required": exp, "salary_range": sal,
                "employment_type": "Full-time",
                "description": (f"{company} is seeking a {title} to join a high-performing team. "
                                f"This is a curated opportunity in the {func} function. You will drive impactful "
                                "outcomes, collaborate cross-functionally, and grow your career with a market leader. "
                                "This role offers strong ownership and visibility across the organisation."),
                "key_responsibilities": ("Own end-to-end delivery for your function.\n"
                                         "Collaborate with stakeholders across teams.\n"
                                         "Track and report key performance metrics.\n"
                                         "Continuously improve processes and outcomes."),
                "required_skills": "Communication, Ownership, Analytical thinking, Stakeholder management",
                "preferred_skills": "MS Excel, Domain certifications, Team leadership",
                "recruiter_name": "Priya Sharma", "recruiter_email": "careers@example.com",
                "application_link": "https://www.linkedin.com/jobs/", "source_link": "https://www.linkedin.com/jobs/",
                "application_deadline": (now_utc() + timedelta(days=30)).isoformat(),
                "status": "Published", "featured": i < 3, "verification_score": 85,
                "admin_notes": "Sample/demo job for testing.", "company_logo": "",
                "date_added": (now_utc() - timedelta(days=i)).isoformat(), "last_updated": now_iso(),
                "views": 0, "saves": 0, "apply_clicks": 0})
        logger.info("Seeded sample jobs")

    admin_email = "admin@eevolvex.com"
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}", "email": admin_email,
            "full_name": "Evolveminds Admin", "mobile": None, "password": hash_pw("Admin@12345"),
            "role": "admin", "auth_provider": "password", "picture": None, "consent": True,
            "suspended": False, "created_at": now_iso(), "updated_at": now_iso(), "status": "active"})
        logger.info("Seeded admin user")

    test_email = "test@jobradar.com"
    if not await db.users.find_one({"email": test_email}):
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}", "email": test_email,
            "full_name": "Test Candidate", "mobile": "9999999999", "password": hash_pw("Test@12345"),
            "role": "candidate", "auth_provider": "password", "picture": None,
            "preferred_function": "IT & Technology", "preferred_location": "Bengaluru",
            "preferred_experience": "2-5 years", "industry": "IT & Technology",
            "current_designation": "Software Engineer", "current_salary": "12 LPA",
            "preferred_industries": ["IT & Technology"], "preferred_designation": "Senior Software Engineer",
            "preferred_work_mode": "Hybrid", "consent": True, "suspended": False,
            "created_at": now_iso(), "updated_at": now_iso(), "status": "active"})
        logger.info("Seeded test candidate")


@app.on_event("startup")
async def startup():
    try:
        await db.users.create_index("email", unique=True)
        await db.users.create_index("user_id", unique=True)
        await db.user_sessions.create_index("session_token", unique=True)
        await db.jobs.create_index("job_id", unique=True)
    except Exception as e:
        logger.warning(f"Index creation: {e}")
    await seed()
    logger.info("JobRadar backend ready")


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"message": "JobRadar by Evolveminds API", "status": "ok"}


from career import build_router as _build_career_router  # noqa: E402

api.include_router(_build_career_router(db, get_current_user, require_admin, compute_membership,
                                        now_utc, now_iso, parse_dt))
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
