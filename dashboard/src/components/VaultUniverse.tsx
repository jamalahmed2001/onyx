'use client';

/**
 * VaultUniverse — three-level 3D vault navigation.
 *
 *   Level 0 (Universe):  all project-bundle overviews as labeled spheres spread
 *                        across 3D space. Orbit to look around.
 *   Level 1 (Project):   click a bundle → camera flies to it → its fractal star
 *                        expands: Overview at center, hubs orbiting, leaves
 *                        orbiting each hub. Orbit to inspect.
 *   Level 2 (Detail):    click any leaf → right sidebar slides in with the
 *                        markdown. Scene stays visible. Close sidebar or
 *                        Esc returns to Level 1.
 *
 * Reuses /api/onyx/vault-graph (nodes + links) and /api/onyx/vault-file (raw md).
 * No new backend.
 */

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Stars } from '@react-three/drei';
import * as THREE from 'three';
import type { VaultGraphNode, VaultGraphLink } from '@/app/api/onyx/vault-graph/route';

interface Props {
  onOpenFile: (path: string) => void;
}

// ── Domain palette (matches VaultView's topFolder conventions) ──────────────

const DOMAIN_COLORS: Record<string, string> = {
  '00': '#4493f8', // Dashboard
  '03': '#ff9f0a', // Ventures
  '04': '#00dcb4', // Finance
  '05': '#b478ff', // Systems
  '08': '#dc6e6e', // System
  '09': '#787878', // Archive
  '10': '#ffc850', // OpenClaw
};

function colorForTopFolder(topFolder: string): string {
  const prefix = topFolder.match(/^(\d{2})/)?.[1];
  return (prefix && DOMAIN_COLORS[prefix]) ?? '#9aa4b2';
}

// ── Bundle discovery ────────────────────────────────────────────────────────

interface Bundle {
  id: string;
  label: string;
  topFolder: string;
  overview: VaultGraphNode;
  color: string;
  position: THREE.Vector3;
  linkCount: number;
}

/**
 * A "project bundle" is a directory with an Overview.md or Hub.md file.
 * We detect these by scanning the nodes for label matches, then use the file's
 * parent directory as the bundle identifier.
 */
function detectBundles(nodes: VaultGraphNode[]): VaultGraphNode[] {
  const bundles: VaultGraphNode[] = [];
  const seenDirs = new Set<string>();
  const OVERVIEW_RE = /^(.+\s[-–]\s)?Overview(\.md)?$/i;
  const HUB_RE = /^(.+\s[-–]\s)?(System\s)?Hub(\.md)?$/i;

  // Pass 1 — prefer project-level Overviews (one per directory, deepest wins)
  for (const n of nodes) {
    if (OVERVIEW_RE.test(n.label)) {
      if (!seenDirs.has(n.folder)) {
        seenDirs.add(n.folder);
        bundles.push(n);
      }
    }
  }
  // Pass 2 — add top-level Hubs for domains without an Overview-based bundle
  for (const n of nodes) {
    if (HUB_RE.test(n.label) && n.folder === n.topFolder) {
      const already = bundles.some((b) => b.topFolder === n.topFolder);
      if (!already) bundles.push(n);
    }
  }
  return bundles;
}

/**
 * Lay out bundles on a wide horizontal disc so they're clearly separated with
 * real depth. Uses a golden-angle spiral for a tidy, non-grid layout.
 */
function layoutBundles(nodes: VaultGraphNode[]): Bundle[] {
  const n = nodes.length;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const baseRadius = Math.max(14, 4 + n * 1.2);

  return nodes.map((node, i) => {
    const t = (i + 0.5) / n;
    const radius = Math.sqrt(t) * baseRadius;
    const theta = i * goldenAngle;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    // Small Y variation keeps them from being perfectly flat
    const y = ((i * 0.372) % 1 - 0.5) * radius * 0.25;
    return {
      id: node.id,
      label: cleanLabel(node.label),
      topFolder: node.topFolder,
      overview: node,
      color: colorForTopFolder(node.topFolder),
      position: new THREE.Vector3(x, y, z),
      linkCount: node.linkCount,
    };
  });
}

// ── Project-level fractal-star layout ───────────────────────────────────────

interface ProjectNode {
  node: VaultGraphNode;
  position: THREE.Vector3;
  ring: 0 | 1 | 2;     // 0 = overview, 1 = hub, 2 = leaf
  parentId: string | null;
  color: string;
}

