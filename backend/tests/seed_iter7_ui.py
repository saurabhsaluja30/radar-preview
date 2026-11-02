"""Seed UI test users for iteration 7: one granted candidate + one waitlisted candidate. Restores launch settings."""
import json
import requests
from test_launch_offer_upload import API, ADMIN, RESTORE, _register, _h

a = _h(requests.post(f"{API}/auth/admin/login", json=ADMIN, timeout=30).json()["token"])
g_email, g = _register("ui_granted")
requests.post(f"{API}/career/consent", headers=_h(g["token"]), timeout=30)
s = requests.get(f"{API}/admin/launch-offer", headers=a, timeout=30).json()["settings"]
requests.put(f"{API}/admin/launch-offer", json=RESTORE | {"free_spots": s["granted"]}, headers=a, timeout=30)
w_email, w = _register("ui_wait")
requests.put(f"{API}/admin/launch-offer", json=RESTORE, headers=a, timeout=30)
print(json.dumps({"granted": g_email, "granted_status": g["user"]["launch_offer"],
                  "wait": w_email, "wait_status": w["user"]["launch_offer"], "wait_id": w["user"]["user_id"]}))
