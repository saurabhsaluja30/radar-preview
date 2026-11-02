# Cleanup helper: deletes the resume created during iteration_8 frontend regression (Use This Template flow)
import os
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
r = requests.post(f"{BASE}/api/auth/login", json={"email": "test@jobradar.com", "password": "Test@12345"})
tok = r.json().get("token") or r.json().get("access_token")
h = {"Authorization": f"Bearer {tok}"}
lst = requests.get(f"{BASE}/api/career/resumes", headers=h)
print("list", lst.status_code)
items = lst.json() if isinstance(lst.json(), list) else lst.json().get("resumes", [])
for it in items:
    if it.get("resume_id") == "res_03508e159f8d":
        d = requests.delete(f"{BASE}/api/career/resumes/res_03508e159f8d", headers=h)
        print("delete", d.status_code, d.text[:100])
print("count", len(items))
