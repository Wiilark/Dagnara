#!/usr/bin/env python3
"""
PreToolUse Write|Edit hook -- enforces Dagnara theme token usage.
Blocks hardcoded colors, spacing, font sizes, and radius values in .tsx/.ts/.js files.
All design values must come from DagnaraApp/src/theme/index.ts
"""
import json
import re
import sys
from pathlib import Path

CODE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx"}

SKIP_PATHS = [
    ".claude/",
    "theme/index",
    ".test.", ".spec.",
    "node_modules", "__mocks__",
    "eas.json", "app.json", "tsconfig", "babel", "metro",
    ".d.ts",
]

# Hex color anywhere in a style-related line — simple match, no lookbehind exclusions
HEX_COLOR = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')

# Named colors in style prop values
NAMED_COLORS = re.compile(
    r'(?:backgroundColor|color|borderColor|tintColor|fill|stroke)\s*:\s*[\'"]'
    r'(?:white|black|red|blue|green|gray|grey|yellow|orange|pink|transparent|'
    r'rgba?\s*\([^)]+\)|hsl[a]?\s*\([^)]+\))[\'"]',
    re.IGNORECASE
)

SPACING_PROPS = (
    r"padding|paddingTop|paddingBottom|paddingLeft|paddingRight|"
    r"paddingHorizontal|paddingVertical|margin|marginTop|marginBottom|"
    r"marginLeft|marginRight|marginHorizontal|marginVertical|gap|rowGap|columnGap"
)
# Matches e.g.  padding: 16  (2+ digit numbers — avoids false positives on 0/1/2)
HARDCODED_SPACING = re.compile(rf'(?:{SPACING_PROPS})\s*:\s*(\d{{2,}})\b')
ALLOWED_SPACING = {0, 1, 2, 100, 999}

FONT_SIZE = re.compile(r'fontSize\s*:\s*(\d+)\b')
ALLOWED_FONT_SIZES = {0}

BORDER_RADIUS = re.compile(
    r'(?:borderRadius|borderTopLeftRadius|borderTopRightRadius|'
    r'borderBottomLeftRadius|borderBottomRightRadius)\s*:\s*(\d{{2,}})\b'
)
ALLOWED_RADIUS = {0, 1, 2, 50, 100, 999}

THEME_COLORS  = "colors.bg/bg2/layer1-3 | colors.ink/ink2/ink3 | colors.purple/violet/lavender | colors.green/honey/rose/sky/teal | colors.line/line2/line3"
THEME_SPACING = "spacing.xs(6)/sm(10)/md(16)/lg(24)/xl(36)"
THEME_FONT    = "fontSize.xs/sm/base/md/lg/xl/2xl"
THEME_RADIUS  = "radius.sm(10)/md(16)/lg(22)/xl(30)"

# Style-related line indicators (only scan lines that are plausibly style values)
COLOR_PROPS = re.compile(r'(?:background|[Cc]olor|tintColor|fill|stroke)\b', re.IGNORECASE)


def should_skip(file_path: str) -> bool:
    ext = Path(file_path).suffix.lower()
    if ext not in CODE_EXTENSIONS:
        return True
    norm = file_path.replace("\\", "/")
    return any(p in norm for p in SKIP_PATHS)


def check_content(content: str, file_path: str) -> list[str]:
    issues = []
    lines = content.splitlines()

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # Skip pure comment lines and non-style code
        if stripped.startswith(("//", "*", "/*", "*/")):
            continue
        if stripped.startswith(("import ", "export type ", "type ", "interface ")):
            continue
        if "console." in stripped:
            continue

        # Hex colors on lines mentioning a color/background property
        if COLOR_PROPS.search(line):
            for m in HEX_COLOR.finditer(line):
                issues.append(f"Line {i}: Hardcoded hex {m.group()} -- use theme: {THEME_COLORS}")

        # Named colors in style prop values
        if NAMED_COLORS.search(line):
            issues.append(f"Line {i}: Named color literal in style -- use theme: {THEME_COLORS}")

        # Hardcoded spacing
        for m in HARDCODED_SPACING.finditer(line):
            val = int(m.group(1))
            if val not in ALLOWED_SPACING:
                prop = m.group(0).split(":")[0].strip()
                issues.append(f"Line {i}: Hardcoded {prop}: {val} -- use {THEME_SPACING}")

        # Hardcoded fontSize
        for m in FONT_SIZE.finditer(line):
            val = int(m.group(1))
            if val not in ALLOWED_FONT_SIZES:
                issues.append(f"Line {i}: Hardcoded fontSize: {val} -- use {THEME_FONT}")

        # Hardcoded borderRadius (2+ digit values)
        br_matches = re.finditer(
            r'(?:borderRadius|borderTopLeftRadius|borderTopRightRadius|'
            r'borderBottomLeftRadius|borderBottomRightRadius)\s*:\s*(\d{2,})\b',
            line
        )
        for m in br_matches:
            val = int(m.group(1))
            if val not in ALLOWED_RADIUS:
                prop = m.group(0).split(":")[0].strip()
                issues.append(f"Line {i}: Hardcoded {prop}: {val} -- use {THEME_RADIUS}")

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
    if not issues:
        sys.exit(0)

    body = "\n".join(f"  * {iss}" for iss in issues[:6])
    extra = f"\n  ... and {len(issues) - 6} more" if len(issues) > 6 else ""
    deny_write(
        f"Theme token violation in {file_path}:\n\n{body}{extra}\n\n"
        f"Import from theme: import {{ colors, spacing, fontSize, radius }} from '@/theme'\n"
        f"Never hardcode design values -- all tokens are in DagnaraApp/src/theme/index.ts"
    )


if __name__ == "__main__":
    main()
