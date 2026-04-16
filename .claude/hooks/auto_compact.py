#!/usr/bin/env python3
"""
PreCompact hook — runs before Claude auto-compacts the context.
Reads the JSONL transcript, generates a Haiku summary, saves to recovery file.
Next session's session_start.py will read it and surface it to Claude.
"""
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", Path(__file__).parent.parent.parent))
RECOVERY_FILE = PROJECT_DIR / ".claude" / "recovery" / "compact-recovery.json"
BACKUP_DIR = PROJECT_DIR / ".claude" / "backups"


def find_claude_bin():
    import shutil
    return shutil.which("claude") or "claude"


def parse_jsonl_transcript(transcript_path: Path) -> list:
    """Parse JSONL conversation file, return list of {type, content} dicts."""
    messages = []
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                etype = entry.get("type")
                if etype == "user":
                    content = entry.get("message", {}).get("content", "")
                    if isinstance(content, str) and content.strip():
                        messages.append({"type": "user", "content": content.strip()})
                elif etype == "assistant":
                    content = entry.get("message", {}).get("content", [])
                    text_parts = []
                    if isinstance(content, str):
                        text_parts.append(content)
                    elif isinstance(content, list):
                        for item in content:
                            if isinstance(item, dict) and item.get("type") == "text":
                                text_parts.append(item.get("text", ""))
                    combined = "\n".join(text_parts).strip()
                    if combined:
                        messages.append({"type": "assistant", "content": combined})
    except Exception as e:
        print(f"[auto_compact] Warning: transcript parse error: {e}", file=sys.stderr)
    return messages


def format_for_summary(messages: list, keep_last: int = 20) -> str:
    """Take last N messages and format as readable conversation."""
    recent = messages[-keep_last:] if len(messages) > keep_last else messages
    parts = []
    for m in recent:
        role = "USER" if m["type"] == "user" else "CLAUDE"
        # Truncate very long messages
        content = m["content"][:2000] + "..." if len(m["content"]) > 2000 else m["content"]
        parts.append(f"[{role}]\n{content}")
    return "\n\n---\n\n".join(parts)


def generate_summary(conversation_text: str, meta: dict) -> str | None:
    """Call claude CLI with Haiku to generate a compact summary."""
    prompt = f"""Summarize this Claude Code development session in under 3000 characters.

Session info:
- Branch: {meta.get('git_branch', 'unknown')}
- Working dir: {meta.get('cwd', 'unknown')}

Format exactly as:
# Session Summary ({datetime.now().strftime('%Y-%m-%d %H:%M')})

## What we worked on
[1-2 sentences]

## Key changes made
- file:line — what changed

## Decisions / important context
- [bullet points]

## What's next / unfinished
- [bullet points]

---
Keep it dense and actionable. No fluff.

CONVERSATION:
{conversation_text}
"""

    claude_bin = find_claude_bin()
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write(prompt)
            tmp = f.name

        result = subprocess.run(
            [claude_bin, "-p", "--model", "claude-sonnet-4-6",
             "--dangerously-skip-permissions", "--output-format", "json"],
            stdin=open(tmp, "r", encoding="utf-8"),
            capture_output=True,
            text=True,
            timeout=180,
        )
        Path(tmp).unlink(missing_ok=True)

        if result.returncode != 0:
            print(f"[auto_compact] Claude CLI failed: {result.stderr[:300]}", file=sys.stderr)
            return None

        # Parse JSON response
        try:
            data = json.loads(result.stdout)
        except json.JSONDecodeError:
            # Plain text fallback
            return result.stdout.strip() or None

        # Handle various response shapes
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    if item.get("type") == "result":
                        return item.get("result", "").strip() or None
                    if item.get("type") == "assistant":
                        content = item.get("message", {}).get("content", [])
                        for c in content:
                            if isinstance(c, dict) and c.get("type") == "text":
                                return c.get("text", "").strip() or None
        elif isinstance(data, dict):
            return (data.get("result") or data.get("content") or "").strip() or None

        return result.stdout.strip() or None

    except subprocess.TimeoutExpired:
        print("[auto_compact] Claude CLI timed out", file=sys.stderr)
        Path(tmp).unlink(missing_ok=True)
        return None
    except FileNotFoundError:
        print("[auto_compact] claude CLI not found in PATH", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[auto_compact] Summary error: {e}", file=sys.stderr)
        return None


def main():
    # Read session metadata from stdin
    meta = {}
    try:
        raw = sys.stdin.read()
        if raw.strip():
            meta = json.loads(raw)
    except Exception as e:
        print(f"[auto_compact] stdin parse error: {e}", file=sys.stderr)

    transcript_path_str = meta.get("transcript_path", "")
    session_id = meta.get("session_id", "")
    git_branch = meta.get("git_branch", "unknown")

    print(f"[auto_compact] Compact triggered. Branch: {git_branch}", file=sys.stderr)

    messages = []
    if transcript_path_str:
        transcript_path = Path(transcript_path_str)
        if transcript_path.exists():
            messages = parse_jsonl_transcript(transcript_path)
            print(f"[auto_compact] Parsed {len(messages)} messages from transcript", file=sys.stderr)

            # Save raw backup
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            backup_file = BACKUP_DIR / f"conversation_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            with open(backup_file, "w", encoding="utf-8") as f:
                json.dump({
                    "session_id": session_id,
                    "git_branch": git_branch,
                    "timestamp": datetime.now().isoformat(),
                    "messages": messages,
                }, f, indent=2, ensure_ascii=False)
            print(f"[auto_compact] Backup saved: {backup_file.name}", file=sys.stderr)

            # Clean up old backups (keep 5)
            backups = sorted(BACKUP_DIR.glob("conversation_*.json"))
            for old in backups[:-5]:
                old.unlink()
        else:
            print(f"[auto_compact] Transcript not found: {transcript_path}", file=sys.stderr)
    else:
        print("[auto_compact] No transcript_path in stdin", file=sys.stderr)

    # Generate summary
    summary = None
    if messages:
        conversation_text = format_for_summary(messages, keep_last=20)
        print("[auto_compact] Generating summary with Claude Haiku...", file=sys.stderr)
        summary = generate_summary(conversation_text, meta)
        if summary:
            print(f"[auto_compact] Summary generated ({len(summary)} chars)", file=sys.stderr)
        else:
            print("[auto_compact] Summary generation failed, saving basic recovery marker", file=sys.stderr)

    # Save recovery file
    RECOVERY_FILE.parent.mkdir(parents=True, exist_ok=True)
    recovery_data = {
        "timestamp": datetime.now().isoformat(),
        "session_id": session_id,
        "git_branch": git_branch,
        "cwd": meta.get("cwd", ""),
        "message_count": len(messages),
        "summary": summary or "",
        "summary_length": len(summary) if summary else 0,
        "recovered": False,
        "auto_compact_triggered": True,
    }

    with open(RECOVERY_FILE, "w", encoding="utf-8") as f:
        json.dump(recovery_data, f, indent=2, ensure_ascii=False)

    print(f"[auto_compact] Recovery file saved", file=sys.stderr)
    sys.exit(0)


if __name__ == "__main__":
    main()
