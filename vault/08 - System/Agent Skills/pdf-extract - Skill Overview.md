---
tool: pdf-extract
type: bash
free: true
open_source: true
tags: [tool, research, bash]
up: Agent Skills Hub
---

# pdf-extract

> Extract plain text from a PDF file using `pdftotext` (poppler-utils). Installed at `/usr/bin/pdftotext`.

## Invocation

```bash
# Print to stdout
pdftotext /path/to/document.pdf -

# Write to file
pdftotext /path/to/document.pdf /path/to/output.txt

# Preserve layout (useful for tables)
pdftotext -layout /path/to/document.pdf -
```

## Inputs

| Arg | Type | Notes |
|---|---|---|
| input path | string | Path to the PDF file |
| output path | string | Path to write text, or `-` for stdout |
| `-layout` | flag | Preserve column/table layout |
| `-f N` | flag | First page to extract |
| `-l N` | flag | Last page to extract |

## Outputs

Plain text content of the PDF. Encoding: UTF-8.

## Notes

- Works on most text-based PDFs; scanned PDFs require OCR (not covered by this tool)
- Combine with `web-fetch` to download a PDF then extract: `curl -sL <url> -o /tmp/paper.pdf && pdftotext /tmp/paper.pdf -`
- For large PDFs, use `-f` and `-l` to extract specific pages