/** Generate N evenly-distributed points on a sphere via the Fibonacci algorithm. */
function fibonacciSphere(count: number, radius: number, yOffset = 0): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  if (count === 1) return [new THREE.Vector3(0, yOffset, 0)];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    points.push(new THREE.Vector3(
      Math.cos(theta) * r * radius,
      y * radius + yOffset,
      Math.sin(theta) * r * radius,
    ));
  }
  return points;
}

function isHubLike(node: VaultGraphNode): boolean {
  return /(overview|hub|kanban)$/i.test(node.label.replace(/\.md$/, ''));
}

/**
 * Build the Level-1 layout for a given bundle. Places the Overview at the
 * origin, hub-like children on a medium-radius sphere, and leaves on an outer
 * sphere clustered near their parent hub.
 */
function layoutProject(
  bundle: Bundle,
  nodes: Map<string, VaultGraphNode>,
  links: VaultGraphLink[],
): ProjectNode[] {
  const out: ProjectNode[] = [];
  const color = bundle.color;

  // Neighbours of the Overview
  const neighbourIds = new Set<string>();
  for (const l of links) {
    if (l.source === bundle.id) neighbourIds.add(l.target);
    else if (l.target === bundle.id) neighbourIds.add(l.source);
  }
  const neighbours: VaultGraphNode[] = [];
  for (const id of neighbourIds) {
    const n = nodes.get(id);
    if (n) neighbours.push(n);
  }

  const hubs = neighbours.filter(isHubLike);
  const leaves = neighbours.filter((n) => !isHubLike(n));

  // Overview at origin
  out.push({
    node: bundle.overview,
    position: new THREE.Vector3(0, 0, 0),
    ring: 0,
    parentId: null,
    color,
  });

  // Hubs on a small sphere
  const hubPositions = fibonacciSphere(hubs.length, 5);
  hubs.forEach((h, i) => {
    out.push({ node: h, position: hubPositions[i], ring: 1, parentId: bundle.id, color });
  });

  // Leaves connected directly to the Overview → spread on a larger sphere
  const overviewLeavesPositions = fibonacciSphere(leaves.length, 9);
  leaves.forEach((l, i) => {
    out.push({ node: l, position: overviewLeavesPositions[i], ring: 2, parentId: bundle.id, color });
  });

  // Leaves connected to a hub (second-degree neighbours of the Overview) —
  // place them orbiting their hub on a local small sphere.
  const alreadyPlaced = new Set(out.map((p) => p.node.id));
  for (const hub of hubs) {
    const hubNeighbours = new Set<string>();
    for (const l of links) {
      if (l.source === hub.id) hubNeighbours.add(l.target);
      else if (l.target === hub.id) hubNeighbours.add(l.source);
    }
    const toPlace: VaultGraphNode[] = [];
    for (const id of hubNeighbours) {
      if (alreadyPlaced.has(id) || id === bundle.id) continue;
      const n = nodes.get(id);
      if (n) toPlace.push(n);
    }
    const local = fibonacciSphere(toPlace.length, 2.2);
    const hubPos = out.find((p) => p.node.id === hub.id)!.position;
    toPlace.forEach((leaf, i) => {
      alreadyPlaced.add(leaf.id);
      out.push({
        node: leaf,
        position: new THREE.Vector3().copy(hubPos).add(local[i]),
        ring: 2,
        parentId: hub.id,
        color,
      });
    });
  }

  return out;
}

function cleanLabel(label: string): string {
  return label.replace(/\.md$/, '').replace(/^\d+\s*[-–]\s*/, '');
}

// ── 3D nodes ────────────────────────────────────────────────────────────────

function BundleSphere({
  bundle, onClick, faded,
}: { bundle: Bundle; onClick: () => void; faded: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const radius = Math.max(0.8, Math.min(2.4, 0.9 + bundle.linkCount * 0.05));
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.15;
  });

  return (
    <group position={bundle.position}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = ''; }}
      >
        <sphereGeometry args={[radius, 32, 24]} />
        <meshStandardMaterial
          color={bundle.color}
          emissive={bundle.color}
          emissiveIntensity={hovered ? 0.8 : 0.4}
          roughness={0.5}
          metalness={0.1}
          opacity={faded ? 0.15 : 1}
          transparent={faded}
        />
      </mesh>
      {/* Glow halo */}
      <mesh>
        <sphereGeometry args={[radius * 1.6, 24, 16]} />
        <meshBasicMaterial color={bundle.color} transparent opacity={faded ? 0.02 : (hovered ? 0.18 : 0.09)} />
      </mesh>
      {!faded && (
        <Html
          position={[0, radius + 0.9, 0]}
          center
          distanceFactor={10}
          style={{
            pointerEvents: 'none',
            color: '#e6edf3',
            fontSize: 12,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontWeight: 600,
            textShadow: '0 2px 6px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
          }}
        >
          {bundle.label}
        </Html>
      )}
    </group>
  );
}

