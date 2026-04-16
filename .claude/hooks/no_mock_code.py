#!/usr/bin/env python3
"""
PreToolUse Write|Edit hook -- blocks mock/placeholder code from being written.
Catches: TODO without implementation, unimplemented stubs, fake returns.
"""
import json
import re
import sys
from pathlib import Path

CODE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".py"}

SKIP_PATHS = [
    ".claude/",
    ".test.", ".spec.",
    "__tests__", "__mocks__",
    "node_modules",
    "theme/index",
]

THROW_NOT_IMPL = re.compile(r'throw\s+new\s+Error\s*\([\'"](?:not implemented|TODO)', re.IGNORECASE)
RAISE_NOT_IMPL = re.compile(r'\braise\s+NotImplementedError\b')
ELLIPSIS_BODY  = re.compile(r'^\s*\.\.\.\s*$')
FUNC_CLASS_DEF = re.compile(r'^\s*(?:async\s+)?def\s+\w|^\s*class\s+\w')

# TODO/FIXME comment (JS or Python style)
TODO_RE = re.compile(r'(?://|#)\s*(?:TODO|FIXME|HACK|XXX)\b', re.IGNORECASE)
EMPTY_RETURN = re.compile(
    r'\breturn\s+(?:null|undefined|None|false|\[\]|\{\}|0)\s*;?\s*$',
    re.IGNORECASE | re.MULTILINE,
)


def should_skip(file_path: str) -> bool:
    ext = Path(file_path).suffix.lower()
    if ext not in CODE_EXTENSIONS:
        return True
    norm = file_path.replace("\\", "/")
    return any(p in norm for p in SKIP_PATHS)


def prev_non_blank(lines: list, idx: int) -> str:
    for j in range(idx - 1, -1, -1):
        if lines[j].strip():
            return lines[j]
    return ""


def check_content(content: str, file_path: str) -> list[str]:
    issues = []
    lines = content.splitlines()

    for i, line in enumerate(lines):
        stripped = line.strip()

        # --- TODO check runs FIRST (before comment skip, because TODOs ARE comments) ---
        if TODO_RE.search(line):
            window = "\n".join(lines[i : min(i + 4, len(lines))])
            if EMPTY_RETURN.search(window):
                issues.append(
                    f"Line {i+1}: TODO with placeholder return -- implement or remove: `{stripped[:60]}`"
                )
            continue  # TODO lines are comments; skip remaining checks for this line

        # Skip other comment-only lines
        if stripped.startswith(("//", "#", "*", "/*", "*/")):
            continue

        # throw new Error("not implemented")
        if THROW_NOT_IMPL.search(line):
            issues.append(f"Line {i+1}: Unimplemented stub: `{stripped[:70]}`")
            continue

        # raise NotImplementedError (Python)
        if RAISE_NOT_IMPL.search(line):
            issues.append(f"Line {i+1}: Unimplemented stub: `{stripped[:70]}`")
            continue

        # Ellipsis as sole function body
        if ELLIPSIS_BODY.match(line):
            if FUNC_CLASS_DEF.match(prev_non_blank(lines, i)):
                issues.append(f"Line {i+1}: Ellipsis placeholder body -- implement the function")
            continue

        # `pass` as sole function/class body (not in except/if/else/etc.)
        if re.match(r'^\s*pass\s*$', line):
            prev = prev_non_blank(lines, i)
            if FUNC_CLASS_DEF.match(prev):
                issues.append(f"Line {i+1}: `pass` placeholder in function body -- implement it")

    return issues


def deny_write(reason: str):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    tool = data.get("tool_name", "")
    inp  = data.get("tool_input", {})

    if tool == "Write":
        file_path = inp.get("file_path", "")
        content   = inp.get("content", "")
    elif tool == "Edit":
        file_path = inp.get("file_path", "")
        content   = inp.get("new_string", "")
    else:
        sys.exit(0)

    if not content or not file_path:
        sys.exit(0)

    if should_skip(file_path):
        sys.exit(0)

    issues = check_content(content, file_path)
    if issues:
        body = "\n".join(f"  * {iss}" for iss in issues[:5])
        deny_write(
            f"Placeholder/mock code detected in {file_path}:\n\n{body}\n\n"
            f"Implement the actual logic before writing. No TODO stubs."
        )

    sys.exit(0)


if __name__ == "__main__":
    main()
