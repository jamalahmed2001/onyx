'use client';

/**
 * VaultUniverse — first-person recursive vault navigation.
 *
 * You stand at the origin. The current node's neighbours form a ring around
 * you. Drag (mouse or touch) to spin, tap a node to walk into it. Leaves open
 * a detail sidebar with phase actions (launch agent, mark ready, open).
 *
 * A project quick-jump bar at the top lets you teleport straight to any
 * project bundle without recursive walking.
 */

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { VaultGraphNode, VaultGraphLink } from '@/app/api/onyx/vault-graph/route';

interface Props {
  onOpenFile: (path: string) => void;
}

// ── Palette ────────────────────────────────────────────────────────────────

const DOMAIN_COLORS: Record<string, string> = {
  '00': '#4493f8', '03': '#ff9f0a', '04': '#00dcb4', '05': '#b478ff',
  '08': '#dc6e6e', '09': '#787878', '10': '#ffc850',
};
function colorForTopFolder(topFolder: string): string {
  const prefix = topFolder.match(/^(\d{2})/)?.[1];
  return (prefix && DOMAIN_COLORS[prefix]) ?? '#9aa4b2';
}
function cleanLabel(label: string): string {
  return label.replace(/\.md$/, '').replace(/^\d+\s*[-–]\s*/, '');
}

// ── Graph helpers ──────────────────────────────────────────────────────────

function findRoot(nodes: VaultGraphNode[]): VaultGraphNode | null {
  const dashboard = nodes.find((n) => /dashboard/i.test(n.label) && n.topFolder.startsWith('00'));
  if (dashboard) return dashboard;
  return nodes.find((n) => n.topFolder.startsWith('00')) ?? nodes[0] ?? null;
}

function neighboursOf(
  hubId: string,
  links: VaultGraphLink[],
  nodes: Map<string, VaultGraphNode>,
  exclude: Set<string>,
): VaultGraphNode[] {
  const seen = new Set<string>();
  const out: VaultGraphNode[] = [];
  for (const l of links) {
    let neighbourId: string | null = null;
    if (l.source === hubId) neighbourId = l.target;
    else if (l.target === hubId) neighbourId = l.source;
    if (!neighbourId || seen.has(neighbourId) || exclude.has(neighbourId)) continue;
    seen.add(neighbourId);
    const n = nodes.get(neighbourId);
    if (n) out.push(n);
  }
  out.sort((a, b) => {
    const aHub = /overview|hub|kanban$/i.test(a.label) ? 1 : 0;
    const bHub = /overview|hub|kanban$/i.test(b.label) ? 1 : 0;
    if (aHub !== bHub) return bHub - aHub;
    return b.linkCount - a.linkCount;
  });
  return out;
}

/** Detect project bundles for the quick-jump bar. */
function detectBundles(nodes: VaultGraphNode[]): VaultGraphNode[] {
  const bundles: VaultGraphNode[] = [];
  const seenDirs = new Set<string>();
  const OVERVIEW_RE = /^(.+\s[-–]\s)?Overview(\.md)?$/i;
  for (const n of nodes) {
    if (OVERVIEW_RE.test(n.label) && !seenDirs.has(n.folder)) {
      seenDirs.add(n.folder);
      bundles.push(n);
    }
  }
  return bundles.sort((a, b) => a.topFolder.localeCompare(b.topFolder));
}

/** Guess the project id for a phase node from its path. */
function projectIdFor(node: VaultGraphNode): string | null {
  // e.g. "10 - OpenClaw/Automated Distribution Pipelines/ManiPlus/Phases/… .md"
  // → "ManiPlus"
  const parts = node.id.split('/');
  const phasesIdx = parts.lastIndexOf('Phases');
  if (phasesIdx > 0) return parts[phasesIdx - 1];
  return null;
}

// ── Adaptive ring layout ───────────────────────────────────────────────────

interface RingNode {
  node: VaultGraphNode;
  position: THREE.Vector3;
  angle: number;
}

interface LayoutConfig {
  radius: number;
  nodeScale: number;
  arcSweep: number;   // radians — <2π means front-only arc, 2π = full ring
  labelFont: number;
}

