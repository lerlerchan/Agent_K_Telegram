#!/usr/bin/env python3
"""Weekly intern LiteLLM spend report -> Telegram DM (Agent K bot).

Queries LiteLLM on kvm2 over SSH (master key never leaves kvm2), then sends
a summary via the Telegram Bot API. Cron: Fri 17:00 MYT.
Usage: intern-spend-report.py [--dry-run]
"""
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ENV_PATH = Path("/home/lerler/github/Agent_K_Telegram/.env")
TEAM_ID = "41295d4d-ba32-4a31-899a-4031646ddb8d"
DAYS = 7

# Runs on kvm2: prints JSON {team, interns:[{name, week, total, models}]}
REMOTE = r'''
cd /root/litellm && set -a && . ./.env && set +a && python3 - <<'EOF'
import json, os, urllib.request, datetime as dt
base = "http://localhost:%s" % os.environ["PUBLIC_PORT"]
H = {"Authorization": "Bearer " + os.environ["LITELLM_MASTER_KEY"]}
g = lambda p: json.load(urllib.request.urlopen(urllib.request.Request(base + p, headers=H)))
end = dt.date.today() + dt.timedelta(days=1)
start = end - dt.timedelta(days=__DAYS__)
team = g("/team/info?team_id=__TEAM__")["team_info"]
out = {"team": {"spend": team.get("spend") or 0, "max": team.get("max_budget"),
                "reset": team.get("budget_reset_at")}, "start": str(start), "interns": []}
for m in team.get("members_with_roles", []):
    uid = m.get("user_id")
    info = g("/user/info?user_id=" + uid)["user_info"]
    if not (info.get("user_email") or "").endswith("@sc.edu.my"):
        continue
    days = g("/spend/logs?user_id=%s&start_date=%s&end_date=%s" % (uid, start, end))
    week, models = 0.0, {}
    for d in days if isinstance(days, list) else []:
        week += d.get("spend") or 0
        for k, v in (d.get("models") or {}).items():
            models[k] = models.get(k, 0) + (v or 0)
    out["interns"].append({"name": info.get("user_alias") or info.get("user_email"),
                           "week": week, "total": info.get("spend") or 0,
                           "models": {k: v for k, v in models.items() if v > 0}})
print(json.dumps(out))
EOF
'''.replace("__DAYS__", str(DAYS)).replace("__TEAM__", TEAM_ID)


def load_env(path: Path) -> dict:
    env = {}
    for line in path.read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def fetch() -> dict:
    r = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=20", "kvm2", REMOTE],
                       capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[-500:])
    return json.loads(r.stdout)


def fmt(d: dict) -> str:
    t = d["team"]
    lines = [f"<b>📊 Intern AI spend — week from {d['start']}</b>", ""]
    for i in sorted(d["interns"], key=lambda x: -x["week"]):
        top = ", ".join(f"{k} ${v:.2f}" for k, v in sorted(i["models"].items(), key=lambda x: -x[1])[:3]) or "no usage"
        lines.append(f"<b>{i['name']}</b>: ${i['week']:.2f} this week (total ${i['total']:.2f})\n  └ {top}")
    pct = (t["spend"] / t["max"] * 100) if t["max"] else 0
    lines += ["", f"<b>Team pool</b>: ${t['spend']:.2f} / ${t['max']:.0f} ({pct:.0f}%)",
              f"Resets: {(t['reset'] or '?')[:10]}"]
    if pct >= 80:
        lines.append("⚠️ Pool above 80% — consider reminding interns to use DeepSeek.")
    return "\n".join(lines)


def send(text: str, env: dict) -> None:
    data = urllib.parse.urlencode({"chat_id": env["TELEGRAM_DM_CHAT_ID"], "text": text,
                                   "parse_mode": "HTML"}).encode()
    url = f"https://api.telegram.org/bot{env['TELEGRAM_BOT_TOKEN']}/sendMessage"
    urllib.request.urlopen(url, data=data, timeout=30).read()


def main() -> None:
    env = load_env(ENV_PATH)
    try:
        text = fmt(fetch())
    except Exception as e:  # report failure instead of failing silently
        text = f"⚠️ Intern spend report failed: {e}"
    if "--dry-run" in sys.argv:
        print(text)
        return
    send(text, env)
    print("sent")


if __name__ == "__main__":
    main()
