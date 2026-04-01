'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import type { VaultFileNode } from '@/lib/types';
import type { VaultGraphNode, VaultGraphLink } from '@/app/api/gz/vault-graph/route';
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY,
  type Simulation,
} from 'd3-force';

interface Props { tree: VaultFileNode[]; onOpenFile: (path: string) => void }

// ─── Tree ─────────────────────────────────────────────────────────────────────

function TreeNode({ node, depth, onOpen }: { node: VaultFileNode; depth: number; onOpen: (p: string) => void }) {
  const [open, setOpen] = useState(depth < 1);
  const isOverview = /overview/i.test(node.name);
  const isPhase    = /^p\d+|^phase\s*\d+/i.test(node.name);

  if (node.kind === 'dir') return (
    <div>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 6px', paddingLeft: 6 + depth * 14, cursor: 'pointer', borderRadius: 4, color: 'var(--text-dim)', fontSize: 12 }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ color: 'var(--text-faint)', width: 12, flexShrink: 0 }}>{open ? <ChevronDown size={10}/> : <ChevronRight size={10}/>}</span>
        <span style={{ color: open ? 'var(--accent)' : 'var(--text-dim)', flexShrink: 0, marginRight: 2 }}>{open ? <FolderOpen size={12}/> : <Folder size={12}/>}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'monospace' }}>{node.children?.length ?? 0}</span>
      </div>
      {open && node.children?.map(c => <TreeNode key={c.path} node={c} depth={depth + 1} onOpen={onOpen}/>)}
    </div>
  );

  return (
    <div onClick={() => onOpen(node.path)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 6px', paddingLeft: 6 + depth * 14, cursor: 'pointer', borderRadius: 4, color: isOverview ? 'var(--accent)' : isPhase ? 'var(--text-str)' : 'var(--text-dim)', fontSize: 12 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <FileText size={10} style={{ color: 'var(--text-faint)', flexShrink: 0, marginLeft: 12 }}/>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
    </div>
  );
}

// ─── Color system (ported from original OpenClaw dashboard) ───────────────────

// Domain → [hue, saturation, lightness]
const DOMAIN_HSL: Record<string, [number, number, number]> = {
  '00 - Dashboard': [211, 100, 52],
  '01 - Life':      [145, 65, 50],
  '02 - Fanvue':    [270, 68, 65],
  '03 - Ventures':  [34,  92, 52],
  '04 - Planning':  [195, 82, 67],
  '05 - Finance':   [145, 65, 50],
  '08 - System':    [242, 56, 63],
  '09 - Archive':   [240, 2,  40],
  '10 - OpenClaw':  [211, 100, 52],
  Fanvue:           [270, 68, 65],
  Ventures:         [34,  92, 52],
  OpenClaw:         [211, 100, 52],
  Other:            [240, 10, 45],
  Root:             [240, 2,  40],
};

// Phase status → [r, g, b]
const PHASE_RGB: Record<string, [number, number, number]> = {
  active:   [10, 132, 255],
  running:  [10, 132, 255],
  blocked:  [255, 69, 58],
  complete: [48, 209, 88],
  done:     [48, 209, 88],
  planned:  [99, 99, 102],
  ready:    [90, 200, 250],
  pending:  [255, 159, 10],
  backlog:  [99, 99, 102],
  planning: [255, 159, 10],
};
const FALLBACK_RGB: [number, number, number] = [99, 99, 102];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const folderRgbCache = new Map<string, [number, number, number]>();

function folderToRgb(folder: string, topFolder: string): [number, number, number] {
  const cached = folderRgbCache.get(folder);
  if (cached) return cached;

  // Get base hsl from domain
  let baseHsl: [number, number, number] = [240, 2, 40];
  for (const [key, val] of Object.entries(DOMAIN_HSL)) {
    if (topFolder === key || topFolder.startsWith(key)) { baseHsl = val; break; }
  }
  const [bh, bs, bl] = baseHsl;

  let rgb: [number, number, number];
  const parts = folder.split('/');
  if (parts.length <= 1) {
    rgb = hslToRgb(bh, bs, bl);
  } else {
    const sub = parts.slice(1, 3).join('/');
    const dh = hashStr(sub) % 60 - 30;
    const ds = hashStr(sub + '_s') % 16 - 8;
    const dl = hashStr(sub + '_l') % 10 - 5;
    rgb = hslToRgb(bh + dh, Math.max(25, Math.min(95, bs + ds)), Math.max(35, Math.min(72, bl + dl)));
  }
  folderRgbCache.set(folder, rgb);
  return rgb;
}

