#!/usr/bin/env python3
"""
PreToolUse Bash hook — validates git commit messages.
Blocks: Co-Authored-By, Claude signatures, wrong format.
Enforces: fix:|feat:|improve:|chore:|docs:|refactor:|test: prefixes, max 72 chars.
"""
import json
import re
import sys

VALID_PREFIXES = ("fix:", "feat:", "improve:", "chore:", "docs:", "refactor:", "test:", "revert:", "build:", "ci:", "perf:")

BLOCKED_PATTERNS = [
    (r"Co-[Aa]uthored-[Bb]y:", "Co-Authored-By is not allowed in commits"),
    (r"🤖 Generated with", "Remove Claude/AI signatures from commits"),
    (r"claude\.ai|Claude Code|noreply@anthropic\.com", "Remove Anthropic references from commits"),
    (r"\bby Claude\b", "Remove 'by Claude' from commit message"),
]


def extract_commit_message(command: str) -> str | None:
    """Extract -m value(s) from a git commit command."""
    # Match all -m "..." or -m '...' instances
    parts = re.findall(r'-m\s+["\']([^"\']+)["\']', command)
    if parts:
        return "\n\n".join(parts)
    # Heredoc / $(...) patterns — can't easily parse, skip
    return None


def deny(reason: str):
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

    if data.get("tool_name") != "Bash":
        sys.exit(0)

    command = data.get("tool_input", {}).get("command", "")

    if not re.search(r"\bgit\b.*\bcommit\b", command):
        sys.exit(0)

    # Block --no-verify bypass
    if "--no-verify" in command:
        deny("--no-verify is not allowed. Fix the underlying issue instead.")

    message = extract_commit_message(command)
    if not message:
        sys.exit(0)  # Editor mode or complex quoting — let it through

    subject = message.split("\n")[0].strip()

    # Block forbidden patterns in full message
    for pattern, reason in BLOCKED_PATTERNS:
        if re.search(pattern, message, re.IGNORECASE):
            deny(f"Commit blocked: {reason}\n\nMessage was:\n{subject}")

    # Enforce prefix format
    if not any(subject.lower().startswith(p) for p in VALID_PREFIXES):
        deny(
            f"Commit format invalid. Must start with one of:\n"
            f"  {', '.join(VALID_PREFIXES)}\n\n"
            f"Got: \"{subject}\"\n\n"
            f"Example: fix: resolve login crash on Android"
        )

    # Warn on long subject
    if len(subject) > 72:
        deny(
            f"Commit subject too long ({len(subject)} chars, max 72).\n\n"
            f"Got: \"{subject}\"\n\n"
            f"Shorten the subject line."
        )

    sys.exit(0)


if __name__ == "__main__":
    main()
