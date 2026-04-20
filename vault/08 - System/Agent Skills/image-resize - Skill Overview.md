---
tool: image-resize
type: npm
repo: ~/clawd/openclaw/projects/mani-plus-agent
script: image:resize
free: true
open_source: true
tags: [tool, media, npm]
up: Agent Skills Hub
---

# image-resize

> Resize, crop, and convert images using Sharp (libvips-based, fast, open source).

## Invocation

```bash
cd ~/clawd/openclaw/projects/mani-plus-agent
npm run image:resize -- --input path/to/image.jpg --output path/to/out.jpg --width 1280 --height 720
```

## Inputs

| Flag | Type | Required | Notes |
|---|---|---|---|
| `--input` | path | yes | Source image (jpg, png, webp, avif, tiff) |
| `--output` | path | yes | Output path — extension determines format |
| `--width` | int | no | Target width in px |
| `--height` | int | no | Target height in px |
| `--format` | string | no | Override format: `jpg`, `png`, `webp` |

## Outputs

Resized image at `--output`. Crop strategy: `cover` (fills target dimensions, centres subject).

## Common presets

| Use case | Flags |
|---|---|
| YouTube thumbnail | `--width 1280 --height 720` |
| YouTube short cover | `--width 1080 --height 1920` |
| Square social | `--width 1080 --height 1080` |
| WebP for web | `--format webp --width 800` |

## Notes

- No API key, no external calls — runs entirely locally via libvips
- Sharp preserves EXIF data by default; add `--no-exif` flag if stripping is needed
