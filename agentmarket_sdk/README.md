# agentmarket_sdk — reference copy for sellers

This is a **development-only reference copy** of the platform SDK, mirrored from
`review-agent/app/vendor/agentmarket_sdk/` (the trusted source of truth).

Copy this folder into the root of your agent project so `from agentmarket_sdk import sdk`
resolves locally while you build and test. When you submit your agent, **review-agent always
strips whatever copy you bring and injects its own trusted copy into the build context before
building your image** — see `SELLER_GUIDE.md`. So:

- Do bring this copy for local development (imports resolve, you can read the real
  `task_input()`/`set_progress()`/`log()`/`complete()`/`upload_file()` signatures).
- Don't modify it and expect your changes to survive into the reviewed/built image — they
  won't, by design, so a malicious or buggy SDK copy can never reach production.

If this folder and `review-agent/app/vendor/agentmarket_sdk/` ever drift apart, the vendored
copy inside `review-agent/` is authoritative — this one should be updated to match it, not the
other way around.