function configFor(count: number): LayoutConfig {
  // Few nodes → front arc, readable big spheres. Many → full ring, smaller spheres.
  if (count <= 1) return { radius: 4, nodeScale: 1.25, arcSweep: 0,               labelFont: 20 };
  if (count <= 3) return { radius: 5, nodeScale: 1.15, arcSweep: Math.PI * 0.8,   labelFont: 19 };
  if (count <= 5) return { radius: 6, nodeScale: 1.0,  arcSweep: Math.PI * 1.1,   labelFont: 18 };
  if (count <= 8) return { radius: 7, nodeScale: 0.9,  arcSweep: Math.PI * 1.55,  labelFont: 17 };
  if (count <= 14) return { radius: 9, nodeScale: 0.8, arcSweep: Math.PI * 2,     labelFont: 16 };
  // Large sets — full ring, small spheres, smaller labels.
  return { radius: 10 + Math.min(4, (count - 14) * 0.25), nodeScale: 0.7, arcSweep: Math.PI * 2, labelFont: 15 };
}

function layoutRing(nodes: VaultGraphNode[], cfg: LayoutConfig): RingNode[] {
  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) {
    return [{
      node: nodes[0],
      angle: 0,
      position: new THREE.Vector3(0, 0, -cfg.radius),
    }];
  }
  return nodes.map((node, i) => {
    // For full ring: 0..2π spaced evenly. For arc: centered around 0 (dead ahead).
    let angle: number;
    if (cfg.arcSweep >= Math.PI * 1.99) {
      angle = (i / n) * Math.PI * 2;
    } else {
      const t = n > 1 ? i / (n - 1) : 0.5;
      angle = (t - 0.5) * cfg.arcSweep;
    }
    const x = Math.sin(angle) * cfg.radius;
    const z = -Math.cos(angle) * cfg.radius;
    return { node, angle, position: new THREE.Vector3(x, 0, z) };
  });
}

// ── Node mesh ──────────────────────────────────────────────────────────────

