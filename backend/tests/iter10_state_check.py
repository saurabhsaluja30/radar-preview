# Iteration 10: quick API state check (launch settings, legacy member membership, career usage pill label)
import os
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL").rstrip("/")
print("launch-offer:", requests.get(f"{BASE_URL}/api/launch-offer").json())
print("plans:", requests.get(f"{BASE_URL}/api/plans").json())
r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "test@jobradar.com", "password": "Test@12345"})
print("login", r.status_code)
tok = r.json().get("token")
H = {"Authorization": f"Bearer {tok}"}
m = requests.get(f"{BASE_URL}/api/membership", headers=H).json()
print("membership:", {k: m["membership"].get(k) for k in ("status", "plan_name", "is_demo", "is_active", "expiry_date")},
      "payments:", len(m.get("payments", [])), "plans:", m.get("plans"))
u = requests.get(f"{BASE_URL}/api/career/usage", headers=H)
print("career usage:", u.status_code, str(u.json())[:600])
