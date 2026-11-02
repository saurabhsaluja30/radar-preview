# Plans-hidden launch offer regression tests (iteration 9)
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@eevolvex.com", "password": "Admin@12345"}
RESTORE = {"enabled": True, "plans_hidden": True, "free_spots": 100, "free_days": 90}
CREATED = []


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login", json=ADMIN)
    if r.status_code != 200:
        pytest.skip("admin login failed")
    h = {"Authorization": f"Bearer {r.json()['token']}"}
    # ensure baseline
    requests.put(f"{BASE_URL}/api/admin/launch-offer", json=RESTORE, headers=h)
    yield h
    requests.put(f"{BASE_URL}/api/admin/launch-offer", json=RESTORE, headers=h)
    print("CREATED_EMAILS:", CREATED)


def _register():
    email = f"test_iter9_{uuid.uuid4().hex[:6]}@example.com"
    CREATED.append(email)
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "full_name": "TEST Iter9", "email": email, "mobile": "9876543210",
        "password": "Test@12345", "confirm_password": "Test@12345", "consent": True,
        "preferred_function": "IT & Technology", "preferred_location": "Bengaluru",
        "preferred_experience": "0-2 years", "industry": "IT & Technology",
        "current_designation": "Engineer", "current_salary": "5 LPA",
        "preferred_work_mode": "Remote"})
    return r


# Public launch-offer + plans endpoints while hidden
class TestPlansHidden:
    def test_launch_offer_public(self, admin_h):
        d = requests.get(f"{BASE_URL}/api/launch-offer").json()
        assert d["enabled"] is True and d["plans_hidden"] is True
        assert d["spots_total"] == 100 and d["free_days"] == 90
        assert isinstance(d["spots_left"], int)

    def test_plans_empty(self, admin_h):
        d = requests.get(f"{BASE_URL}/api/plans").json()
        assert d == {"plans": [], "plans_hidden": True}

    def test_admin_plans_still_listed(self, admin_h):
        r = requests.get(f"{BASE_URL}/api/admin/plans", headers=admin_h)
        assert r.status_code == 200
        plans = r.json().get("plans", r.json())
        assert len(plans) >= 3
        assert any(p.get("price") for p in plans)


# Fresh candidate registration -> free access, membership plans [] and checkout 400
class TestRegisterFree:
    def test_register_membership_checkout(self, admin_h):
        r = _register()
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        assert r.json()["user"]["launch_offer"] == "granted"
        h = {"Authorization": f"Bearer {tok}"}
        m = requests.get(f"{BASE_URL}/api/membership", headers=h)
        assert m.status_code == 200
        md = m.json()
        assert md["plans"] == []
        assert md["membership"]["is_active"] is True
        assert "Launch Offer" in md["membership"]["plan_name"]
        assert md["membership"]["days_remaining"] in (89, 90)
        c = requests.post(f"{BASE_URL}/api/checkout/demo", json={"plan_id": "plan_quarterly"}, headers=h)
        assert c.status_code == 400
        assert "not available" in c.json()["detail"]


# Toggle plans_hidden=false -> plans visible, then restore
class TestToggle:
    def test_toggle_and_restore(self, admin_h):
        off = dict(RESTORE, plans_hidden=False)
        r = requests.put(f"{BASE_URL}/api/admin/launch-offer", json=off, headers=admin_h)
        assert r.status_code == 200 and r.json()["settings"]["plans_hidden"] is False
        d = requests.get(f"{BASE_URL}/api/plans").json()
        assert d["plans_hidden"] is False and len(d["plans"]) >= 3
        prices = sorted(p["price"] for p in d["plans"])
        print("PRICES:", prices)
        r2 = requests.put(f"{BASE_URL}/api/admin/launch-offer", json=RESTORE, headers=admin_h)
        assert r2.json()["settings"]["plans_hidden"] is True
        assert requests.get(f"{BASE_URL}/api/plans").json()["plans"] == []

    def test_put_requires_admin(self):
        r = requests.put(f"{BASE_URL}/api/admin/launch-offer", json=RESTORE)
        assert r.status_code in (401, 403)
