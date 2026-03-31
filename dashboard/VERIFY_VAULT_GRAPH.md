# Verify: Vault graph hubs (hierarchical + coloured)

## Build/typecheck

```bash
cd groundzeroOS-starter/dashboard
npm run build
```

## Runtime check

```bash
cd groundzeroOS-starter/dashboard
npm run dev
# open http://localhost:3000
```

### What to look for

1. Graph view shows **top-level hubs** (hubLevel=1) and **sub-hubs** (hubLevel=2).
2. Connections are **hub → sub-hub → project → phase** (where sub-hubs exist).
3. Hub nodes are **coloured deterministically** (stable across refreshes for the same folder prefix).
4. `/api/gz/vault-graph` returns JSON with the same top-level shape:

```json
{ "nodes": [...], "edges": [...] }
```

(Additional optional fields on nodes: `color`, `hubLevel`.)
