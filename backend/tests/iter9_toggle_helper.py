# Helper: toggle launch offer settings / register a no-membership candidate (iteration 9 manual UI checks)
import os
import sys
import uuid
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
tok = requests.post(f"{BASE_URL}/api/auth/admin/login",
                    json={"email": "admin@eevolvex.com", "password": "Admin@12345"}).json()["token"]
H = {"Authorization": f"Bearer {tok}"}
cmd = sys.argv[1]
if cmd == "set":
    enabled, hidden = sys.argv[2] == "1", sys.argv[3] == "1"
    r = requests.put(f"{BASE_URL}/api/admin/launch-offer", headers=H,
                     json={"enabled": enabled, "plans_hidden": hidden, "free_spots": 100, "free_days": 90})
    print(r.status_code, r.json()["settings"])
elif cmd == "register":
    email = f"test_iter9_nomem_{uuid.uuid4().hex[:6]}@example.com"
    r = requests.post(f"{BASE_URL}/api/auth/register", json={
        "full_name": "TEST NoMem", "email": email, "mobile": "9876543210",
        "password": "Test@12345", "confirm_password": "Test@12345", "consent": True,
        "preferred_function": "IT & Technology", "preferred_location": "Bengaluru",
        "industry": "IT & Technology", "current_designation": "Engineer", "current_salary": "5 LPA",
        "preferred_work_mode": "Remote"})
    print(r.status_code, email, r.json()["user"].get("launch_offer"))
