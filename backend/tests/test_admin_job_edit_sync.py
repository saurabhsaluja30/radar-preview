# Admin job edit -> public job API sync (bug: admin edits not visible to candidates)
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
JOB_ID = "job_b3d222d1a8"
ADMIN = {"email": "admin@eevolvex.com", "password": "Admin@12345"}


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login", json=ADMIN, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    tok = r.json().get("token") or r.json().get("access_token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def original_job(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/jobs/{JOB_ID}", headers=admin_headers, timeout=20)
    assert r.status_code == 200
    job = r.json()["job"]
    yield job
    # restore with sensible salary
    restore = dict(job)
    if "TESTSAL" in str(restore.get("salary_range", "")) or "TEST_" in str(restore.get("salary_range", "")):
        restore["salary_range"] = "₹6–9 LPA"
    for k in ("title", "description", "city"):
        restore[k] = str(restore.get(k, "")).replace("TEST_SYNC ", "")
    requests.put(f"{BASE_URL}/api/admin/jobs/{JOB_ID}", json=restore, headers=admin_headers, timeout=20)


# Admin PUT -> public list/detail reflect immediately
class TestAdminEditSync:
    def test_put_then_public_get(self, admin_headers, original_job):
        body = dict(original_job)
        body["title"] = "TEST_SYNC " + original_job["title"]
        body["salary_range"] = "TEST_ 11 LPA"
        body["city"] = "TEST_SYNC " + (original_job.get("city") or "")
        body["description"] = "TEST_SYNC " + (original_job.get("description") or "")
        r = requests.put(f"{BASE_URL}/api/admin/jobs/{JOB_ID}", json=body, headers=admin_headers, timeout=20)
        assert r.status_code == 200
        assert r.json()["job"]["title"] == body["title"]

        d = requests.get(f"{BASE_URL}/api/jobs/{JOB_ID}", timeout=20)
        assert d.status_code == 200
        pj = d.json()["job"]
        assert pj["title"] == body["title"]
        assert pj.get("city") == body["city"]

        lst = requests.get(f"{BASE_URL}/api/jobs", params={"q": "TEST_SYNC", "limit": 60}, timeout=20)
        assert lst.status_code == 200
        assert any(j["job_id"] == JOB_ID and j["title"] == body["title"] for j in lst.json()["jobs"])

    def test_put_404(self, admin_headers, original_job):
        r = requests.put(f"{BASE_URL}/api/admin/jobs/job_nonexist000", json=original_job, headers=admin_headers, timeout=20)
        assert r.status_code == 404

    def test_put_requires_admin(self, original_job):
        r = requests.put(f"{BASE_URL}/api/admin/jobs/{JOB_ID}", json=original_job, timeout=20)
        assert r.status_code in (401, 403)

    def test_unpublish_hides_and_publish_restores(self, admin_headers, original_job):
        r = requests.post(f"{BASE_URL}/api/admin/jobs/{JOB_ID}/status", json={"status": "Unpublished"}, headers=admin_headers, timeout=20)
        assert r.status_code == 200
        lst = requests.get(f"{BASE_URL}/api/jobs", params={"limit": 500}, timeout=20).json()["jobs"]
        assert all(j["job_id"] != JOB_ID for j in lst)
        r = requests.post(f"{BASE_URL}/api/admin/jobs/{JOB_ID}/status", json={"status": original_job.get("status", "Published")}, headers=admin_headers, timeout=20)
        assert r.status_code == 200
        lst = requests.get(f"{BASE_URL}/api/jobs", params={"limit": 500}, timeout=20).json()["jobs"]
        assert any(j["job_id"] == JOB_ID for j in lst)

    def test_feature_toggle(self, admin_headers, original_job):
        orig = bool(original_job.get("featured"))
        r = requests.post(f"{BASE_URL}/api/admin/jobs/{JOB_ID}/feature", json={"featured": not orig}, headers=admin_headers, timeout=20)
        assert r.status_code == 200
        pj = requests.get(f"{BASE_URL}/api/jobs/{JOB_ID}", timeout=20).json()["job"]
        assert bool(pj.get("featured")) == (not orig)
        requests.post(f"{BASE_URL}/api/admin/jobs/{JOB_ID}/feature", json={"featured": orig}, headers=admin_headers, timeout=20)
