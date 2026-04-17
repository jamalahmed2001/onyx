'use client';

/**
 * PortalView — first-person vault navigation.
 *
 * The camera is fixed at the origin. The current hub is "the room you are in".
 * Its direct neighbours are rendered as flat "portal" discs arranged in a ring
 * in front of you. Clicking a portal flies the camera forward into it; on
 * arrival, the target node becomes the new current hub and its neighbours
 * fan out around you.
 *
 * This is a sibling to VaultView's force-directed VaultGraph — they share the
 * `/api/onyx/vault-graph` data source but show the graph differently.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { VaultGraphNode, VaultGraphLink } from '@/app/api/onyx/vault-graph/route';

interface Props {
  onOpenFile: (path: string) => void;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Portal {
  node: VaultGraphNode;
  // Angle (radians) in the XZ-plane around the camera. 0 = dead ahead.
  angle: number;
  // Vertical offset (-1 to 1 range, for stacked rings when lots of children).
  tier: number;
  // Distance from camera in world units.
  distance: number;
  // Domain color RGB.
  color: [number, number, number];
}

interface Camera {
  // Yaw + pitch in radians — camera orientation. Position is always origin.
  yaw: number;
  pitch: number;
  // Target yaw/pitch for smooth interpolation.
  yawTarget: number;
  pitchTarget: number;
  // Forward-motion state during a portal transition (0 = idle, 1 = entered).
  warp: number;
}

// ── Domain colors (matches VaultView's palette roughly) ──────────────────────

const DOMAIN_COLORS: Record<string, [number, number, number]> = {
  '00 - Dashboard':   [68, 147, 248],
  '03 - Ventures':    [255, 159, 10],
  '04 - Finance':     [0, 220, 180],
  '05 - Systems':     [180, 120, 255],
  '08 - System':      [220, 110, 110],
  '10 - OpenClaw':    [255, 200, 80],
  '09 - Archive':     [120, 120, 120],
};
const DEFAULT_COLOR: [number, number, number] = [150, 150, 160];

function colorFor(node: VaultGraphNode): [number, number, number] {
  const match = Object.keys(DOMAIN_COLORS).find((k) => node.topFolder === k || node.topFolder.startsWith(k));
  return match ? DOMAIN_COLORS[match] : DEFAULT_COLOR;
}

// ── Portal layout ────────────────────────────────────────────────────────────

function layoutPortals(children: VaultGraphNode[]): Portal[] {
  // Arrange in arcs: first 8 in a front arc, next 8 in an upper arc, etc.
  const PER_TIER = 8;
  const FRONT_ARC = Math.PI * 0.8; // 144° span
  return children.map((node, i) => {
    const tier = Math.floor(i / PER_TIER);
    const idxInTier = i % PER_TIER;
    const countInTier = Math.min(PER_TIER, children.length - tier * PER_TIER);
    // Arc centered at 0 (dead ahead). Evenly spaced across the arc.
    const t = countInTier > 1 ? idxInTier / (countInTier - 1) : 0.5;
    const angle = (t - 0.5) * FRONT_ARC;
    return {
      node,
      angle,
      tier: tier === 0 ? 0 : (tier % 2 === 1 ? tier * 0.6 : -tier * 0.6),
      distance: 4 + tier * 0.6,
      color: colorFor(node),
    };
  });
}

// ── Graph traversal ──────────────────────────────────────────────────────────

function findRoot(nodes: VaultGraphNode[]): VaultGraphNode | null {
  // Prefer "00 - Dashboard/Dashboard.md" or any Dashboard overview. Fall back
  // to the most-linked node in the highest-priority top folder.
  const dashboard = nodes.find((n) => /dashboard/i.test(n.label) && n.topFolder.startsWith('00'));
  if (dashboard) return dashboard;
  const anyDashboard = nodes.find((n) => n.topFolder.startsWith('00'));
  if (anyDashboard) return anyDashboard;
  return nodes.length > 0 ? nodes[0] : null;
}

function neighborsOf(hubId: string, links: VaultGraphLink[], nodes: Map<string, VaultGraphNode>): VaultGraphNode[] {
  const seen = new Set<string>();
  const out: VaultGraphNode[] = [];
  for (const l of links) {
    let neighborId: string | null = null;
    if (l.source === hubId) neighborId = l.target;
    else if (l.target === hubId) neighborId = l.source;
    if (!neighborId || seen.has(neighborId)) continue;
    seen.add(neighborId);
    const node = nodes.get(neighborId);
    if (node) out.push(node);
  }
  // Sort: hubs + overviews first, then by link count descending
  out.sort((a, b) => {
    const aHub = /overview|hub$/i.test(a.label) ? 1 : 0;
    const bHub = /overview|hub$/i.test(b.label) ? 1 : 0;
    if (aHub !== bHub) return bHub - aHub;
    return b.linkCount - a.linkCount;
  });
  return out;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function PortalView({ onOpenFile }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  const [nodes, setNodes] = useState<Map<string, VaultGraphNode>>(new Map());
  const [links, setLinks] = useState<VaultGraphLink[]>([]);
  const [loading, setLoading] = useState(true);

  // Navigation stack — list of hub IDs, most recent last. Empty = at root.
  const [stack, setStack] = useState<string[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Camera state in a ref so the RAF loop doesn't re-render on every tick.
  const camRef = useRef<Camera>({ yaw: 0, pitch: 0, yawTarget: 0, pitchTarget: 0, warp: 0 });
  const portalsRef = useRef<Portal[]>([]);
  const hoverRef = useRef<number>(-1);
  const dragRef = useRef<{ x: number; y: number; yaw0: number; pitch0: number } | null>(null);
  const warpTargetIdRef = useRef<string | null>(null);

  // ── Fetch graph ────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/onyx/vault-graph').then((r) => r.json()).then(
      (data: { nodes: VaultGraphNode[]; links: VaultGraphLink[] }) => {
        const map = new Map<string, VaultGraphNode>();
        for (const n of data.nodes) map.set(n.id, n);
        setNodes(map);
        setLinks(data.links);
        const root = findRoot(data.nodes);
        if (root) setCurrentId(root.id);
        setLoading(false);
      },
    );
  }, []);

  // ── Current hub + children ─────────────────────────────────────────────────

  const currentHub = useMemo(() => currentId ? nodes.get(currentId) ?? null : null, [currentId, nodes]);
  const children = useMemo(
    () => currentId ? neighborsOf(currentId, links, nodes) : [],
    [currentId, links, nodes],
  );

  // Recompute portal layout whenever children change. Keep it in a ref so the
  // render loop reads the latest without re-subscribing.
  useEffect(() => {
    portalsRef.current = layoutPortals(children);
    // Reset camera orientation when moving to a new hub.
    camRef.current.yawTarget = 0;
    camRef.current.pitchTarget = 0;
  }, [children]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const enterPortal = useCallback((targetId: string) => {
    // Trigger warp animation; on completion, swap the current hub.
    warpTargetIdRef.current = targetId;
    camRef.current.warp = 0.001; // starts the animation; the RAF loop advances it
  }, []);

  const goBack = useCallback(() => {
    if (stack.length === 0) return;
    const next = [...stack];
    const parentId = next.pop()!;
    setStack(next);
    setCurrentId(parentId);
  }, [stack]);

  const goTo = useCallback((id: string) => {
    if (!currentId || id === currentId) return;
    setStack((s) => [...s, currentId]);
    setCurrentId(id);
  }, [currentId]);

  // ── Canvas resize ──────────────────────────────────────────────────────────

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const { width: w, height: h } = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w, h };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // ── Projection ─────────────────────────────────────────────────────────────

  /** Project a portal's 3D position (relative to origin camera) to screen px. */
  function projectPortal(p: Portal, cam: Camera, w: number, h: number): { x: number; y: number; depth: number; scale: number } {
    // World position: in front of camera along +Z, rotated by yaw around Y.
    // Portal's own angle is its fixed position in the hub; camera yaw lets the user look around.
    const rel = p.angle - cam.yaw;
    const pitch = cam.pitch;
    const d = p.distance;
    const wx = Math.sin(rel) * d;
    const wy = p.tier - Math.sin(pitch) * d;
    const wz = Math.cos(rel) * d * Math.cos(pitch);
    if (wz <= 0.1) return { x: 0, y: 0, depth: wz, scale: 0 };
    const fov = Math.min(w, h) * 0.9;
    const x = w / 2 + (wx / wz) * fov;
    const y = h / 2 + (wy / wz) * fov;
    const scale = fov / wz / 8; // portal "radius" in screen units relative to 1 world unit
    return { x, y, depth: wz, scale };
  }

  // ── Render loop ────────────────────────────────────────────────────────────

  useEffect(() => {
    let raf = 0;
    const step = () => {
      const canvas = canvasRef.current;
      if (!canvas) { raf = requestAnimationFrame(step); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(step); return; }
      const { w, h } = sizeRef.current;
      const cam = camRef.current;

      // Smoothly interpolate camera toward targets.
      cam.yaw += (cam.yawTarget - cam.yaw) * 0.12;
      cam.pitch += (cam.pitchTarget - cam.pitch) * 0.12;

      // Advance warp animation if in progress.
      if (cam.warp > 0) {
        cam.warp += 0.04;
        if (cam.warp >= 1 && warpTargetIdRef.current) {
          const id = warpTargetIdRef.current;
          warpTargetIdRef.current = null;
          cam.warp = 0;
          goTo(id);
        }
      }

      // Background gradient — subtle depth fog
      const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
      grad.addColorStop(0, '#1a2030');
      grad.addColorStop(1, '#05070d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Star field — slight parallax by camera yaw
      ctx.fillStyle = 'rgba(200,210,230,0.55)';
      for (let i = 0; i < 120; i++) {
        // Deterministic positions so the field doesn't flicker
        const a = (i * 7919) % 1000 / 1000; // 0..1
        const b = (i * 6971) % 1000 / 1000;
        const starYaw = a * Math.PI * 2 - cam.yaw * 0.3;
        const sx = w / 2 + Math.sin(starYaw) * w * 0.6;
        const sy = 60 + b * (h - 120) - cam.pitch * 30;
        const r = ((i * 13) % 3) * 0.5 + 0.4;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw portals, back-to-front
      const portals = portalsRef.current
        .map((p) => ({ p, proj: projectPortal(p, cam, w, h) }))
        .filter((x) => x.proj.scale > 0)
        .sort((a, b) => b.proj.depth - a.proj.depth);

      let hoveredIdx = -1;
      portals.forEach((x, i) => {
        if (hoverRef.current === portalsRef.current.indexOf(x.p)) hoveredIdx = i;
      });

      for (let i = 0; i < portals.length; i++) {
        const { p, proj } = portals[i];
        const isHovered = portalsRef.current.indexOf(p) === hoverRef.current;
        const isWarpTarget = warpTargetIdRef.current === p.node.id;

        const radius = Math.max(20, Math.min(240, proj.scale * 60));
        const alpha = isWarpTarget ? 1 : Math.max(0.35, Math.min(1, 3 / proj.depth));
        const [r, g, b] = p.color;

        // Warp target grows rapidly toward fill
        const warpBoost = isWarpTarget ? 1 + cam.warp * 3 : 1;
        const drawR = radius * warpBoost;

        // Outer glow ring
        ctx.beginPath();
        ctx.arc(proj.x, proj.y, drawR * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.08})`;
        ctx.fill();

        // Portal face — filled disc with slight vertical compression for "doorway" feel
        ctx.beginPath();
        ctx.ellipse(proj.x, proj.y, drawR, drawR * 1.15, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha * 0.18})`;
        ctx.fill();

        // Portal frame
        ctx.lineWidth = isHovered ? 3 : 1.5;
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha * (isHovered ? 1 : 0.7)})`;
        ctx.stroke();

        // Inner darker core suggesting depth through the portal
        ctx.beginPath();
        ctx.ellipse(proj.x, proj.y, drawR * 0.55, drawR * 0.65, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(5,8,14,${alpha * 0.85})`;
        ctx.fill();

        // Label
        const labelSize = Math.max(10, Math.min(22, radius * 0.22));
        ctx.font = `${labelSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = `rgba(230,237,243,${alpha})`;
        const label = p.node.label.replace(/\.md$/, '').replace(/^[0-9]+\s*[-–]\s*/, '');
        const maxChars = Math.floor(drawR * 0.2);
        const trimmed = label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
        ctx.fillText(trimmed, proj.x, proj.y + drawR + labelSize + 6);
      }

      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [goTo]);

  // ── Interaction ────────────────────────────────────────────────────────────

  const hitTest = useCallback((mx: number, my: number): number => {
    const { w, h } = sizeRef.current;
    const cam = camRef.current;
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < portalsRef.current.length; i++) {
      const p = portalsRef.current[i];
      const proj = projectPortal(p, cam, w, h);
      if (proj.scale <= 0) continue;
      const r = Math.max(20, Math.min(240, proj.scale * 60));
      const dx = mx - proj.x;
      const dy = my - proj.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r * 1.3 && d2 < bestDist) { bestDist = d2; bestIdx = i; }
    }
    return bestIdx;
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, yaw0: camRef.current.yawTarget, pitch0: camRef.current.pitchTarget };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      camRef.current.yawTarget = dragRef.current.yaw0 - dx * 0.004;
      camRef.current.pitchTarget = Math.max(-0.5, Math.min(0.5, dragRef.current.pitch0 - dy * 0.003));
    } else {
      hoverRef.current = hitTest(mx, my);
    }
  }, [hitTest]);

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    const wasDragging = dragRef.current && (Math.abs(e.clientX - dragRef.current.x) > 3 || Math.abs(e.clientY - dragRef.current.y) > 3);
    dragRef.current = null;
    if (wasDragging) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const idx = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (idx >= 0) {
      const portal = portalsRef.current[idx];
      // Shift-click or ctrl-click opens the file directly without navigating
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        onOpenFile(portal.node.id);
      } else {
        enterPortal(portal.node.id);
      }
    }
  }, [hitTest, enterPortal, onOpenFile]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); goBack(); }
      if (e.key === 'Enter' && currentHub) { e.preventDefault(); onOpenFile(currentHub.id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack, currentHub, onOpenFile]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const breadcrumbs = useMemo(() => {
    const trail = [...stack.map((id) => nodes.get(id)).filter((n): n is VaultGraphNode => !!n)];
    if (currentHub) trail.push(currentHub);
    return trail;
  }, [stack, currentHub, nodes]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#05070d', overflow: 'hidden' }}>
      {/* Breadcrumb trail */}
      <div style={{
        position: 'absolute', top: 12, left: 12, right: 12, zIndex: 10,
        display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center',
        fontSize: 11, color: 'rgba(200,210,230,0.7)',
        pointerEvents: 'none',
      }}>
        {breadcrumbs.map((n, i) => (
          <span key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              color: i === breadcrumbs.length - 1 ? '#e6edf3' : 'rgba(150,160,180,0.7)',
              fontWeight: i === breadcrumbs.length - 1 ? 600 : 400,
            }}>
              {n.label.replace(/\.md$/, '')}
            </span>
            {i < breadcrumbs.length - 1 && <span style={{ opacity: 0.4 }}>›</span>}
          </span>
        ))}
      </div>

      {/* Back button */}
      {stack.length > 0 && (
        <button
          onClick={goBack}
          style={{
            position: 'absolute', top: 36, left: 12, zIndex: 10,
            padding: '5px 12px', fontSize: 11, fontFamily: 'inherit',
            background: 'rgba(22,27,34,0.85)', color: 'rgba(200,210,230,0.9)',
            border: '1px solid rgba(48,54,61,0.9)', borderRadius: 5, cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}>← Back</button>
      )}

      {/* Instructions */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 10,
        fontSize: 10, color: 'rgba(139,148,158,0.5)', userSelect: 'none', pointerEvents: 'none',
      }}>
        Click a portal to enter · drag to look around · Esc/Backspace to go back · Shift+click to open the file
      </div>

      {/* Current-hub badge */}
      {currentHub && (
        <div style={{
          position: 'absolute', bottom: 12, right: 12, zIndex: 10,
          padding: '5px 12px', fontSize: 11,
          background: 'rgba(22,27,34,0.85)', color: '#e6edf3',
          border: '1px solid rgba(48,54,61,0.9)', borderRadius: 5,
          backdropFilter: 'blur(4px)',
        }}>
          You are in: <strong>{currentHub.label.replace(/\.md$/, '')}</strong>
          <span style={{ marginLeft: 8, color: 'rgba(139,148,158,0.7)' }}>· {children.length} neighbour{children.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(139,148,158,0.7)', fontSize: 12 }}>
          Parsing vault…
        </div>
      )}

      <div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { dragRef.current = null; hoverRef.current = -1; }}
          style={{ display: 'block', cursor: hoverRef.current >= 0 ? 'pointer' : 'grab' }}
        />
      </div>
    </div>
  );
}
