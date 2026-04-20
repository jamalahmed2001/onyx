---
tool: notify
type: bash
free: true
open_source: true
tags: [tool, notification, bash]
up: Agent Skills Hub
---

# notify

> Send a WhatsApp message to Jamal via the OpenClaw Gateway. Use to signal phase completion, blockers, or alerts from long-running pipeline stages.

## Invocation

```bash
~/clawd/skills/gateway-notify/scripts/notify.sh "Your message here"
```

## Inputs

| Arg | Type | Notes |
|---|---|---|
| message | string | The text to send |
| `--target` | e164 number | Optional. Default: `+447743183601` (Jamal) |

## Outputs

Sends WhatsApp message. Prints delivery status to stdout.

## Notes

- Use sparingly — for blockers, completion of long stages (audio, video render), or human-approval requests
- Do not notify on every task completion — only at phase boundaries or when human action is needed
- If the gateway is unreachable, the script exits non-zero; handle gracefully in pipelines
- See `gateway-notify` skill for full options including custom targets and channels
