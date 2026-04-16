#!/usr/bin/env python3
"""
SessionStart hook -- surfaces everything I need to orient instantly.
1. Context recovery from last auto-compact (if any)
2. Git status + recent commits
3. DagnaraApp structure snapshot (screens, stores, modified files)
4. Standing rules
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", Path(__file__).parent.parent.parent))
DAGNARA_APP = PROJECT_DIR / "DagnaraApp"
RECOVERY_FILE = PROJECT_DIR / ".claude" / "recovery" / "compact-recovery.json"


def git(args: list) -> str:
    try:
        r = subprocess.run(
            ["git"] + args, capture_output=True, text=True, timeout=5, cwd=str(PROJECT_DIR)
        )
        return r.stdout.strip()
    except Exception:
        return ""


def sep(char="=", width=68):
    print(char * width)


def h(title: str):
    print(f"\n> {title}")
    print("  " + "-" * (len(title) + 2))


def list_screens() -> list[str]:
    app_dir = DAGNARA_APP / "app"
    if not app_dir.exists():
        return []
    screens = []
    for f in sorted(app_dir.rglob("*.tsx")):
        rel = str(f.relative_to(app_dir)).replace("\\", "/")
        screens.append(rel)
    return screens


def list_store_exports() -> dict[str, list[str]]:
    store_dir = DAGNARA_APP / "src" / "store"
    stores = {}
    if not store_dir.exists():
        return stores
    for store_file in sorted(store_dir.glob("*.ts")):
        exports = []
        try:
            content = store_file.read_text(encoding="utf-8")
            for m in re.finditer(r"export\s+(?:const|function|type|interface)\s+(\w+)", content):
                exports.append(m.group(1))
        except Exception:
            exports = ["(unreadable)"]
        stores[store_file.name] = exports[:12]
    return stores


def get_modified_dagnara_files() -> list[str]:
    raw = git(["status", "--short", "--", "DagnaraApp/"])
    if not raw:
        return []
    return [line.strip() for line in raw.splitlines() if line.strip()]


def main():
    session_info = {}
    try:
        raw = sys.stdin.read()
        if raw.strip():
            session_info = json.loads(raw)
    except Exception:
        session_info = {}

    trigger = session_info.get("trigger", "unknown")
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    sep()
    print(f"  DAGNARA SESSION  |  {now}  |  trigger: {trigger}")
    sep()

    # 1. Context Recovery
    recovery_shown = False
    if RECOVERY_FILE.exists():
        try:
            with open(RECOVERY_FILE, "r", encoding="utf-8") as f:
                recovery = json.load(f)

            if not recovery.get("recovered", False) and recovery.get("summary"):
                print()
                sep("#")
                print("  !! PREVIOUS SESSION CONTEXT -- READ BEFORE DOING ANYTHING !!")
                sep("#")
                print(
                    f"  Compacted : {recovery.get('timestamp', '?')}\n"
                    f"  Branch    : {recovery.get('git_branch', '?')}\n"
                    f"  Messages  : {recovery.get('message_count', '?')}"
                )
                sep("-")
                print(recovery["summary"])
                sep("#")
                print("  Treat the above as your primary context. Do NOT re-do completed work.")
                sep("#")
                print()
                recovery_shown = True

                recovery["recovered"] = True
                with open(RECOVERY_FILE, "w", encoding="utf-8") as f:
                    json.dump(recovery, f, indent=2, ensure_ascii=False)

        except Exception as e:
            print(f"  [session_start] Recovery read error: {e}", file=sys.stderr)

    # 2. Git Status
    branch = git(["branch", "--show-current"])
    recent = git(["log", "--oneline", "-6"])
    modified = get_modified_dagnara_files()

    h("GIT")
    print(f"  Branch : {branch or 'unknown'}")
    if recent:
        print("  Recent commits:")
        for line in recent.splitlines():
            print(f"    {line}")
    if modified:
        print(f"  Modified in DagnaraApp/ ({len(modified)} files):")
        for line in modified[:8]:
            print(f"    {line}")
        if len(modified) > 8:
            print(f"    ... and {len(modified) - 8} more")

    # 3. Screens
    screens = list_screens()
    if screens:
        h("SCREENS  (DagnaraApp/app/)")
        for s in screens:
            print(f"  {s}")

    # 4. Store exports
    stores = list_store_exports()
    if stores:
        h("STORES  (DagnaraApp/src/store/)")
        for store_name, exports in stores.items():
            exp_str = ", ".join(exports[:10])
            if len(exports) > 10:
                exp_str += f" +{len(exports) - 10} more"
            print(f"  {store_name}: {exp_str}")

    # 5. Standing rules
    h("STANDING RULES")
    rules = [
        "Theme only -- import colors/spacing/fontSize/radius from '@/theme', NEVER hardcode",
        "Zustand stores for all persistent state (authStore, appStore, diaryStore)",
        "No test files (no test suite configured)",
        "Commits: fix:|feat:|improve:|chore: -- max 72 chars -- no Co-Authored-By",
        "TypeScript strict -- no `any`",
        "Primary dev in DagnaraApp/ -- do NOT edit src/ (legacy web app)",
        "Key packages: expo-linear-gradient, expo-haptics, react-native-svg (already installed)",
    ]
    for rule in rules:
        print(f"  * {rule}")

    # 6. UI quick-ref (most commonly needed patterns)
    h("UI PATTERNS  (dark purple / deep-space aesthetic)")
    ui_patterns = [
        "Depth: bg -> bg2 -> layer1(card) -> layer2(input) -> layer3(modal/overlay)",
        "Card: layer1 bg | line2 border | radius.lg | purple shadow(0.18) | elevation 8",
        "CTA btn: LinearGradient [colors.purple -> colors.purpleGlow] | radius.md | overflow hidden",
        "Pill/badge: line bg | line2 border | radius.pill(999) | spacing.md×xs padding",
        "Input: layer2 bg | line2 border | radius.md | ink text | ink3 placeholder",
        "Section label: ink3 | fontSize.xs | fontWeight:700 | letterSpacing:1.1 | ALL CAPS",
        "Active/selected: purpleTint bg | line3 border — NOT purpleGlow on bg",
        "Top glow: LinearGradient rgba(124,77,255,0.22)->transparent | absoluteFillObject",
        "Functional: green=goals | honey=warning | rose=error | sky=water | teal=sleep",
        "Haptics: Light=tap | Success=save | Error=alert",
    ]
    for p in ui_patterns:
        print(f"  * {p}")

    # 7. Self-evaluation reminder (survives post-compact)
    h("SELF-EVALUATION PROTOCOL")
    print("  After every non-trivial task, output:")
    print("    Confidence: X/10")
    print("    Uncertain about: [what could be wrong]")
    print("    Verify: [what to manually check before shipping]")
    print()
    print("  If confidence < 8/10 -- explain why and propose validation steps.")
    print("  Never silently guess. Flag uncertainty explicitly.")

    print()
    if not recovery_shown:
        print("  (No compact recovery data — fresh session)")
    print()
    sep()
    sys.exit(0)


if __name__ == "__main__":
    main()
