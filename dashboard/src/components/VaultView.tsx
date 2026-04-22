'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { VaultGraphNode, VaultGraphLink } from '@/app/api/onyx/vault-graph/route';

interface Props { onOpenFile: (path: string) => void }

// ── Tree model ────────────────────────────────────────────────────────────────
// Radial dendrogram: every subtree receives an angular wedge proportional to
// its leaf-count, and nodes sit on concentric rings whose radius grows
// monotonically (and slightly super-linearly) with depth. Deeper = further
// away, siblings always have angular separation, no crowding.

interface TNode {
  node: VaultGraphNode;
  depth: number;
  children: TNode[];
  leafCount: number;
  angle: number;          // math convention: π/2 = straight up
  radius: number;         // distance from origin
  px: number;
  py: number;
  parent: TNode | null;
}

function findRoot(nodes: VaultGraphNode[]): VaultGraphNode | null {
  return nodes.find(n => /dashboard/i.test(n.label) && /^00/.test(n.topFolder))
      ?? nodes.find(n => /^00/.test(n.topFolder))
      ?? nodes[0]
      ?? null;
}

function buildTree(nodes: VaultGraphNode[], links: VaultGraphLink[]): TNode | null {
  const root = findRoot(nodes);
  if (!root) return null;

  const adj = new Map<string, Set<string>>();
  for (const l of links) {
    if (l.source === l.target) continue;
    if (!adj.has(l.source)) adj.set(l.source, new Set());
    if (!adj.has(l.target)) adj.set(l.target, new Set());
    adj.get(l.source)!.add(l.target);
    adj.get(l.target)!.add(l.source);
  }

  const byId = new Map(nodes.map(n => [n.id, n]));
  const visited = new Set<string>([root.id]);
  const rootT: TNode = { node: root, depth: 0, children: [], leafCount: 0, angle: Math.PI / 2, radius: 0, px: 0, py: 0, parent: null };
  const queue: TNode[] = [rootT];

  while (queue.length) {
    const cur = queue.shift()!;
    const neighs = adj.get(cur.node.id);
    if (!neighs) continue;
    const kids = [...neighs]
      .filter(id => !visited.has(id) && byId.has(id))
      .sort((a, b) => {
        const na = byId.get(a)!, nb = byId.get(b)!;
        return (nb.linkCount - na.linkCount) || na.label.localeCompare(nb.label);
      });
    for (const id of kids) {
      visited.add(id);
      const child: TNode = { node: byId.get(id)!, depth: cur.depth + 1, children: [], leafCount: 0, angle: 0, radius: 0, px: 0, py: 0, parent: cur };
      cur.children.push(child);
      queue.push(child);
    }
  }

  const measure = (t: TNode): number => {
    if (!t.children.length) return t.leafCount = 1;
    t.leafCount = t.children.reduce((s, c) => s + measure(c), 0);
    return t.leafCount;
  };
  measure(rootT);

  return rootT;
}

interface LayoutParams {
  fanRad: number;       // total angular spread (bottom-rooted, centered on up)
  baseRadius: number;   // distance to first ring (depth 1)
  levelGap: number;     // linear gap between consecutive rings
  depthBoost: number;   // super-linear term: extra gap at deeper levels
}

