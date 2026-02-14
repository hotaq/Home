# Stability Checklist (Manual-first)

## A) Thread hygiene
- Keep <= 3 active issues
- One issue = one decision stream
- Close completed discussion threads

## B) Reply quality
- Every reply includes next action
- Avoid multi-trigger parsing from long reports
- Do not react to quotes/code blocks as commands

## C) Anti-chaos controls
- Cooldown per actor per thread
- Dedupe state for repeated inputs
- Unknown target => Jin proxy response

## D) Recovery
- Keep a stop list: disable cron jobs quickly
- Keep rollback notes for latest feature toggle
