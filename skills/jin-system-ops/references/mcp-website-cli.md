# MCP Website CLI Plan

Goal: provide a CLI layer for website-related MCP operations with strict reliability.

## Suggested command set (v1)
- `webctl status` - show connected MCP servers and tools
- `webctl list-tools` - list callable website tools
- `webctl call <tool> --json <payload>` - execute a tool call
- `webctl inspect <tool>` - show params/schema

## Build order
1) Discovery wrapper (list servers/tools)
2) Typed call wrapper with validation
3) Safe presets for common website tasks
4) Logging + replay support

## Safety
- Validate JSON payload before call
- Timeout defaults + retries (bounded)
- Redact secrets in logs

## KPI
- 95% successful tool invocations on known-good payloads
- <1% duplicate/retry noise