function layoutDendrogram(root: TNode, p: LayoutParams) {
  // 1. Angular allocation — each subtree gets a wedge ∝ its leaf-count.
  //    Recursion places the parent at the centre of its wedge.
  const start = Math.PI / 2 - p.fanRad / 2;
  const end   = Math.PI / 2 + p.fanRad / 2;
  const allocate = (t: TNode, a0: number, a1: number) => {
    t.angle = (a0 + a1) / 2;
    if (!t.children.length) return;
    const totalW = t.children.reduce((s, c) => s + Math.max(1, c.leafCount), 0) || 1;
    let run = a0;
    for (const c of t.children) {
      const w = Math.max(1, c.leafCount) / totalW;
      const span = (a1 - a0) * w;
      allocate(c, run, run + span);
      run += span;
    }
  };
  allocate(root, start, end);

  // 2. Radius — monotonic in depth, slightly super-linear so deeper rings
  //    are physically larger and never crowded.
  const radiusAt = (d: number): number => {
    if (d === 0) return 0;
    return p.baseRadius + (d - 1) * p.levelGap + Math.pow(d - 1, 1.6) * p.depthBoost;
  };

  // 3. Polar → Cartesian. Screen y flips (math π/2 = up, SVG y-down).
  const walk = (t: TNode) => {
    t.radius = radiusAt(t.depth);
    t.px = Math.cos(t.angle) * t.radius;
    t.py = -Math.sin(t.angle) * t.radius;
    for (const c of t.children) walk(c);
  };
  walk(root);
}

function flatten(root: TNode | null): { tnodes: TNode[]; tedges: Array<{ from: TNode; to: TNode }>; maxDepth: number } {
  const tnodes: TNode[] = [];
  const tedges: Array<{ from: TNode; to: TNode }> = [];
  let maxDepth = 0;
  const walk = (n: TNode) => {
    tnodes.push(n);
    if (n.depth > maxDepth) maxDepth = n.depth;
    for (const c of n.children) { tedges.push({ from: n, to: c }); walk(c); }
  };
  if (root) walk(root);
  return { tnodes, tedges, maxDepth };
}

// ── Colors ────────────────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  '00': '#4493f8', '01': '#30d158', '02': '#b478ff', '03': '#ff9f0a',
  '04': '#00dcb4', '05': '#30d158', '08': '#dc6e6e', '09': '#787878', '10': '#ffc850',
};
function colorFor(n: VaultGraphNode): string {
  const prefix = n.topFolder.match(/^(\d{2})/)?.[1];
  return (prefix && DOMAIN_COLORS[prefix]) ?? '#9aa4b2';
}

// ── Pointer helpers ──────────────────────────────────────────────────────────

interface Pan { x: number; y: number; k: number }
interface DragState { px: number; py: number; tx: number; ty: number; moved: boolean }
interface PinchState { d0: number; k0: number; mx: number; my: number; tx0: number; ty0: number }

// ── Component ────────────────────────────────────────────────────────────────

