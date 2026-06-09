#!/usr/bin/env python3
"""
PostToolUse Write|Edit hook -- runs eslint on the single edited .ts/.tsx file
in DagnaraApp/. Surfaces ERRORS to Claude immediately (dead code, undefined refs,
broken hooks). Warnings are intentionally suppressed here so routine edits don't
flood context -- run `npm run lint` for the full warning report.
"""
import json
import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path("C:/Users/Wilark/Desktop/DAGNARA/DagnaraApp")
CODE_EXTENSIONS = {".ts", ".tsx"}
SKIP_PATHS = ["node_modules", ".d.ts", "dist/", ".expo/"]


def should_skip(file_path: str) -> bool:
    p = Path(file_path)
    if p.suffix.lower() not in CODE_EXTENSIONS:
        return True
    norm = file_path.replace("\\", "/")
    if "DagnaraApp/" not in norm:
        return True
    return any(s in norm for s in SKIP_PATHS)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    inp = data.get("tool_input", {})
    file_path = inp.get("file_path", "")
    if not file_path or should_skip(file_path):
        sys.exit(0)

    # Lint only the edited file (fast). --quiet => report errors, hide warnings.
    try:
        result = subprocess.run(
            ["npx", "eslint", "--quiet", "--format", "compact", file_path],
            cwd=str(PROJECT_DIR),
            capture_output=True,
            text=True,
            timeout=40,
        )
    except subprocess.TimeoutExpired:
        sys.exit(0)
    except Exception:
        sys.exit(0)

    # eslint exits non-zero only when errors remain (warnings are hidden by --quiet).
    if result.returncode != 0:
        out = (result.stdout or result.stderr or "").strip()
        lines = out.splitlines()
        shown = "\n".join(lines[:25])
        extra = f"\n  ... and {len(lines) - 25} more lines" if len(lines) > 25 else ""
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "outputToAssistant": (
                    f"ESLint errors after editing {Path(file_path).name}:\n\n"
                    f"{shown}{extra}\n\n"
                    "Fix these before continuing."
                ),
            }
        }))

    sys.exit(0)


if __name__ == "__main__":
    main()
