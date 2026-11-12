# Iteration 11: admin job edit/publish/feature/delete -> candidate-facing /api/jobs sync (member + anonymous)
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@eevolvex.com", "password": "Admin@12345"}
CAND = {"email": "test@jobradar.com", "password": "Test@12345"}


def _tok(r):
    j = r.json()
    return j.get("token") or j.get("access_token") or j.get("session_token")


@pytest.fixture(scope="module")
def admin_h():
    r = requests.post(f"{BASE_URL}/api/auth/admin/login", json=ADMIN, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code}")
    return {"Authorization": f"Bearer {_tok(r)}"}


@pytest.fixture(scope="module")
def cand_h():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=CAND, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"candidate login failed {r.status_code}")
    return {"Authorization": f"Bearer {_tok(r)}"}


@pytest.fixture(scope="module")
def target(admin_h):
    jobs = requests.get(f"{BASE_URL}/api/admin/jobs", params={"status": "Published"}, headers=admin_h, timeout=20).json()["jobs"]
    assert jobs, "no published jobs"
    job_id = jobs[-1]["job_id"]
    orig = requests.get(f"{BASE_URL}/api/admin/jobs/{job_id}", headers=admin_h, timeout=20).json()["job"]
    yield orig
    # exact restore of original snapshot
    r = requests.put(f"{BASE_URL}/api/admin/jobs/{job_id}", json=orig, headers=admin_h, timeout=20)
    assert r.status_code == 200
    requests.post(f"{BASE_URL}/api/admin/jobs/{job_id}/status", json={"status": orig["status"]}, headers=admin_h, timeout=20)
    requests.post(f"{BASE_URL}/api/admin/jobs/{job_id}/feature", json={"featured": orig.get("featured", False)}, headers=admin_h, timeout=20)


