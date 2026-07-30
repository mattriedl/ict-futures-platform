import subprocess, sys, os

REPO = "/home/ubuntu/ict_project/nextjs_space"
TOKEN = os.environ["GH_TOKEN"]
BRANCH = "feat/backtesting-journal-admin"
REMOTE = f"https://mattriedl:{TOKEN}@github.com/mattriedl/ict-futures-platform.git"

def run(cmd, check=True):
    print("+ " + " ".join(c if c != TOKEN else "***" for c in cmd))
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    out = (r.stdout or "") + (r.stderr or "")
    # redact token if it ever appears
    print(out.replace(TOKEN, "***"))
    if check and r.returncode != 0:
        print(f"!! exit {r.returncode}")
        sys.exit(r.returncode)
    return r.returncode, out

# identity
run(["git", "config", "user.name", "mattriedl"])
run(["git", "config", "user.email", "36744491+mattriedl@users.noreply.github.com"])

# create / switch to feature branch (from current main)
rc, _ = run(["git", "rev-parse", "--verify", BRANCH], check=False)
if rc == 0:
    run(["git", "checkout", BRANCH])
else:
    run(["git", "checkout", "-b", BRANCH])

# stage everything (.env is gitignored). Remove scratch script from staging later.
run(["git", "add", "-A"])
# make sure no scratch chk file sneaks in
run(["git", "rm", "--cached", "--ignore-unmatch", "scripts/chk.ts"], check=False)

msg = (
    "feat: backtesting, one-click + manual demo trades, journal, admin, email alerts\n\n"
    "- Configurable 60-day backtesting on any tracked future (real Yahoo data)\n"
    "- One-click trade tracking from AI setups with auto win/loss/open evaluation\n"
    "- Manual demo trades with full options + manual close\n"
    "- Trade journal: statistics, equity curve, R-distribution, per-symbol/pattern breakdowns\n"
    "- Editable demo account (default $100,000 starting balance)\n"
    "- Admin console: user/role management, instruments, platform settings\n"
    "- Email alert notifications via Gmail (safely no-op until GMAIL_APP_PASSWORD is set)\n"
    "- Fix: atomic guard + self-healing reconcile to prevent demo-balance double-count race\n"
)
rc, out = run(["git", "commit", "-m", msg], check=False)
if rc != 0 and "nothing to commit" in out:
    print("Nothing to commit.")

# set remote with token and push
run(["git", "remote", "set-url", "origin", REMOTE])
run(["git", "push", "-u", "origin", BRANCH])
# restore tokenless remote to avoid leaving token in config
run(["git", "remote", "set-url", "origin", "https://github.com/mattriedl/ict-futures-platform.git"])
print("DONE")
