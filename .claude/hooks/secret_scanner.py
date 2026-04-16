#!/usr/bin/env python3
"""
PreToolUse Write|Edit hook — blocks hardcoded secrets from being written.
Catches: API keys, tokens, passwords, private keys hardcoded in source files.
"""
import json
import re
import sys

# Files where secrets are expected — don't scan these
ALLOWED_PATHS = [".env", ".env.example", ".env.sample", ".env.template", "CLAUDE.md", ".md"]

# High-confidence secret patterns
HIGH_SEVERITY = [
    (r"sk-ant-[a-zA-Z0-9\-_]{20,}", "Anthropic API key"),
    (r"sk-[a-zA-Z0-9]{48}", "OpenAI API key"),
    (r"ANTHROPIC_API_KEY\s*=\s*['\"]?sk-", "Hardcoded Anthropic API key"),
    (r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}", "JWT token"),
    (r"-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----", "Private key"),
    (r"ghp_[a-zA-Z0-9]{36}", "GitHub personal access token"),
    (r"ghs_[a-zA-Z0-9]{36}", "GitHub app token"),
    (r"xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+", "Slack bot token"),
    (r"AIza[0-9A-Za-z\-_]{35}", "Google API key"),
]

# Medium confidence (more context needed)
MEDIUM_SEVERITY = [
    (r'(?:password|passwd|secret|api_key|apikey)\s*[:=]\s*["\'][^"\']{8,}["\']', "Hardcoded credential"),
    (r'(?:Bearer|token)\s+[a-zA-Z0-9\-_\.]{20,}', "Hardcoded Bearer token"),
]

# Lines/contexts that are false positives
SAFE_PATTERNS = [
    r"process\.env\.",
    r"EXPO_PUBLIC_",
    r"os\.environ",
    r"getenv\(",
    r"example|sample|placeholder|your[_-]?key|<[A-Z_]+>",
    r"^\s*//",
    r"^\s*#",
    r"^\s*\*",
]


def should_skip(file_path: str) -> bool:
    from pathlib import Path
    name = Path(file_path).name.lower()
    suffix = Path(file_path).suffix.lower()
    return (
        any(a in file_path for a in ALLOWED_PATHS)
        or suffix in {".md", ".txt", ".lock", ".png", ".jpg", ".svg"}
        or "node_modules" in file_path
        or "__pycache__" in file_path
    )


def is_safe_line(line: str) -> bool:
    for p in SAFE_PATTERNS:
        if re.search(p, line, re.IGNORECASE):
            return True
    return False


def scan(content: str, file_path: str) -> list[tuple[str, str, int]]:
    """Returns list of (severity, description, line_number)."""
    findings = []
    lines = content.splitlines()

    for i, line in enumerate(lines, 1):
        if is_safe_line(line):
            continue

        for pattern, desc in HIGH_SEVERITY:
            if re.search(pattern, line):
                findings.append(("HIGH", desc, i))
                break

        for pattern, desc in MEDIUM_SEVERITY:
            if re.search(pattern, line, re.IGNORECASE):
                findings.append(("MEDIUM", desc, i))
                break

    return findings


def deny_write(reason: str):
    output = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }
    print(json.dumps(output))
    sys.exit(0)


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    tool = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})

    if tool == "Write":
        file_path = tool_input.get("file_path", "")
        content = tool_input.get("content", "")
    elif tool == "Edit":
        file_path = tool_input.get("file_path", "")
        content = tool_input.get("new_string", "")
    else:
        sys.exit(0)

    if not content or not file_path:
        sys.exit(0)

    if should_skip(file_path):
        sys.exit(0)

    findings = scan(content, file_path)
    if not findings:
        sys.exit(0)

    high = [f for f in findings if f[0] == "HIGH"]
    medium = [f for f in findings if f[0] == "MEDIUM"]

    if high:
        lines = "\n".join(f"  • Line {f[2]}: {f[1]}" for f in high[:5])
        deny_write(
            f"SECRET DETECTED in {file_path} — write blocked!\n\n{lines}\n\n"
            f"Use environment variables (process.env.X or EXPO_PUBLIC_X) instead of hardcoding secrets."
        )

    if medium:
        lines = "\n".join(f"  • Line {f[2]}: {f[1]}" for f in medium[:3])
        deny_write(
            f"Potential credential in {file_path}:\n\n{lines}\n\n"
            f"If this is intentional (e.g., a placeholder), use a clearly fake value like 'your-api-key-here'."
        )

    sys.exit(0)


if __name__ == "__main__":
    main()
