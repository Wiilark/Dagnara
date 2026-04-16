#!/usr/bin/env python3
"""
PostToolUse Write|Edit hook -- runs tsc --noEmit after editing .ts/.tsx files
in DagnaraApp/. Reports type errors back to Claude so they can be fixed
immediately rather than surfacing as Expo Go crashes.
"""
import json
import subprocess
import sys
from pathlib import Path

PROJECT_DIR = Path("C:/Users/Wilark/Desktop/DAGNARA/DagnaraApp")
CODE_EXTENSIONS = {".ts", ".tsx"}
SKIP_PATHS = ["node_modules", ".d.ts", "theme/index"]


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

    tool = data.get("tool_name", "")
    inp = data.get("tool_input", {})

    file_path = inp.get("file_path", "")
    if not file_path or should_skip(file_path):
        sys.exit(0)

    try:
        result = subprocess.run(
            ["npx", "tsc", "--noEmit", "--pretty", "false"],
            cwd=str(PROJECT_DIR),
            capture_output=True,
            text=True,
            timeout=45,
        )
    except subprocess.TimeoutExpired:
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "outputToAssistant": "TypeScript check timed out (>45s). Expo Go may reveal errors.",
            }
        }))
        sys.exit(0)
    except Exception as e:
        sys.exit(0)

    if result.returncode != 0:
        errors = (result.stdout or result.stderr or "").strip()
        # Limit output so it doesn't flood context
        lines = errors.splitlines()
        shown = "\n".join(lines[:30])
        extra = f"\n  ... and {len(lines) - 30} more lines" if len(lines) > 30 else ""
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "outputToAssistant": (
                    f"TypeScript errors detected after editing {Path(file_path).name}:\n\n"
                    f"{shown}{extra}\n\n"
                    "Fix these type errors before the user tests in Expo Go."
                ),
            }
        }))

    sys.exit(0)


if __name__ == "__main__":
    main()