class TestAdminEditSync:
    # PUT full job -> member sees new title/salary/description on list + detail
    def test_put_reflects_for_member(self, admin_h, cand_h, target):
        jid = target["job_id"]
        body = dict(target)
        body.update(title="TEST_IT11 " + target["title"], salary_range="TEST_IT11 99 LPA",
                    description="TEST_IT11 desc " + (target.get("description") or ""))
        r = requests.put(f"{BASE_URL}/api/admin/jobs/{jid}", json=body, headers=admin_h, timeout=20)
        assert r.status_code == 200
        saved = r.json()["job"]
        assert saved["title"] == body["title"] and saved["salary_range"] == body["salary_range"]
        assert saved["date_added"] == target["date_added"]  # unchanged
        assert "_id" not in saved

        d = requests.get(f"{BASE_URL}/api/jobs/{jid}", headers=cand_h, timeout=20)
        assert d.status_code == 200
        pj = d.json()["job"]
        print("member?", d.json().get("is_member"))
        assert pj["title"] == body["title"]
        assert pj["description"].startswith("TEST_IT11 desc")
        if d.json().get("is_member"):
            assert pj.get("salary_range") == body["salary_range"]
        assert "admin_notes" not in pj

        lst = requests.get(f"{BASE_URL}/api/jobs", params={"q": "TEST_IT11", "limit": 50}, headers=cand_h, timeout=20)
        assert lst.status_code == 200
        hit = [j for j in lst.json()["jobs"] if j["job_id"] == jid]
        assert hit and hit[0]["title"] == body["title"]

    # Restore -> member sees original again
    def test_restore_reflects(self, admin_h, cand_h, target):
        jid = target["job_id"]
        r = requests.put(f"{BASE_URL}/api/admin/jobs/{jid}", json=target, headers=admin_h, timeout=20)
        assert r.status_code == 200
        pj = requests.get(f"{BASE_URL}/api/jobs/{jid}", headers=cand_h, timeout=20).json()["job"]
        assert pj["title"] == target["title"]

    # Unpublish hides from list + detail 404; publish restores
    def test_unpublish_publish(self, admin_h, cand_h, target):
        jid = target["job_id"]
        assert requests.post(f"{BASE_URL}/api/admin/jobs/{jid}/status", json={"status": "Unpublished"}, headers=admin_h, timeout=20).status_code == 200
        ids = [j["job_id"] for j in requests.get(f"{BASE_URL}/api/jobs", params={"limit": 100}, headers=cand_h, timeout=20).json()["jobs"]]
        assert jid not in ids
        assert requests.get(f"{BASE_URL}/api/jobs/{jid}", headers=cand_h, timeout=20).status_code == 404
        assert requests.post(f"{BASE_URL}/api/admin/jobs/{jid}/status", json={"status": "Published"}, headers=admin_h, timeout=20).status_code == 200
        assert requests.get(f"{BASE_URL}/api/jobs/{jid}", headers=cand_h, timeout=20).status_code == 200

    # Feature toggle reflects in featured filter
    def test_feature_toggle(self, admin_h, cand_h, target):
        jid = target["job_id"]
        orig = bool(target.get("featured"))
        requests.post(f"{BASE_URL}/api/admin/jobs/{jid}/feature", json={"featured": not orig}, headers=admin_h, timeout=20)
        ids = [j["job_id"] for j in requests.get(f"{BASE_URL}/api/jobs", params={"featured": "true", "limit": 100}, headers=cand_h, timeout=20).json()["jobs"]]
        assert (jid in ids) == (not orig)
        requests.post(f"{BASE_URL}/api/admin/jobs/{jid}/feature", json={"featured": orig}, headers=admin_h, timeout=20)

    # Invalid status -> 400; PUT unknown -> 404; PUT without auth -> 401/403
    def test_errors(self, admin_h, target):
        assert requests.post(f"{BASE_URL}/api/admin/jobs/{target['job_id']}/status", json={"status": "Bogus"}, headers=admin_h, timeout=20).status_code == 400
        assert requests.put(f"{BASE_URL}/api/admin/jobs/job_nonexist000", json=target, headers=admin_h, timeout=20).status_code == 404
        assert requests.put(f"{BASE_URL}/api/admin/jobs/{target['job_id']}", json=target, timeout=20).status_code in (401, 403)

    # Missing-job status/feature/delete -> should be 404 (reports current behavior)
    def test_missing_job_actions(self, admin_h):
        codes = {
            "status": requests.post(f"{BASE_URL}/api/admin/jobs/job_nonexist000/status", json={"status": "Published"}, headers=admin_h, timeout=20).status_code,
            "feature": requests.post(f"{BASE_URL}/api/admin/jobs/job_nonexist000/feature", json={"featured": True}, headers=admin_h, timeout=20).status_code,
            "delete": requests.delete(f"{BASE_URL}/api/admin/jobs/job_nonexist000", headers=admin_h, timeout=20).status_code,
        }
        print("missing-job codes:", codes)


# Create TEST_ job -> visible publicly -> delete -> gone (only deletes the job we created)
class TestCreateDelete:
    def test_create_delete(self, admin_h, cand_h):
        r = requests.post(f"{BASE_URL}/api/admin/jobs", json={"title": "TEST_IT11 Temp Job", "company": "TEST_Co", "status": "Published"}, headers=admin_h, timeout=20)
        assert r.status_code == 200
        jid = r.json()["job"]["job_id"]
        try:
            assert requests.get(f"{BASE_URL}/api/jobs/{jid}", headers=cand_h, timeout=20).status_code == 200
        finally:
            assert requests.delete(f"{BASE_URL}/api/admin/jobs/{jid}", headers=admin_h, timeout=20).status_code == 200
        assert requests.get(f"{BASE_URL}/api/jobs/{jid}", headers=cand_h, timeout=20).status_code == 404
        ids = [j["job_id"] for j in requests.get(f"{BASE_URL}/api/jobs", params={"q": "TEST_IT11", "limit": 50}, timeout=20).json()["jobs"]]
        assert jid not in ids