export default function VaultView({ onOpenFile }: Props) {
  const [rawNodes, setRawNodes] = useState<VaultGraphNode[]>([]);
  const [rawLinks, setRawLinks] = useState<VaultGraphLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [hover, setHover] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0, k: 1 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const pinchRef = useRef<PinchState | null>(null);
  const fittedRef = useRef(false);

  // Sliders
  const [fanDeg,     setFanDeg]     = useState(230);
  const [baseRadius, setBaseRadius] = useState(170);
  const [levelGap,   setLevelGap]   = useState(150);
  const [depthBoost, setDepthBoost] = useState(40);
  const [sizeK,      setSizeK]      = useState(6);
  const [labelDepth, setLabelDepth] = useState(6);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/onyx/vault-graph').then(r => r.json()).then(({ nodes, links }: { nodes: VaultGraphNode[]; links: VaultGraphLink[] }) => {
      if (cancelled) return;
      setRawNodes(nodes); setRawLinks(links); setLoading(false);
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewport({ w: r.width, h: r.height });
    });
    obs.observe(el);
    const r = el.getBoundingClientRect();
    setViewport({ w: r.width, h: r.height });
    return () => obs.disconnect();
  }, []);

  const root = useMemo(() => buildTree(rawNodes, rawLinks), [rawNodes, rawLinks]);

  const layoutResult = useMemo(() => {
    if (!root) return { root: null, bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 } };
    layoutDendrogram(root, {
      fanRad:     (fanDeg * Math.PI) / 180,
      baseRadius,
      levelGap,
      depthBoost,
    });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const stack = [root];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.px < minX) minX = n.px; if (n.px > maxX) maxX = n.px;
      if (n.py < minY) minY = n.py; if (n.py > maxY) maxY = n.py;
      for (const c of n.children) stack.push(c);
    }
    return { root, bounds: { minX, maxX, minY, maxY } };
  }, [root, fanDeg, baseRadius, levelGap, depthBoost]);

  const { tnodes, tedges, maxDepth } = useMemo(() => flatten(layoutResult.root), [layoutResult.root]);
  const bounds = layoutResult.bounds;

  const fit = useCallback(() => {
    if (!viewport.w || !viewport.h || !tnodes.length) return;
    const treeW = Math.max(1, bounds.maxX - bounds.minX);
    const treeH = Math.max(1, bounds.maxY - bounds.minY);
    const PAD = 60;
    const k = Math.min((viewport.w - PAD * 2) / treeW, (viewport.h - PAD * 2) / treeH, 1.4);
    const cxT = (bounds.minX + bounds.maxX) / 2;
    const cyT = (bounds.minY + bounds.maxY) / 2;
    setPan({ x: viewport.w / 2 - cxT * k, y: viewport.h / 2 - cyT * k, k });
  }, [viewport.w, viewport.h, bounds.minX, bounds.maxX, bounds.minY, bounds.maxY, tnodes.length]);

  useEffect(() => {
    if (fittedRef.current || !tnodes.length) return;
    fit();
    fittedRef.current = true;
  }, [tnodes.length, fit]);

  useEffect(() => {
    if (!fittedRef.current) return;
    fit();
  }, [fanDeg, baseRadius, levelGap, depthBoost, fit]);

  // Mouse pan
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { px: e.clientX, py: e.clientY, tx: pan.x, ty: pan.y, moved: false };
  }, [pan.x, pan.y]);
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (!d.moved && dx * dx + dy * dy > 9) d.moved = true;
    if (d.moved) setPan(t => ({ ...t, x: d.tx + dx, y: d.ty + dy }));
  }, []);
  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  // Touch: one-finger pan, two-finger pinch
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const t = e.touches[0];
        dragRef.current = { px: t.clientX, py: t.clientY, tx: pan.x, ty: pan.y, moved: false };
        pinchRef.current = null;
      } else if (e.touches.length >= 2) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const mx = (t0.clientX + t1.clientX) / 2, my = (t0.clientY + t1.clientY) / 2;
        const d0 = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1;
        pinchRef.current = { d0, k0: pan.k, mx, my, tx0: pan.x, ty0: pan.y };
        dragRef.current = null;
      }
      e.preventDefault();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pinchRef.current && e.touches.length >= 2) {
        const t0 = e.touches[0], t1 = e.touches[1];
        const d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY) || 1;
        const { d0, k0, mx, my, tx0, ty0 } = pinchRef.current;
        const k = Math.max(0.1, Math.min(6, k0 * (d / d0)));
        const rect = el.getBoundingClientRect();
        const ax = mx - rect.left, ay = my - rect.top;
        const ratio = k / k0;
        setPan({ x: ax - (ax - tx0) * ratio, y: ay - (ay - ty0) * ratio, k });
      } else if (dragRef.current && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - dragRef.current.px;
        const dy = t.clientY - dragRef.current.py;
        if (!dragRef.current.moved && dx * dx + dy * dy > 16) dragRef.current.moved = true;
        if (dragRef.current.moved) {
          const d = dragRef.current;
          setPan(pp => ({ ...pp, x: d.tx + dx, y: d.ty + dy }));
        }
      }
      e.preventDefault();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        dragRef.current = null;
        pinchRef.current = null;
      } else if (e.touches.length === 1 && pinchRef.current) {
        const t = e.touches[0];
        dragRef.current = { px: t.clientX, py: t.clientY, tx: pan.x, ty: pan.y, moved: true };
        pinchRef.current = null;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: false });
    el.addEventListener('touchcancel', onTouchEnd,  { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [pan.x, pan.y, pan.k]);

  // Wheel zoom around cursor
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setPan(t => {
        const factor = Math.exp(-e.deltaY * 0.0015);
        const k = Math.max(0.12, Math.min(8, t.k * factor));
        const ratio = k / t.k;
        return { x: mx - (mx - t.x) * ratio, y: my - (my - t.y) * ratio, k };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const matches = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const s = new Set<string>();
    for (const n of tnodes) if (n.node.label.toLowerCase().includes(q) || n.node.id.toLowerCase().includes(q)) s.add(n.node.id);
    return s;
  }, [search, tnodes]);

  const hovChain = useMemo(() => {
    if (!hover) return null;
    const byId = new Map(tnodes.map(n => [n.node.id, n]));
    const chain = new Set<string>([hover]);
    let cur = byId.get(hover)?.parent;
    while (cur) { chain.add(cur.node.id); cur = cur.parent; }
    return chain;
  }, [hover, tnodes]);

  const handleNodeClick = (id: string) => {
    if (dragRef.current?.moved || pinchRef.current) return;
    onOpenFile(id);
  };

  const labelFont = (depth: number) => Math.max(8, 14 - depth * 0.8);
  const cleanLabel = (l: string) => l.replace(/\.md$/i, '').replace(/^\d+\s*[-–]\s*/, '');

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0d1117', overflow: 'hidden' }}>

      {/* Top control bar */}
      <div style={{
        position: 'absolute', top: 10, left: 12, right: 12, zIndex: 10,
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            width: 160, padding: '5px 10px', borderRadius: 5,
            border: '1px solid rgba(48,54,61,0.9)', background: 'rgba(22,27,34,0.9)',
            color: '#e6edf3', fontSize: 11, outline: 'none', fontFamily: 'inherit',
            backdropFilter: 'blur(6px)',
          }}
        />
        {([
          { label: 'Fan',     val: fanDeg,     set: setFanDeg,     min: 90,  max: 340, step: 5,  unit: '°' },
          { label: 'Base',    val: baseRadius, set: setBaseRadius, min: 60,  max: 360, step: 10, unit: ''  },
          { label: 'Gap',     val: levelGap,   set: setLevelGap,   min: 40,  max: 320, step: 10, unit: ''  },
          { label: 'Boost',   val: depthBoost, set: setDepthBoost, min: 0,   max: 140, step: 5,  unit: ''  },
          { label: 'Size',    val: sizeK,      set: setSizeK,      min: 3,   max: 14,  step: 1,  unit: ''  },
          { label: 'Labels',  val: labelDepth, set: setLabelDepth, min: 1,   max: 12,  step: 1,  unit: ''  },
        ] as const).map(s => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(22,27,34,0.85)', border: '1px solid rgba(48,54,61,0.8)',
            borderRadius: 5, padding: '3px 8px', backdropFilter: 'blur(4px)',
          }}>
            <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.85)' }}>{s.label}</span>
            <input
              type="range"
              min={s.min} max={s.max} step={s.step}
              value={s.val}
              onChange={e => (s.set as (v: number) => void)(Number(e.target.value))}
              style={{ width: 72, accentColor: '#4493f8', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.85)', fontFamily: 'monospace', minWidth: 26, textAlign: 'right' }}>
              {s.val}{s.unit}
            </span>
          </div>
        ))}
        <button onClick={() => { fittedRef.current = false; fit(); fittedRef.current = true; }} style={{
          padding: '5px 11px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid rgba(48,54,61,0.8)', background: 'rgba(22,27,34,0.85)',
          color: 'rgba(200,210,220,0.9)', backdropFilter: 'blur(4px)',
        }}>Fit</button>
        {!loading && (
          <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.55)' }}>
            {tnodes.length} nodes · depth {maxDepth}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(139,148,158,0.6)', fontSize: 12 }}>
          Parsing vault…
        </div>
      )}

      <div
        ref={wrapRef}
        style={{
          position: 'absolute', inset: 0,
          cursor: dragRef.current?.moved ? 'grabbing' : 'grab',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
      >
        <svg width={viewport.w || 1} height={viewport.h || 1} style={{ display: 'block' }}>
          <g transform={`translate(${pan.x},${pan.y}) scale(${pan.k})`}>

            {/* Edges: radial-arc-radial bezier (the classic dendrogram curve) */}
            <g fill="none" strokeLinecap="round">
              {tedges.map(({ from, to }) => {
                // Control points live at an intermediate radius, one on each end's angle.
                // Produces a smooth "radial-out, sweep-to-child, radial-in" curve.
                const midR = from.radius + (to.radius - from.radius) * 0.55;
                const cx1 = Math.cos(from.angle) * midR;
                const cy1 = -Math.sin(from.angle) * midR;
                const cx2 = Math.cos(to.angle) * midR;
                const cy2 = -Math.sin(to.angle) * midR;
                const path = `M ${from.px},${from.py} C ${cx1},${cy1} ${cx2},${cy2} ${to.px},${to.py}`;
                const highlighted = !!hovChain && hovChain.has(from.node.id) && hovChain.has(to.node.id);
                const dimmed = (matches && !matches.has(from.node.id) && !matches.has(to.node.id))
                            || (hovChain && !highlighted);
                const baseW = Math.max(0.7, 3.4 - to.depth * 0.4);
                return (
                  <path
                    key={`${from.node.id}->${to.node.id}`}
                    d={path}
                    stroke={highlighted ? colorFor(to.node) : '#30363d'}
                    strokeOpacity={dimmed ? 0.08 : highlighted ? 0.9 : 0.42}
                    strokeWidth={highlighted ? baseW + 1 : baseW}
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g>
              {tnodes.map(t => {
                const col = colorFor(t.node);
                const isRoot = t.depth === 0;
                const isLeaf = !t.children.length;
                const isHov = hover === t.node.id;
                const isMatch = !matches || matches.has(t.node.id);
                const inChain = !hovChain || hovChain.has(t.node.id);
                const dimmed = !isMatch || !inChain;
                const baseR = sizeK * (isRoot ? 2.4 : Math.max(0.55, 1.25 - t.depth * 0.09));
                const r = baseR + (isLeaf ? 0 : Math.min(5, t.node.linkCount * 0.18));
                const showLabel = isRoot || isHov || !!matches?.has(t.node.id) || t.depth <= labelDepth;
                const font = labelFont(t.depth);
                const label = cleanLabel(t.node.label);
                return (
                  <g
                    key={t.node.id}
                    transform={`translate(${t.px},${t.py})`}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => setHover(t.node.id)}
                    onMouseLeave={() => setHover(h => (h === t.node.id ? null : h))}
                    onClick={() => handleNodeClick(t.node.id)}
                    opacity={dimmed ? 0.2 : 1}
                  >
                    {(isRoot || isHov) && (
                      <circle r={r + 11} fill={col} opacity={0.18}/>
                    )}
                    <circle
                      r={r}
                      fill={col}
                      stroke={isRoot ? '#e6edf3' : isHov ? col : 'rgba(13,17,23,0.9)'}
                      strokeWidth={isRoot ? 2 : isHov ? 2 : 1.2}
                    />
                    {showLabel && (
                      <text
                        x={0}
                        y={r + font + 2}
                        textAnchor="middle"
                        fontSize={isRoot ? font + 3 : font}
                        fontWeight={isRoot ? 600 : isHov ? 600 : 400}
                        fontFamily="system-ui,sans-serif"
                        fill={isHov || isRoot ? '#e6edf3' : 'rgba(210,220,230,0.88)'}
                        style={{ paintOrder: 'stroke', stroke: '#0d1117', strokeWidth: 3, strokeLinejoin: 'round' } as React.CSSProperties}
                      >
                        {label.length > 32 ? label.slice(0, 32) + '…' : label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>

          </g>
        </svg>
      </div>

      <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 10, color: 'rgba(139,148,158,0.4)', userSelect: 'none', pointerEvents: 'none' }}>
        drag / one-finger pan · scroll or pinch to zoom · tap a node to open
      </div>
    </div>
  );
}
