#!/usr/bin/env python3
"""
UserPromptSubmit hook -- intent router.

Reads the user's prompt and, when it clearly matches a known workflow, injects a
single-line reminder into the assistant's context naming the skill it should
invoke BEFORE responding. This closes the gap where the right skill exists but
doesn't reliably fire.

Design rules:
  - Inject at most ONE reminder (the highest-priority match) to avoid noise.
  - Stay silent on ambiguous / chit-chat prompts -- a wrong nudge is worse than none.
  - Never block; this hook only adds context (exit 0 always).
  - Process skills win over implementation skills (debug/brainstorm before build/polish).
"""
import json
import re
import sys

# Ordered by priority. First match wins. Each entry: (compiled regex, reminder line).
# Process skills first (they decide HOW to approach), then implementation skills.
RULES = [
    # --- Process: debugging (highest priority -- a bug derails everything else) ---
    (re.compile(r"\b(bug|broken|crash|error|fails?|failing|not working|doesn'?t work|"
                r"unexpected|wrong|regression|stuck|why (is|does|won'?t)|HTTP 500|red screen)\b", re.I),
     "[router] This looks like a defect. Invoke `superpowers:systematic-debugging` and find root cause BEFORE any fix."),

    # --- Process: completion / shipping claims ---
    (re.compile(r"\b(ship it|is it done|are you (sure|done)|verify|confirm it works|"
                r"ready to (commit|push|ship)|done\??$)\b", re.I),
     "[router] A completion claim is implied. Invoke `superpowers:verification-before-completion` -- run the gate, show evidence, no claims without fresh output."),

    # --- Process: planning a non-trivial build ---
    (re.compile(r"\b(let'?s build|new (screen|feature|flow|tab|component)|add (a|an|the) .*(screen|feature|flow)|"
                r"design (a|the)|plan (out|the)|implement (a|the) )\b", re.I),
     "[router] Non-trivial build. Start with `superpowers:brainstorming`, then `superpowers:writing-plans` before coding."),

    # --- Implementation: UI polish / feel ---
    (re.compile(r"\b(feels? (flat|off|cheap|unpolished)|polish|make it (nicer|feel|pop|premium)|"
                r"animation|transition|micro-?interaction|motion|smoother)\b", re.I),
     "[router] UI-feel work. Invoke `dagnara-kit:make-interfaces-feel-better` (and `motion-ui` if animating)."),

    # --- Implementation: audit / review ---
    (re.compile(r"\b(audit|review|sweep|production[- ]ready|dead code|is this (safe|correct|scalable)|"
                r"clean ?up|refactor sweep)\b", re.I),
     "[router] Audit request. Invoke `dagnara-kit:production-audit` for the correctness/readiness sweep."),

    # --- Implementation: click-path / UX flow check ---
    (re.compile(r"\b(click ?path|user flow|navigation|can the user|tap through|end-?to-?end UX)\b", re.I),
     "[router] Flow check. Invoke `dagnara-kit:click-path-audit` to trace the user journey."),

    # --- Implementation: external API / library docs ---
    (re.compile(r"\b(expo|react native|\brn\b|supabase|zustand|reanimated)\b.*\b(api|version|how (do|to)|docs?|"
                r"latest|current|new (method|hook|prop))\b", re.I),
     "[router] Touching an external API. Use `context7` MCP (dagnara-kit) for live docs before relying on memory."),

    # --- Implementation: research / competitors ---
    (re.compile(r"\b(research|competitor|what do other apps|best practice for|how do (apps|others)|market|benchmark)\b", re.I),
     "[router] Research request. Invoke `dagnara-kit:search-first`."),
]


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    prompt = (data.get("prompt") or "").strip()
    if not prompt or len(prompt) < 4:
        sys.exit(0)

    # Slash commands carry their own instructions -- don't second-guess them.
    if prompt.startswith("/"):
        sys.exit(0)

    for pattern, reminder in RULES:
        if pattern.search(prompt):
            print(json.dumps({
                "hookSpecificOutput": {
                    "hookEventName": "UserPromptSubmit",
                    "additionalContext": reminder,
                }
            }))
            sys.exit(0)

    sys.exit(0)


if __name__ == "__main__":
    main()