function ProjectNodeMesh({
  n, onClick,
}: { n: ProjectNode; onClick: (node: VaultGraphNode) => void }) {
  const [hovered, setHovered] = useState(false);
  const radius = n.ring === 0 ? 0.9 : n.ring === 1 ? 0.5 : 0.3;
  const isPhase = n.node.isPhase;
  const phaseStatus = n.node.phaseStatus;
  const isActive = phaseStatus === 'active' || phaseStatus === 'ready';
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current && isActive) {
      // Subtle pulse on ready/active phases
      const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.08;
      meshRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={n.position}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(n.node); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = ''; }}
      >
        <sphereGeometry args={[radius, 20, 16]} />
        <meshStandardMaterial
          color={n.color}
          emissive={n.color}
          emissiveIntensity={hovered ? 0.9 : (isActive ? 0.6 : 0.25)}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>
      {(n.ring <= 1 || hovered) && (
        <Html
          position={[0, radius + 0.3, 0]}
          center
          distanceFactor={8}
          style={{
            pointerEvents: 'none',
            color: n.ring === 0 ? '#fff' : '#e6edf3',
            fontSize: n.ring === 0 ? 12 : 10,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontWeight: n.ring === 0 ? 700 : 500,
            textShadow: '0 2px 6px rgba(0,0,0,0.9)',
            whiteSpace: 'nowrap',
            opacity: n.ring === 2 ? 0.85 : 1,
          }}
        >
          {cleanLabel(n.node.label)}
        </Html>
      )}
    </group>
  );
}

function ProjectEdges({ projectNodes }: { projectNodes: ProjectNode[] }) {
  const lines = useMemo(() => {
    const out: Array<{ a: THREE.Vector3; b: THREE.Vector3; color: string }> = [];
    const byId = new Map(projectNodes.map((p) => [p.node.id, p]));
    for (const n of projectNodes) {
      if (!n.parentId) continue;
      const parent = byId.get(n.parentId) ?? projectNodes.find((p) => p.ring === 0);
      if (!parent) continue;
      out.push({ a: parent.position, b: n.position, color: n.color });
    }
    return out;
  }, [projectNodes]);

  return (
    <group>
      {lines.map((l, i) => (
        <line key={i}>
          <bufferGeometry attach="geometry">
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([l.a.x, l.a.y, l.a.z, l.b.x, l.b.y, l.b.z]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color={l.color} transparent opacity={0.35} />
        </line>
      ))}
    </group>
  );
}

// ── Camera animation ────────────────────────────────────────────────────────

interface CameraTarget { position: THREE.Vector3; lookAt: THREE.Vector3 }

function CameraFlyer({ target, controlsRef }: { target: CameraTarget; controlsRef: React.RefObject<{ target: THREE.Vector3; update: () => void } | null> }) {
  const { camera } = useThree();
  useFrame(() => {
    camera.position.lerp(target.position, 0.08);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(target.lookAt, 0.12);
      controlsRef.current.update();
    }
  });
  return null;
}

// ── Detail sidebar ──────────────────────────────────────────────────────────