function WorldNode({
  ringNode, scale, labelFont, walking, walkingTargetId, currentYawRef, onEnter, index, count,
}: {
  ringNode: RingNode;
  scale: number;
  labelFont: number;
  walking: boolean;
  walkingTargetId: string | null;
  currentYawRef: React.MutableRefObject<number>;
  onEnter: (id: string) => void;
  index: number;
  count: number;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const color = colorForTopFolder(ringNode.node.topFolder);
  const isActive = ringNode.node.phaseStatus === 'active' || ringNode.node.phaseStatus === 'ready';
  const isWalkingTarget = walking && walkingTargetId === ringNode.node.id;

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += delta * 0.2;
    if (isActive) {
      const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.08;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  const hoverScale = hovered ? 1.12 : 1;
  const enterScale = isWalkingTarget ? 1.6 : 1;
  const radius = 0.65 * scale;

  // "Looking-at" highlight — node glows brighter when near center of view
  const angleDiff = Math.abs(((ringNode.angle - currentYawRef.current + Math.PI) % (Math.PI * 2)) - Math.PI);
  const inFront = angleDiff < 0.35;

  return (
    <group position={ringNode.position} scale={hoverScale * enterScale}>
      {/* Glow halo */}
      <mesh>
        <sphereGeometry args={[radius * 1.5, 20, 14]} />
        <meshBasicMaterial color={color} transparent opacity={hovered ? 0.24 : (inFront ? 0.16 : 0.1)} />
      </mesh>
      {/* Core sphere */}
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onEnter(ringNode.node.id); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = ''; }}
      >
        <sphereGeometry args={[radius, 32, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.1 : (inFront ? 0.8 : 0.4)}
          roughness={0.45}
          metalness={0.15}
        />
      </mesh>
      {/* Ring index (1-9) — fast keyboard shortcut */}
      {index < 9 && (
        <Html
          position={[0, radius * 1.1, 0]}
          center
          distanceFactor={10}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            fontSize: 11,
            fontWeight: 700,
            color: '#0d1117',
            background: '#fff',
            padding: '1px 5px',
            borderRadius: 8,
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          {index + 1}
        </Html>
      )}
      {/* Label */}
      <Html
        position={[0, -radius - 0.4, 0]}
        center
        distanceFactor={6}
        style={{
          pointerEvents: 'none',
          userSelect: 'none',
          color: '#ffffff',
          fontSize: labelFont,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 600,
          letterSpacing: '0.01em',
          textShadow: '0 2px 10px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.9)',
          whiteSpace: 'nowrap',
          textAlign: 'center',
        }}
      >
        {cleanLabel(ringNode.node.label)}
      </Html>
      {/* Phase status badge */}
      {ringNode.node.isPhase && ringNode.node.phaseStatus && (
        <Html
          position={[0, radius + 0.35, 0]}
          center
          distanceFactor={8}
          style={{
            pointerEvents: 'none',
            userSelect: 'none',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: isActive ? '#00dcb4' : 'rgba(200,210,230,0.8)',
            background: 'rgba(0,0,0,0.7)',
            padding: '2px 6px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
          }}
        >
          {ringNode.node.phaseStatus}
        </Html>
      )}
    </group>
  );
}

// ── Floor disc — gives sense of "where you're standing" ────────────────────

function FloorDisc({ color }: { color: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
      <ringGeometry args={[0.5, 3, 48]} />
      <meshBasicMaterial color={color} transparent opacity={0.08} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ── Camera ─────────────────────────────────────────────────────────────────

function FirstPersonCamera({
  yaw, walkProgress, walkTargetPosition,
}: {
  yaw: number;
  walkProgress: number;
  walkTargetPosition: THREE.Vector3 | null;
}) {
  const { camera } = useThree();
  useFrame(() => {
    if (walkTargetPosition && walkProgress > 0) {
      camera.position.lerpVectors(new THREE.Vector3(0, 0, 0), walkTargetPosition, walkProgress);
    } else {
      camera.position.set(0, 0, 0);
    }
    const lookX = Math.sin(yaw) * 10;
    const lookZ = -Math.cos(yaw) * 10;
    camera.lookAt(camera.position.x + lookX, camera.position.y, camera.position.z + lookZ);
  });
  return null;
}

// ── Detail sidebar with phase actions ──────────────────────────────────────

function DetailSidebar({
  node, onClose, onOpenFile, onAction,
}: {
  node: VaultGraphNode;
  onClose: () => void;
  onOpenFile: (p: string) => void;
  onAction: (verb: string) => Promise<void>;
}) {
  const [raw, setRaw] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setRaw(null); setErr(null);
    fetch(`/api/onyx/vault-file?path=${encodeURIComponent(node.id)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: { raw?: string; content?: string }) => setRaw(d.raw ?? d.content ?? ''))
      .catch((e) => setErr(String(e)));
  }, [node.id]);

  const isPhase = node.isPhase;
  const isActive = node.phaseStatus === 'active';
  const isBlocked = node.phaseStatus === 'blocked';
  const isReady = node.phaseStatus === 'ready';

  const runAction = async (verb: string) => {
    setBusy(verb);
    try { await onAction(verb); } finally { setBusy(null); }
  };

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 'min(520px, 100vw)',
      background: 'rgba(13,17,23,0.97)', borderLeft: '1px solid rgba(48,54,61,0.9)',
      backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.5)', zIndex: 30,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(48,54,61,0.9)', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cleanLabel(node.label)}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(139,148,158,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.id}
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" style={{
          padding: '4px 10px', fontSize: 12, fontFamily: 'inherit',
          background: 'rgba(22,27,34,0.85)', color: 'rgba(200,210,230,0.9)',
          border: '1px solid rgba(48,54,61,0.9)', borderRadius: 4, cursor: 'pointer',
        }}>×</button>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid rgba(48,54,61,0.6)', flexWrap: 'wrap', flexShrink: 0 }}>
        <button
          onClick={() => onOpenFile(node.id)}
          style={actionBtnStyle('#4493f8')}
        >Open in editor</button>

        {isPhase && !isActive && (isReady || isBlocked || node.phaseStatus === 'backlog') && (
          <button
            disabled={!!busy}
            onClick={() => runAction('launch')}
            style={actionBtnStyle('#00dcb4', busy === 'launch')}
          >{busy === 'launch' ? 'Launching…' : 'Launch agent'}</button>
        )}
        {isPhase && isActive && (
          <button
            disabled={!!busy}
            onClick={() => runAction('stop')}
            style={actionBtnStyle('#ff9f0a', busy === 'stop')}
          >{busy === 'stop' ? 'Stopping…' : 'Stop + reset'}</button>
        )}
        {isPhase && !isActive && node.phaseStatus !== 'ready' && (
          <button
            disabled={!!busy}
            onClick={() => runAction('ready')}
            style={actionBtnStyle('#b478ff', busy === 'ready')}
          >{busy === 'ready' ? 'Marking…' : 'Mark ready'}</button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', fontSize: 11, lineHeight: 1.55, color: '#c9d1d9', fontFamily: 'ui-monospace, SFMono-Regular, monospace', whiteSpace: 'pre-wrap' }}>
        {err ? <div style={{ color: '#dc6e6e' }}>Failed to load: {err}</div>
          : raw === null ? <div style={{ color: 'rgba(139,148,158,0.5)' }}>Loading…</div>
          : raw}
      </div>
    </div>
  );
}

function actionBtnStyle(color: string, busy = false): React.CSSProperties {
  return {
    padding: '5px 11px', fontSize: 11, fontFamily: 'inherit',
    background: busy ? `${color}22` : `${color}15`, color,
    border: `1px solid ${color}66`, borderRadius: 4,
    cursor: busy ? 'wait' : 'pointer', fontWeight: 500,
    opacity: busy ? 0.7 : 1,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

export default function VaultUniverse({ onOpenFile }: Props) {
  const [nodes, setNodes] = useState<Map<string, VaultGraphNode>>(new Map());
  const [links, setLinks] = useState<VaultGraphLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [bundles, setBundles] = useState<VaultGraphNode[]>([]);

  const [stack, setStack] = useState<string[]>([]);

  const [yaw, setYaw] = useState(0);
  const yawRef = useRef(0);
  useEffect(() => { yawRef.current = yaw; }, [yaw]);

  const [walkProgress, setWalkProgress] = useState(0);
  const walkTargetIdRef = useRef<string | null>(null);
  const walkTargetPosRef = useRef<THREE.Vector3 | null>(null);

  const [detailNode, setDetailNode] = useState<VaultGraphNode | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const dragRef = useRef<{ x: number; yaw0: number; moved: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/onyx/vault-graph').then((r) => r.json()).then(
      (d: { nodes: VaultGraphNode[]; links: VaultGraphLink[] }) => {
        const map = new Map<string, VaultGraphNode>();
        for (const n of d.nodes) map.set(n.id, n);
        setNodes(map);
        setLinks(d.links);
        setBundles(detectBundles(d.nodes));
        const root = findRoot(d.nodes);
        if (root) setStack([root.id]);
        setLoading(false);
      },
    );
  }, []);

  const currentId = stack[stack.length - 1] ?? null;
  const currentNode = useMemo(() => currentId ? nodes.get(currentId) ?? null : null, [currentId, nodes]);
  const parentId = stack.length >= 2 ? stack[stack.length - 2] : null;

  const { ringNodes, cfg } = useMemo(() => {
    if (!currentId) return { ringNodes: [] as RingNode[], cfg: configFor(0) };
    const exclude = new Set<string>();
    if (parentId) exclude.add(parentId);
    const neighbours = neighboursOf(currentId, links, nodes, exclude);
    const c = configFor(neighbours.length);
    return { ringNodes: layoutRing(neighbours, c), cfg: c };
  }, [currentId, parentId, links, nodes]);

  const currentColor = currentNode ? colorForTopFolder(currentNode.topFolder) : '#4493f8';

  // ── Navigation ────────────────────────────────────────────────────────
  const walkInto = useCallback((id: string) => {
    const ringNode = ringNodes.find((r) => r.node.id === id);
    if (!ringNode) return;
    walkTargetIdRef.current = id;
    walkTargetPosRef.current = ringNode.position.clone();
    setWalkProgress(0.001);
  }, [ringNodes]);

  // Animate walk-in
  useEffect(() => {
    if (walkProgress === 0 || walkProgress >= 1) return;
    const raf = requestAnimationFrame(() => {
      const next = Math.min(1, walkProgress + 0.04);
      if (next >= 1) {
        const id = walkTargetIdRef.current;
        walkTargetIdRef.current = null;
        walkTargetPosRef.current = null;
        setWalkProgress(0);
        if (!id) return;
        const node = nodes.get(id);
        if (!node) return;
        // If the entered node is a leaf (no further usable neighbours), open sidebar.
        const remaining = neighboursOf(id, links, nodes, new Set(stack));
        if (remaining.length === 0) {
          setDetailNode(node);
        } else {
          setStack((s) => [...s, id]);
          setYaw(0);
        }
      } else {
        setWalkProgress(next);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [walkProgress, nodes, links, stack]);

  const jumpToBundle = useCallback((id: string) => {
    // Teleport — set the stack to a path from root to this bundle so Back still works.
    setStack((s) => {
      const root = s[0];
      if (!root || root === id) return s.length > 0 ? s : [id];
      // Simple stack: root → bundle. (Could reconstruct path via BFS but this is fast + useful.)
      return [root, id];
    });
    setYaw(0);
    setDetailNode(null);
  }, []);

  const goBack = useCallback(() => {
    if (detailNode) { setDetailNode(null); return; }
    if (stack.length > 1) {
      setStack((s) => s.slice(0, -1));
      setYaw(0);
    }
  }, [detailNode, stack.length]);

  const jumpTo = useCallback((stackIndex: number) => {
    setStack((s) => s.slice(0, stackIndex + 1));
    setYaw(0);
    setDetailNode(null);
  }, []);

  // Keyboard: Esc/Backspace = back; 1-9 = walk into Nth node
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA/.test(target.tagName)) return;
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); goBack(); return; }
      const digit = parseInt(e.key, 10);
      if (!isNaN(digit) && digit >= 1 && digit <= 9 && ringNodes[digit - 1]) {
        e.preventDefault();
        walkInto(ringNodes[digit - 1].node.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack, ringNodes, walkInto]);

  // ── Pointer (mouse + touch) drag-to-spin ──────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Ignore drags starting on the sidebar / buttons — those have their own handlers.
    const target = e.target as HTMLElement;
    if (target.closest('[data-sidebar="true"]')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, yaw0: yawRef.current, moved: false };
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    if (Math.abs(dx) > 3) dragRef.current.moved = true;
    setYaw(dragRef.current.yaw0 + dx * 0.005);
  }, []);
  const onPointerUp = useCallback(() => { dragRef.current = null; }, []);

  // ── Phase actions ─────────────────────────────────────────────────────
  const runPhaseAction = useCallback(async (verb: string) => {
    if (!detailNode) return;
    const projectId = projectIdFor(detailNode);
    try {
      if (verb === 'launch') {
        if (!projectId) throw new Error('Cannot determine project id from phase path');
        const res = await fetch('/api/onyx/cli', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: 'run', args: ['--project', projectId] }),
        });
        if (!res.ok) throw new Error(`CLI run failed (${res.status})`);
        setToast(`🚀 onyx run --project ${projectId}`);
      } else if (verb === 'stop' || verb === 'ready') {
        if (!projectId) throw new Error('Cannot determine project id');
        const res = await fetch(`/api/onyx/projects/${encodeURIComponent(projectId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phasePath: detailNode.id, status: 'ready' }),
        });
        if (!res.ok) throw new Error(`Status change failed (${res.status})`);
        setToast(verb === 'stop' ? 'Reset to ready' : 'Marked ready');
      }
    } catch (err) {
      setToast(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
    setTimeout(() => setToast(null), 3500);
  }, [detailNode]);

  // ── Breadcrumbs ───────────────────────────────────────────────────────
  const breadcrumbs = useMemo(() => stack.map((id) => nodes.get(id)).filter((n): n is VaultGraphNode => !!n), [stack, nodes]);

  return (
    <div
      style={{
        width: '100%', height: '100%', position: 'relative',
        background: '#05070d', overflow: 'hidden',
        cursor: dragRef.current ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Canvas camera={{ position: [0, 0, 0], fov: 70, near: 0.1, far: 200 }}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.5} />
          <pointLight position={[0, 4, 0]} intensity={1.2} />
          <pointLight position={[0, -4, 0]} intensity={0.4} color="#4493f8" />
          <Stars radius={80} depth={40} count={800} factor={3} fade speed={0.3} />

          <FirstPersonCamera
            yaw={yaw}
            walkProgress={walkProgress}
            walkTargetPosition={walkTargetPosRef.current}
          />
          <FloorDisc color={currentColor} />

          {ringNodes.map((r, i) => (
            <WorldNode
              key={r.node.id}
              ringNode={r}
              scale={cfg.nodeScale}
              labelFont={cfg.labelFont}
              walking={walkProgress > 0}
              walkingTargetId={walkTargetIdRef.current}
              currentYawRef={yawRef}
              onEnter={walkInto}
              index={i}
              count={ringNodes.length}
            />
          ))}
        </Suspense>
      </Canvas>

      {/* ── Overlays ─────────────────────────────────────────────────────── */}

      {/* Top bar: breadcrumb + project quick-jump */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 12,
        background: 'linear-gradient(rgba(5,7,13,0.9), rgba(5,7,13,0.5))',
        padding: '10px 12px 12px',
        pointerEvents: 'none',
      }}>
        {/* Breadcrumb */}
        <div style={{
          display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap',
          fontSize: 11, color: 'rgba(200,210,230,0.7)',
          marginBottom: bundles.length > 0 ? 8 : 0,
        }}>
          {breadcrumbs.map((n, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); jumpTo(i); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    pointerEvents: 'auto',
                    background: 'transparent', border: 'none', padding: 0, margin: 0,
                    color: isLast ? '#e6edf3' : 'rgba(150,160,180,0.8)',
                    fontWeight: isLast ? 700 : 400, fontSize: 11, cursor: isLast ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >{cleanLabel(n.label)}</button>
                {!isLast && <span style={{ opacity: 0.4 }}>›</span>}
              </span>
            );
          })}
        </div>

        {/* Project quick-jump pills */}
        {bundles.length > 0 && (
          <div style={{
            display: 'flex', gap: 5, flexWrap: 'wrap',
            overflowX: 'auto', paddingBottom: 2,
          }}>
            {bundles.map((b) => {
              const active = currentId === b.id;
              const color = colorForTopFolder(b.topFolder);
              return (
                <button
                  key={b.id}
                  onClick={(e) => { e.stopPropagation(); jumpToBundle(b.id); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    pointerEvents: 'auto',
                    padding: '3px 10px', fontSize: 10, fontFamily: 'inherit',
                    background: active ? `${color}2a` : 'rgba(22,27,34,0.9)',
                    color: active ? color : 'rgba(200,210,230,0.85)',
                    border: `1px solid ${active ? color + '88' : 'rgba(48,54,61,0.9)'}`,
                    borderRadius: 999, cursor: 'pointer',
                    whiteSpace: 'nowrap', flexShrink: 0,
                    fontWeight: active ? 600 : 400,
                  }}
                >{cleanLabel(b.label)}</button>
              );
            })}
          </div>
        )}
      </div>

      {/* Back button */}
      {(stack.length > 1 || detailNode) && (
        <button
          onClick={(e) => { e.stopPropagation(); goBack(); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: bundles.length > 0 ? 72 : 40, left: 12, zIndex: 15,
            padding: '5px 12px', fontSize: 11, fontFamily: 'inherit',
            background: 'rgba(22,27,34,0.9)', color: 'rgba(200,210,230,0.95)',
            border: '1px solid rgba(48,54,61,0.95)', borderRadius: 5, cursor: 'pointer',
            backdropFilter: 'blur(4px)',
          }}>← Back</button>
      )}

      {/* Help */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 10,
        fontSize: 10, color: 'rgba(139,148,158,0.5)', pointerEvents: 'none',
      }}>
        Drag to spin · tap a node to walk in · 1-9 shortcuts · Esc to go back
      </div>

      {/* Ring count badge */}
      {!loading && currentNode && (
        <div style={{
          position: 'absolute', bottom: 12, right: 12, zIndex: 10,
          padding: '4px 10px', fontSize: 10,
          background: 'rgba(22,27,34,0.9)', color: 'rgba(200,210,230,0.95)',
          border: '1px solid rgba(48,54,61,0.95)', borderRadius: 5,
          backdropFilter: 'blur(4px)', pointerEvents: 'none',
        }}>
          {ringNodes.length} around you
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'absolute', bottom: 44, left: '50%', transform: 'translateX(-50%)',
          padding: '6px 14px', fontSize: 11, zIndex: 50,
          background: 'rgba(22,27,34,0.95)', color: '#e6edf3',
          border: '1px solid rgba(68,147,248,0.5)', borderRadius: 20,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          backdropFilter: 'blur(8px)',
        }}>{toast}</div>
      )}

      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(139,148,158,0.7)', fontSize: 12, pointerEvents: 'none',
        }}>Parsing vault…</div>
      )}

      {detailNode && (
        <div data-sidebar="true" onPointerDown={(e) => e.stopPropagation()}>
          <DetailSidebar
            node={detailNode}
            onClose={() => setDetailNode(null)}
            onOpenFile={onOpenFile}
            onAction={runPhaseAction}
          />
        </div>
      )}
    </div>
  );
}