function nodeRgb(n: VaultGraphNode): [number, number, number] {
  if (n.isPhase && n.phaseStatus) return PHASE_RGB[n.phaseStatus] ?? FALLBACK_RGB;
  return folderToRgb(n.folder, n.topFolder || n.folder.split('/')[0] || 'Root');
}

function rgba(rgb: [number, number, number], a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
}

// ── Spread → force params ──────────────────────────────────────────────────────

function spreadParams(spread: number) {
  const t = (spread - 1) / 9; // 0..1
  return {
    charge:    -(40 + t * 280),      // -40 to -320
    linkDist:  25 + t * 100,         // 25 to 125
    collide:   5 + t * 8,            // 5 to 13
    centerStr: 0.03 + t * 0.05,      // 0.03 to 0.08
  };
}

// ── D3 node type ───────────────────────────────────────────────────────────────

interface D3Node extends VaultGraphNode {
  x: number; y: number; vx: number; vy: number; fx?: number | null; fy?: number | null;
}

interface D3Link { source: D3Node; target: D3Node }

// ─── VaultGraph ───────────────────────────────────────────────────────────────

function VaultGraph({ onOpenFile }: { onOpenFile: (p: string) => void }) {
  const wrapRef      = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const simRef       = useRef<Simulation<D3Node, D3Link> | null>(null);
  const nodesRef     = useRef<D3Node[]>([]);
  const linksRef     = useRef<D3Link[]>([]);
  const xfRef        = useRef({ x: 0, y: 0, k: 1 });        // current camera
  const xfTargetRef  = useRef({ x: 0, y: 0, k: 1 });        // animated camera target
  const sizeRef      = useRef({ w: 0, h: 0 });
  const dragRef      = useRef<{ node: D3Node | null; ox: number; oy: number } | null>(null);
  const panRef       = useRef({ active: false, sx: 0, sy: 0, stx: 0, sty: 0 });
  const hovRef       = useRef<D3Node | null>(null);
  const dirtyRef     = useRef(false);
  const rafRef       = useRef<number>(0);
  const animRef      = useRef(false); // camera animation active
  const didMoveRef   = useRef(false); // true if pointer moved enough to be a drag
  const downPosRef   = useRef({ x: 0, y: 0 }); // mousedown position for click vs drag

  const [loading, setLoading]     = useState(true);
  const [spread, setSpread]       = useState(5);
  const [nodeSize, setNodeSize]   = useState(5);  // 1–10 multiplier
  const [showLabels, setShowLabels] = useState(true);
  const [connOnly, setConnOnly]   = useState(true);
  const [search, setSearch]       = useState('');
  const [tooltip, setTooltip]     = useState<{ x: number; y: number; label: string; sub: string } | null>(null);

  // Raw data from API
  const [rawNodes, setRawNodes] = useState<VaultGraphNode[]>([]);
  const [rawLinks, setRawLinks] = useState<VaultGraphLink[]>([]);

  // Set of connected node IDs
  const connectedIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of rawLinks) { s.add(l.source); s.add(l.target); }
    return s;
  }, [rawLinks]);

  // Active nodes/links based on connOnly filter
  const activeNodes = useMemo(
    () => connOnly ? rawNodes.filter(n => connectedIds.has(n.id)) : rawNodes,
    [rawNodes, connOnly, connectedIds],
  );
  const activeNodeIds = useMemo(() => new Set(activeNodes.map(n => n.id)), [activeNodes]);
  const activeLinks   = useMemo(
    () => rawLinks.filter(l => activeNodeIds.has(l.source) && activeNodeIds.has(l.target)),
    [rawLinks, activeNodeIds],
  );

  // Search match set
  const matchIds = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const s = new Set<string>();
    for (const n of activeNodes) {
      if (n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) s.add(n.id);
    }
    return s;
  }, [search, activeNodes]);

  // ── Canvas setup (HiDPI) ──────────────────────────────────────────────────

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap   = wrapRef.current;
    if (!canvas || !wrap) return;
    const { width: w, height: h } = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    sizeRef.current = { w, h };
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = `${w}px`;
    canvas.style.height = `${h}px`;
    dirtyRef.current = true;
  }, []);

  // ── Draw ──────────────────────────────────────────────────────────────────

  const nodeSizeRef = useRef(5);
  useEffect(() => { nodeSizeRef.current = nodeSize; dirtyRef.current = true; }, [nodeSize]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    const dpr = window.devicePixelRatio || 1;
    const { x: tx, y: ty, k: scale } = xfRef.current;
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const hov   = hovRef.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w * dpr, h * dpr);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, tx * dpr, ty * dpr);

    const matched = matchIds;
    const dimmed  = matched ? matched.size > 0 : false;

    // ── Links ─────────────────────────────────────────────────────────────
    for (const link of links) {
      const s = link.source, t = link.target;
      if (isNaN(s.x) || isNaN(t.x)) continue;
      const isDimmed = dimmed && !matched?.has(s.id) && !matched?.has(t.id);
      const alpha = Math.min(1, (s.linkCount + t.linkCount) / 20);
      const srcRgb = nodeRgb(s);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = isDimmed
        ? 'rgba(60,60,70,0.07)'
        : rgba(srcRgb, alpha * 0.28 + (hov?.id === s.id || hov?.id === t.id ? 0.35 : 0));
      ctx.lineWidth = (0.4 + alpha * 0.5) / scale;
      ctx.stroke();
    }

    // ── Nodes ──────────────────────────────────────────────────────────────
    for (const node of nodes) {
      if (isNaN(node.x) || isNaN(node.y)) continue;
      const isConn     = connectedIds.has(node.id);
      const isHov      = hov?.id === node.id;
      const isMatched  = matched?.has(node.id) ?? true;
      const isDimmed   = dimmed && !isMatched;
      const isHub      = isConn && node.linkCount >= 6;
      const rgb        = nodeRgb(node);

      // Node radius — scaled by nodeSize slider (1–10)
      const szMul = nodeSizeRef.current / 5; // 0.2x at 1, 1x at 5, 2x at 10
      const r = isConn
        ? Math.max(3, Math.min(20, (4 + 2.5 * node.linkCount) * szMul))
        : Math.max(2, Math.min(8, (2.5 + node.size / 10000) * szMul));

      // Glow for hubs and hovered
      if ((isHub || isHov) && !isDimmed) {
        const glowR = r + (isHub ? 6 : 0) + (isHov ? 8 : 0);
        const g = ctx.createRadialGradient(node.x, node.y, r * 0.3, node.x, node.y, glowR);
        g.addColorStop(0, rgba(rgb, isHov ? 0.4 : 0.2));
        g.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
      }

      // Fill
      ctx.beginPath();
      ctx.arc(node.x, node.y, isHov ? r * 1.18 : r, 0, Math.PI * 2);
      ctx.fillStyle = isDimmed ? rgba(rgb, 0.1) : rgba(rgb, isConn ? (node.isPhase ? 0.7 : 0.9) : 0.45);
      ctx.fill();

      // Hub outer ring
      if (isHub && !isDimmed) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(rgb, 0.45);
        ctx.lineWidth = 1.2 / scale;
        ctx.stroke();
      }

      // Phase inner ring
      if (node.isPhase && !isDimmed) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r - 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(rgb, 0.6);
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }

      // Labels
      if (showLabels && !isDimmed) {
        const showLabel = isHub
          ? scale >= 0.15
          : (scale >= 0.55 || isHov);
        if (showLabel) {
          const lbl = node.label.length > 24 ? node.label.slice(0, 24) + '…' : node.label;
          ctx.font = `${isHub ? 600 : 400} ${Math.max(9, 11 / scale)}px system-ui,sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.shadowColor = '#0d1117';
          ctx.shadowBlur = 4 / scale;
          ctx.fillStyle = isHov ? '#e6edf3' : rgba(rgb, isHub ? 0.95 : 0.7);
          ctx.fillText(lbl, node.x, node.y + r + 4 / scale);
          ctx.shadowBlur = 0;
          ctx.textBaseline = 'alphabetic';
        }
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    dirtyRef.current = false;
  }, [connectedIds, matchIds, showLabels]);

  // ── RAF loop ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      rafRef.current = requestAnimationFrame(loop);

      // Smooth camera lerp — 0.2 feels responsive without being jittery
      const cur = xfRef.current, tgt = xfTargetRef.current;
      const dx = tgt.x - cur.x, dy = tgt.y - cur.y, dk = tgt.k - cur.k;
      if (Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02 || Math.abs(dk) > 0.0002) {
        xfRef.current = { x: cur.x + dx * 0.2, y: cur.y + dy * 0.2, k: cur.k + dk * 0.2 };
        dirtyRef.current = true;
      }

      if (dirtyRef.current) draw();
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [draw]);

  // ── ResizeObserver ─────────────────────────────────────────────────────────

  useEffect(() => {
    const obs = new ResizeObserver(() => { resizeCanvas(); dirtyRef.current = true; });
    if (wrapRef.current) obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, [resizeCanvas]);

  // ── Fetch + init simulation ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    fetch('/api/gz/vault-graph').then(r => r.json()).then(
      ({ nodes, links }: { nodes: VaultGraphNode[]; links: VaultGraphLink[] }) => {
        if (cancelled) return;
        setRawNodes(nodes);
        setRawLinks(links);
        setLoading(false);
      }
    ).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  // ── Rebuild simulation when nodes/links/spread change ─────────────────────

  useEffect(() => {
    if (!activeNodes.length) return;
    simRef.current?.stop();

    const { w, h } = sizeRef.current;
    const cx = w / 2 || 400, cy = h / 2 || 300;
    const { charge, linkDist, collide, centerStr } = spreadParams(spread);

    // Sector angles per top folder for fan-out initial positions
    const domains = [...new Set(activeNodes.map(n => n.topFolder))];
    const sectorAngle = new Map(domains.map((d, i) => [d, (i / domains.length) * Math.PI * 2]));
    const sectorCount = new Map<string, number>();
    const sectorIdx   = new Map<string, number>();

    for (const n of activeNodes) {
      const c = sectorCount.get(n.topFolder) ?? 0;
      sectorCount.set(n.topFolder, c + 1);
    }

    // Build D3 nodes (with initial positions)
    const prev = new Map(nodesRef.current.map(n => [n.id, n]));
    const d3nodes: D3Node[] = activeNodes.map(n => {
      const p = prev.get(n.id);
      if (p && !isNaN(p.x)) return { ...n, x: p.x, y: p.y, vx: p.vx ?? 0, vy: p.vy ?? 0 };
      // Initial position: radial fan-out by domain
      const angle = sectorAngle.get(n.topFolder) ?? 0;
      const total = sectorCount.get(n.topFolder) ?? 1;
      const idx   = sectorIdx.get(n.topFolder) ?? 0;
      sectorIdx.set(n.topFolder, idx + 1);
      const subA  = angle + (total > 1 ? (idx / (total - 1) - 0.5) * 0.75 : 0);
      const radius = connectedIds.has(n.id)
        ? 120 + 15 * n.linkCount
        : 250 + 120 * Math.random();
      return {
        ...n,
        x: Math.cos(subA) * radius + (Math.random() - 0.5) * 30,
        y: Math.sin(subA) * radius + (Math.random() - 0.5) * 30,
        vx: 0, vy: 0,
      };
    });

    const idToNode = new Map(d3nodes.map(n => [n.id, n]));

    // Build D3 links
    const d3links: D3Link[] = activeLinks
      .map(l => ({ source: idToNode.get(l.source)!, target: idToNode.get(l.target)! }))
      .filter(l => l.source && l.target);

    nodesRef.current = d3nodes;
    linksRef.current = d3links;

    const sim = forceSimulation<D3Node, D3Link>(d3nodes)
      .force('link', forceLink<D3Node, D3Link>(d3links).id(n => n.id).distance(linkDist).strength(0.4))
      .force('charge', forceManyBody<D3Node>().strength(n => charge * (connectedIds.has(n.id) ? 1 + 0.15 * n.linkCount : 0.4)))
      .force('center', forceCenter<D3Node>(cx, cy).strength(centerStr))
      .force('collide', forceCollide<D3Node>().radius(n => collide + (connectedIds.has(n.id) ? n.linkCount * 0.5 : 0)).strength(0.6))
      .force('x', forceX<D3Node>(cx).strength(0.02))
      .force('y', forceY<D3Node>(cy).strength(0.02))
      .alphaDecay(0.022)
      .on('tick', () => { dirtyRef.current = true; })
      .on('end', () => { fitView(); });

    simRef.current = sim;
    dirtyRef.current = true;

    return () => { sim.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNodes, activeLinks, spread]);

  // Force redraw when filter/search changes
  useEffect(() => { dirtyRef.current = true; }, [matchIds, showLabels, connOnly]);

  // ── Pointer helpers ───────────────────────────────────────────────────────

  const toWorld = (cx: number, cy: number) => {
    const { x, y, k } = xfRef.current;
    return { x: (cx - x) / k, y: (cy - y) / k };
  };

  const hitTest = (wx: number, wy: number): D3Node | undefined => {
    let best: D3Node | undefined;
    let bestD2 = Infinity;
    const szMul = nodeSizeRef.current / 5;
    for (const n of nodesRef.current) {
      if (isNaN(n.x) || isNaN(n.y)) continue;
      const isConn = connectedIds.has(n.id);
      const r = isConn ? Math.max(3, Math.min(20, (4 + 2.5 * n.linkCount) * szMul)) : Math.max(2, Math.min(8, (2.5 + n.size / 10000) * szMul));
      const d2 = (n.x - wx) ** 2 + (n.y - wy) ** 2;
      const hitR = (r + 6) ** 2;
      if (d2 <= hitR && d2 < bestD2) { bestD2 = d2; best = n; }
    }
    return best;
  };

  // ── Mouse wheel zoom ──────────────────────────────────────────────────────

  const handleWheel = useCallback((e: React.WheelEvent | WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    // Normalize delta: trackpad sends small pixel deltas, mouse wheel sends 100+
    // Use exponential scaling so both feel proportional
    const rawDelta = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY; // line → pixel
    const clampedDelta = Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), 200);
    const factor = Math.exp(-clampedDelta * 0.0025); // ~0.78–1.28 per step

    const { x: tx, y: ty, k } = xfTargetRef.current;
    const nk = Math.max(0.05, Math.min(10, k * factor));
    xfTargetRef.current = {
      x: mx - (mx - tx) * (nk / k),
      y: my - (my - ty) * (nk / k),
      k: nk,
    };
  }, []);

  // ── Mouse events ──────────────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    downPosRef.current = { x: e.clientX, y: e.clientY };
    didMoveRef.current = false;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wp  = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(wp.x, wp.y);
    if (hit) {
      hit.fx = hit.x; hit.fy = hit.y;
      dragRef.current = { node: hit, ox: wp.x - hit.x, oy: wp.y - hit.y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      simRef.current?.alphaTarget(0.3).restart();
    } else {
      panRef.current = { active: true, sx: e.clientX, sy: e.clientY, stx: xfRef.current.x, sty: xfRef.current.y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    // Track drag movement for click-vs-drag detection
    const moveX = e.clientX - downPosRef.current.x;
    const moveY = e.clientY - downPosRef.current.y;
    if (Math.sqrt(moveX * moveX + moveY * moveY) > 4) didMoveRef.current = true;

    if (dragRef.current?.node) {
      const wp = toWorld(mx, my);
      dragRef.current.node.fx = wp.x - dragRef.current.ox;
      dragRef.current.node.fy = wp.y - dragRef.current.oy;
      dirtyRef.current = true;
      return;
    }

    if (panRef.current.active) {
      const nx = panRef.current.stx + (e.clientX - panRef.current.sx);
      const ny = panRef.current.sty + (e.clientY - panRef.current.sy);
      xfRef.current.x = nx; xfRef.current.y = ny;
      xfTargetRef.current.x = nx; xfTargetRef.current.y = ny;
      dirtyRef.current = true;
      return;
    }

    const wp  = toWorld(mx, my);
    const hit = hitTest(wp.x, wp.y);
    if (hit?.id !== hovRef.current?.id) {
      hovRef.current = hit ?? null;
      if (canvasRef.current) canvasRef.current.style.cursor = hit ? 'pointer' : 'grab';
      dirtyRef.current = true;
    }
    if (hit) {
      const sub = hit.isPhase ? (hit.phaseStatus ?? '') : hit.topFolder;
      setTooltip({ x: mx + 14, y: my - 10, label: hit.label, sub });
    } else {
      setTooltip(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current?.node) {
      dragRef.current.node.fx = null;
      dragRef.current.node.fy = null;
      simRef.current?.alphaTarget(0).restart();
    }
    dragRef.current = null;
    panRef.current = { active: false, sx: 0, sy: 0, stx: 0, sty: 0 };
    if (canvasRef.current) canvasRef.current.style.cursor = hovRef.current ? 'pointer' : 'grab';
    dirtyRef.current = true;
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Suppress click if the pointer moved enough to be a drag
    if (didMoveRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const wp = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    const hit = hitTest(wp.x, wp.y);
    if (hit) onOpenFile(hit.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onOpenFile]);

  const handleLeave = useCallback(() => {
    // Unpin any dragged node before clearing the drag ref
    if (dragRef.current?.node) {
      dragRef.current.node.fx = undefined;
      dragRef.current.node.fy = undefined;
    }
    panRef.current = { active: false, sx: 0, sy: 0, stx: 0, sty: 0 };
    dragRef.current = null;
    hovRef.current = null;
    setTooltip(null);
    dirtyRef.current = true;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);

  const fitView = useCallback(() => {
    const nodes = nodesRef.current.filter(n => !isNaN(n.x) && !isNaN(n.y));
    if (!nodes.length) return;
    const { w, h } = sizeRef.current;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }
    const pad = 60;
    const gw = maxX - minX + pad * 2;
    const gh = maxY - minY + pad * 2;
    const k = Math.max(0.05, Math.min(4, Math.min(w / gw, h / gh)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    xfTargetRef.current = { x: w / 2 - cx * k, y: h / 2 - cy * k, k };
    dirtyRef.current = true;
  }, []);

  // Register wheel handler as non-passive so preventDefault() works
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => { handleWheel(e); };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [handleWheel]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#0d1117', display: 'flex', flexDirection: 'column' }}>
      {/* Controls bar */}
      <div style={{ position: 'absolute', top: 10, left: 12, zIndex: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            width: 140, padding: '4px 9px', borderRadius: 5,
            border: '1px solid rgba(48,54,61,0.9)', background: 'rgba(22,27,34,0.9)',
            color: '#e6edf3', fontSize: 11, outline: 'none', fontFamily: 'inherit',
            backdropFilter: 'blur(6px)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(22,27,34,0.85)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 5, padding: '3px 8px', backdropFilter: 'blur(4px)' }}>
          <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.8)' }}>Spread</span>
          <input type="range" min={1} max={10} value={spread} onChange={e => setSpread(Number(e.target.value))}
            style={{ width: 64, accentColor: '#4493f8', cursor: 'pointer' }}/>
          <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.8)', fontFamily: 'monospace', minWidth: 10 }}>{spread}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(22,27,34,0.85)', border: '1px solid rgba(48,54,61,0.8)', borderRadius: 5, padding: '3px 8px', backdropFilter: 'blur(4px)' }}>
          <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.8)' }}>Size</span>
          <input type="range" min={1} max={10} value={nodeSize} onChange={e => setNodeSize(Number(e.target.value))}
            style={{ width: 56, accentColor: '#4493f8', cursor: 'pointer' }}/>
          <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.8)', fontFamily: 'monospace', minWidth: 10 }}>{nodeSize}</span>
        </div>
        {[
          { label: 'Labels',    active: showLabels, toggle: () => setShowLabels(l => !l) },
          { label: 'Connected', active: connOnly,   toggle: () => setConnOnly(c => !c) },
        ].map(({ label, active, toggle }) => (
          <button key={label} onClick={toggle} style={{
            padding: '4px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${active ? 'rgba(68,147,248,0.6)' : 'rgba(48,54,61,0.8)'}`,
            background: active ? 'rgba(68,147,248,0.1)' : 'rgba(22,27,34,0.85)',
            color: active ? '#4493f8' : 'rgba(139,148,158,0.8)',
            backdropFilter: 'blur(4px)',
          }}>{label}</button>
        ))}
        <button onClick={fitView} title="Fit all nodes into view" style={{
          padding: '4px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: 'inherit',
          border: '1px solid rgba(48,54,61,0.8)',
          background: 'rgba(22,27,34,0.85)',
          color: 'rgba(139,148,158,0.8)',
          backdropFilter: 'blur(4px)',
        }}>Fit</button>
        {!loading && (
          <span style={{ fontSize: 10, color: 'rgba(139,148,158,0.5)', backdropFilter: 'blur(4px)' }}>
            {activeNodes.length} nodes · {activeLinks.length} links
          </span>
        )}
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(139,148,158,0.6)', fontSize: 12 }}>
          Parsing vault…
        </div>
      )}

      <div ref={wrapRef} style={{ flex: 1, position: 'relative' }}>
        <canvas ref={canvasRef} style={{ display: 'block', cursor: 'grab', position: 'absolute', inset: 0 }}
          onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp} onMouseLeave={handleLeave} onClick={handleClick}
        />
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'absolute', left: tooltip.x, top: tooltip.y, pointerEvents: 'none', zIndex: 20,
          background: 'rgba(22,27,34,0.96)', border: '1px solid rgba(48,54,61,0.9)',
          borderRadius: 6, padding: '6px 11px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#e6edf3', marginBottom: tooltip.sub ? 2 : 0 }}>{tooltip.label}</div>
          {tooltip.sub && <div style={{ fontSize: 10, color: 'rgba(139,148,158,0.8)', textTransform: 'capitalize' }}>{tooltip.sub}</div>}
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 10, left: 12, fontSize: 10, color: 'rgba(139,148,158,0.4)', userSelect: 'none', pointerEvents: 'none' }}>
        Scroll to zoom · drag to pan · click to open
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function VaultView({ tree, onOpenFile }: Props) {
  const [view, setView] = useState<'graph' | 'tree'>('graph');
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 0, padding: '6px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-1)' }}>
        {(['graph', 'tree'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '4px 14px', border: '1px solid var(--border)',
            borderRadius: v === 'graph' ? '4px 0 0 4px' : '0 4px 4px 0',
            background: view === v ? 'var(--bg-3)' : 'transparent',
            color: view === v ? 'var(--text-str)' : 'var(--text-faint)',
            cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
            marginLeft: v === 'tree' ? -1 : 0,
          }}>{v === 'graph' ? 'Graph' : 'File Tree'}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {view === 'tree' ? (
          <div style={{ height: '100%', overflow: 'auto', padding: '6px 2px', background: 'var(--bg)' }}>
            {tree.map(n => <TreeNode key={n.path} node={n} depth={0} onOpen={onOpenFile}/>)}
          </div>
        ) : (
          <VaultGraph onOpenFile={onOpenFile}/>
        )}
      </div>
    </div>
  );
}
