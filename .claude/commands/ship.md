---
description: Run the full Dagnara quality gate (types + lint + Metro bundle + audit) before claiming done
---

Run every gate below **in order** from `DagnaraApp/`. Report each as PASS/FAIL with the actual evidence (exit code, count, HTTP status + byte size). Do NOT claim success for any gate you did not freshly run — this command exists to enforce verification-before-completion.

1. **TypeScript** — `npx tsc --noEmit` from `DagnaraApp/`. Expect exit 0. Report `TSC: PASS/FAIL (exit N)`.
2. **ESLint** — `npm run lint` from `DagnaraApp/`. Expect 0 errors (warnings allowed). Report `LINT: N errors / M warnings`.
3. **Metro bundle** — `curl -s -o /dev/null -w "%{http_code} %{size_download}" "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true&minify=false"`. Expect HTTP 200 and ~11.5MB (11500000+ bytes). If HTTP 500, fetch the JSON error and diagnose. If connection refused, the server is down — tell the user to run `/live`.
4. **Production audit** — invoke the `production-audit` skill (dagnara-kit) on whatever changed this session. Surface any correctness/readiness issues.

After all four: print a one-line summary `SHIP: ✅ all gates green` or `SHIP: ❌ blocked by [gate]`. Only commit if the user asked and all gates are green. End with the self-evaluation protocol (Confidence X/10 + Uncertain + Verify).

$ARGUMENTS
