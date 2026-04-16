#!/usr/bin/env python3
"""
PreToolUse Bash hook — auto-allow safe commands, auto-block dangerous ones.
Fixes the annoyance of Claude asking permission for every git status / curl call.

Decision logic:
  ALLOW  → safe read-only or common dev commands, no prompt shown
  DENY   → destructive commands that should never run without explicit user instruction
  (exit 0 with no output) → everything else, falls through to normal Claude permission prompt
"""
import json
import re
import sys


def allow():
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
        }
    }))
    sys.exit(0)


def deny(reason: str):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


# Commands that are always safe — auto-allow without prompting
ALWAYS_ALLOW = [
    # Git read-only
    r"^git\s+(status|log|diff|branch|show|remote|fetch|tag|stash list|ls-files|shortlog)",
    r"^git\s+log\b",
    r"^git\s+diff\b",
    r"^git\s+show\b",
    r"^git\s+fetch\b",
    # Node / npm read-only
    r"^npm\s+(list|ls|run|test|audit|outdated|view|info)",
    r"^node\s+(-v|--version)",
    r"^npm\s+(-v|--version)",
    r"^npx\s+expo\s+(doctor|install|--version)",
    # Python
    r"^python\s+(-V|--version|-c\s+[\"']import|\"import)",
    r"^python3?\s+(-V|--version)",
    # System info
    r"^(ls|dir|pwd|echo|cat|head|tail|wc|which|where)\b",
    r"^(curl|wget)\s+",  # HTTP requests — allow (user said curl annoys them)
    r"^(jq|grep|rg|find)\s+",
    # Dev server / build checks
    r"^(adb|expo|eas)\s+(devices|status|whoami|build:list|diagnostics)",
    r"^(netstat|ss|lsof)\s+",
    r"^(ping|nslookup|dig)\s+",
]

# Commands that are NEVER allowed — block with explanation
ALWAYS_DENY = [
    (r"git\s+push\s+.*--force", "Force push is blocked. Push normally or ask the user to force push manually."),
    (r"git\s+reset\s+--hard", "git reset --hard discards uncommitted work. Ask the user to confirm if this is intentional."),
    (r"git\s+clean\s+-[a-z]*f", "git clean -f deletes untracked files permanently. Too destructive to auto-run."),
    (r"git\s+branch\s+-[Dd]\s+\S+", "Deleting branches is irreversible. Ask the user to confirm the branch name first."),
    (r"\brm\s+-[a-z]*rf?\s+/", "rm -rf on a root/absolute path is blocked. Too dangerous."),
    (r"\brm\s+-[a-z]*rf?\s+\.\.", "rm -rf on parent directory paths is blocked."),
    (r"DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE", "Destructive SQL blocked. Run manually if intentional."),
    (r"git\s+rebase\s+-i", "Interactive rebase requires user input — run this manually in your terminal."),
    (r"npx\s+.*--dangerously", "Dangerous npx flags blocked."),
    (r"chmod\s+777", "chmod 777 is a security risk. Use more restrictive permissions."),
]


def matches_any(command: str, patterns: list) -> tuple[bool, str]:
    for item in patterns:
        if isinstance(item, tuple):
            pattern, reason = item
            if re.search(pattern, command, re.IGNORECASE):
                return True, reason
        else:
            if re.search(item, command, re.IGNORECASE):
                return True, ""
    return False, ""


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    if data.get("tool_name") != "Bash":
        sys.exit(0)

    command = data.get("tool_input", {}).get("command", "").strip()
    if not command:
        sys.exit(0)

    # Check deny list first (takes priority)
    matched, reason = matches_any(command, ALWAYS_DENY)
    if matched:
        deny(reason)

    # Check allow list
    matched, _ = matches_any(command, ALWAYS_ALLOW)
    if matched:
        allow()

    # Everything else: fall through to Claude's normal permission handling
    sys.exit(0)


if __name__ == "__main__":
    main()