function DetailSidebar({
  node, onClose, onOpenFile,
}: { node: VaultGraphNode; onClose: () => void; onOpenFile: (p: string) => void }) {
  const [raw, setRaw] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setRaw(null);
    setErr(null);
    fetch(`/api/onyx/vault-file?path=${encodeURIComponent(node.id)}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((d: { raw?: string; content?: string }) => setRaw(d.raw ?? d.content ?? ''))
      .catch((e) => setErr(String(e)));
  }, [node.id]);

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(520px, 42vw)',
      background: 'rgba(13,17,23,0.96)', borderLeft: '1px solid rgba(48,54,61,0.9)',
      backdropFilter: 'blur(10px)', display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.5)', zIndex: 20,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
        borderBottom: '1px solid rgba(48,54,61,0.9)', flexShrink: 0,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {cleanLabel(node.label)}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(139,148,158,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {node.id}
          </div>
        </div>
        <button onClick={() => onOpenFile(node.id)} style={{
          padding: '4px 9px', fontSize: 10, fontFamily: 'inherit',
          background: 'rgba(68,147,248,0.15)', color: '#4493f8',
          border: '1px solid rgba(68,147,248,0.5)', borderRadius: 4, cursor: 'pointer',
        }}>Open</button>
        <button onClick={onClose} style={{
          padding: '4px 9px', fontSize: 10, fontFamily: 'inherit',
          background: 'rgba(22,27,34,0.85)', color: 'rgba(200,210,230,0.9)',
          border: '1px solid rgba(48,54,61,0.9)', borderRadius: 4, cursor: 'pointer',
        }}>Close</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', fontSize: 11, lineHeight: 1.55, color: 'var(--text-dim, #9aa4b2)', fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' }}>
        {err ? (
          <div style={{ color: '#dc6e6e' }}>Failed to load: {err}</div>
        ) : raw === null ? (
          <div style={{ color: 'rgba(139,148,158,0.5)' }}>Loading…</div>
        ) : raw}
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

type Level = 'universe' | 'project';

export default function VaultUniverse({ onOpenFile }: Props) {
  const [nodes, setNodes] = useState<Map<string, VaultGraphNode>>(new Map());
  const [links, setLinks] = useState<VaultGraphLink[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);

  const [level, setLevel] = useState<Level>('universe');
  const [focusedBundleId, setFocusedBundleId] = useState<string | null>(null);
  const [detailNode, setDetailNode] = useState<VaultGraphNode | null>(null);

  const controlsRef = useRef<{ target: THREE.Vector3; update: () => void } | null>(null);

  // ── Data fetch ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/onyx/vault-graph').then((r) => r.json()).then(
      (d: { nodes: VaultGraphNode[]; links: VaultGraphLink[] }) => {
        const map = new Map<string, VaultGraphNode>();
        for (const n of d.nodes) map.set(n.id, n);
        setNodes(map);
        setLinks(d.links);
        setBundles(layoutBundles(detectBundles(d.nodes)));
        setLoading(false);
      },
    );
  }, []);

  // ── Project layout derived from focused bundle ────────────────────────────
  const focusedBundle = useMemo(
    () => bundles.find((b) => b.id === focusedBundleId) ?? null,
    [bundles, focusedBundleId],
  );

  const projectNodes = useMemo(() => {
    if (!focusedBundle) return [];
    return layoutProject(focusedBundle, nodes, links);
  }, [focusedBundle, nodes, links]);

  // ── Camera target ─────────────────────────────────────────────────────────
  const cameraTarget: CameraTarget = useMemo(() => {
    if (level === 'project' && focusedBundle) {
      // Position camera outside the project sphere, looking at the Overview
      const dir = focusedBundle.position.clone().normalize();
      const pos = focusedBundle.position.clone().add(dir.multiplyScalar(14));
      pos.y += 3;
      return { position: pos, lookAt: focusedBundle.position };
    }
    // Universe view — far enough back to see everything
    const span = Math.max(22, bundles.length * 1.8);
    return {
      position: new THREE.Vector3(0, span * 0.5, span),
      lookAt: new THREE.Vector3(0, 0, 0),
    };
  }, [level, focusedBundle, bundles.length]);

  // ── Navigation actions ────────────────────────────────────────────────────
  const enterBundle = useCallback((id: string) => {
    setFocusedBundleId(id);
    setLevel('project');
  }, []);

  const goBack = useCallback(() => {
    if (detailNode) { setDetailNode(null); return; }
    if (level === 'project') { setLevel('universe'); setFocusedBundleId(null); return; }
  }, [detailNode, level]);

  // ESC key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goBack]);

  // Offset project nodes by the bundle's position (so they render in the right place in world space)
  const projectNodesInWorld = useMemo(() => {
    if (!focusedBundle) return [];
    return projectNodes.map((p) => ({
      ...p,
      position: p.position.clone().add(focusedBundle.position),
    }));
  }, [projectNodes, focusedBundle]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#05070d' }}>
      <Canvas
        camera={{ position: [0, 15, 30], fov: 50, near: 0.1, far: 500 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.4} />
          <pointLight position={[10, 20, 10]} intensity={1} />
          <pointLight position={[-10, -10, -10]} intensity={0.5} color="#4493f8" />
          <Stars radius={200} depth={50} count={1500} factor={5} fade speed={0.5} />

          <OrbitControls
            ref={controlsRef as unknown as React.Ref<never>}
            enablePan={false}
            minDistance={3}
            maxDistance={80}
            dampingFactor={0.08}
            enableDamping
          />

          <CameraFlyer target={cameraTarget} controlsRef={controlsRef} />

          {/* Level 0: Universe — all bundles */}
          {bundles.map((b) => (
            <BundleSphere
              key={b.id}
              bundle={b}
              onClick={() => enterBundle(b.id)}
              faded={level === 'project' && b.id !== focusedBundleId}
            />
          ))}

          {/* Level 1: Project — fractal star for focused bundle */}
          {level === 'project' && focusedBundle && (
            <>
              <ProjectEdges projectNodes={projectNodesInWorld} />
              {projectNodesInWorld.map((p) => (
                <ProjectNodeMesh
                  key={p.node.id}
                  n={p}
                  onClick={(node) => setDetailNode(node)}
                />
              ))}
            </>
          )}
        </Suspense>
      </Canvas>

      {/* ── Overlays ──────────────────────────────────────────────────────── */}

      {/* Breadcrumb */}
      <div style={{
        position: 'absolute', top: 12, left: 12, zIndex: 10,
        display: 'flex', gap: 6, alignItems: 'center',
        fontSize: 11, color: 'rgba(200,210,230,0.7)', pointerEvents: 'none',
      }}>
        <span style={{ opacity: level === 'universe' ? 1 : 0.6, fontWeight: level === 'universe' ? 600 : 400 }}>
          Universe
        </span>
        {focusedBundle && (
          <>
            <span style={{ opacity: 0.4 }}>›</span>
            <span style={{ color: focusedBundle.color, fontWeight: 600 }}>
              {focusedBundle.label}
            </span>
          </>
        )}
        {detailNode && (
          <>
            <span style={{ opacity: 0.4 }}>›</span>
            <span style={{ color: '#e6edf3', fontWeight: 500 }}>
              {cleanLabel(detailNode.label)}
            </span>
          </>
        )}
      </div>

      {/* Back button */}
      {(level === 'project' || detailNode) && (
        <button onClick={goBack} style={{
          position: 'absolute', top: 36, left: 12, zIndex: 10,
          padding: '5px 12px', fontSize: 11, fontFamily: 'inherit',
          background: 'rgba(22,27,34,0.85)', color: 'rgba(200,210,230,0.9)',
          border: '1px solid rgba(48,54,61,0.9)', borderRadius: 5, cursor: 'pointer',
          backdropFilter: 'blur(4px)',
        }}>← Back (Esc)</button>
      )}

      {/* Help */}
      <div style={{
        position: 'absolute', bottom: 12, left: 12, zIndex: 10,
        fontSize: 10, color: 'rgba(139,148,158,0.5)', pointerEvents: 'none',
      }}>
        {level === 'universe'
          ? 'Click a project to enter · drag to orbit · scroll to zoom'
          : 'Click a node to open · drag to orbit · Esc to go back'}
      </div>

      {/* Bundle count */}
      {!loading && (
        <div style={{
          position: 'absolute', bottom: 12, right: 12, zIndex: 10,
          padding: '4px 10px', fontSize: 10,
          background: 'rgba(22,27,34,0.85)', color: 'rgba(200,210,230,0.9)',
          border: '1px solid rgba(48,54,61,0.9)', borderRadius: 5,
          backdropFilter: 'blur(4px)', pointerEvents: 'none',
        }}>
          {level === 'universe'
            ? `${bundles.length} project${bundles.length === 1 ? '' : 's'}`
            : `${projectNodes.length} nodes · ${projectNodes.filter(p => p.ring === 1).length} hubs · ${projectNodes.filter(p => p.ring === 2).length} leaves`}
        </div>
      )}

      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(139,148,158,0.7)', fontSize: 12, pointerEvents: 'none',
        }}>Parsing vault…</div>
      )}

      {/* Detail sidebar */}
      {detailNode && (
        <DetailSidebar
          node={detailNode}
          onClose={() => setDetailNode(null)}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  );
}
