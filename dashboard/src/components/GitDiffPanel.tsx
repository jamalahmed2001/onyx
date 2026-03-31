'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, CheckCircle, Circle, GitCommit, Loader } from 'lucide-react';
import type { DiffFile, DiffResult } from '@/app/api/gz/projects/[id]/git/diff/route';

interface Props {
  projectId: string;
}

function DiffLineView({ patch }: { patch: string }) {
  return (
    <div style={{ fontFamily: 'monospace', fontSize: 10.5, lineHeight: 1.65, overflowX: 'auto' }}>
      {patch.split('\n').map((line, i) => {
        const cls = line.startsWith('+') && !line.startsWith('+++') ? 'diff-add'
          : line.startsWith('-') && !line.startsWith('---') ? 'diff-del'
          : line.startsWith('@@ ') ? 'diff-hunk'
          : 'diff-ctx';
        return (
          <div key={i} className={cls} style={{ padding: '0 10px', whiteSpace: 'pre', minHeight: 17 }}>
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
}

function FileCard({ file, reviewed, onToggleReview }: {
  file: DiffFile;
  reviewed: boolean;
  onToggleReview: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = file.path.split('/').pop() ?? file.path;
  const dir  = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

  return (
    <div style={{
      border: `1px solid ${reviewed ? 'rgba(61,224,114,0.25)' : 'var(--glass-b)'}`,
      borderRadius: 'var(--r-md)',
      overflow: 'hidden',
      marginBottom: 6,
      background: reviewed ? 'rgba(61,224,114,0.03)' : 'var(--glass)',
      transition: 'border-color 0.2s, background 0.2s',
    }}>
      {/* File header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
          {open ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-str)', fontFamily: 'monospace' }}>{name}</span>
          {dir && <span style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: 'monospace', marginLeft: 6 }}>{dir}/</span>}
        </div>

        {/* Stat chips */}
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          {file.additions > 0 && (
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#3de072', background: 'rgba(61,224,114,0.1)', padding: '1px 6px', borderRadius: 4 }}>+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#f5524a', background: 'rgba(245,82,74,0.1)', padding: '1px 6px', borderRadius: 4 }}>−{file.deletions}</span>
          )}
          <span style={{ fontSize: 9, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 3,
            color: file.status === 'added' ? '#3de072' : file.status === 'deleted' ? '#f5524a' : 'var(--text-faint)',
            background: 'var(--glass)',
          }}>{file.status[0].toUpperCase()}</span>
        </div>

        {/* Review toggle */}
        <button
          onClick={e => { e.stopPropagation(); onToggleReview(); }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: reviewed ? '#3de072' : 'var(--text-faint)', display: 'flex', padding: 2, flexShrink: 0 }}
          title={reviewed ? 'Mark unreviewed' : 'Mark reviewed'}
        >
          {reviewed ? <CheckCircle size={14}/> : <Circle size={14}/>}
        </button>
      </div>

      {/* Diff body */}
      {open && file.patch && (
        <div style={{ borderTop: '1px solid var(--glass-b)', background: 'rgba(0,0,0,0.25)' }}>
          <DiffLineView patch={file.patch}/>
        </div>
      )}
    </div>
  );
}

export default function GitDiffPanel({ projectId }: Props) {
  const [result, setResult]     = useState<DiffResult | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted]   = useState(false);

  useEffect(() => {
    setLoading(true); setError(null); setResult(null); setReviewed(new Set()); setCommitted(false);
    fetch(`/api/gz/projects/${encodeURIComponent(projectId)}/git/diff`)
      .then(r => r.json())
      .then((d: DiffResult & { error?: string }) => {
        if (d.error) { setError(d.error); return; }
        setResult(d);
        if (d.message) setCommitMsg(d.message);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  const toggleReview = (path: string) => {
    setReviewed(r => {
      const n = new Set(r);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  };

  const handleCommit = async () => {
    if (!commitMsg.trim() || !result) return;
    setCommitting(true);
    try {
      await fetch(`/api/gz/projects/${encodeURIComponent(projectId)}/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMsg.trim() }),
      });
      setCommitted(true);
    } finally {
      setCommitting(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: 'var(--text-faint)', fontSize: 12 }}>
      <Loader size={13} className="spin"/> Loading diff…
    </div>
  );

  if (error) return (
    <div style={{ padding: '12px', color: 'var(--text-dim)', fontSize: 11, background: 'var(--glass)', borderRadius: 'var(--r)', border: '1px solid var(--glass-b)' }}>
      {error.includes('no repo path') ? 'No git repo path configured for this project.' : error}
    </div>
  );

  if (!result || result.files.length === 0) return (
    <div style={{ padding: '16px 0', color: 'var(--text-dim)', fontSize: 12 }}>
      No changes found.
    </div>
  );

  const reviewedCount = result.files.filter(f => reviewed.has(f.path)).length;
  const allReviewed = reviewedCount === result.files.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {result.type === 'committed' ? (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--accent)', marginRight: 6 }}>{result.sha}</span>
              {result.message}
            </div>
          ) : (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Uncommitted working changes</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: allReviewed ? '#3de072' : 'var(--text-faint)' }}>
          {reviewedCount}/{result.files.length} reviewed
        </span>
        {!allReviewed && (
          <button onClick={() => setReviewed(new Set(result.files.map(f => f.path)))}
            style={{ fontSize: 10, color: 'var(--accent)', border: '1px solid var(--glass-b-hi)', background: 'none', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}>
            Mark all
          </button>
        )}
      </div>

      {/* Files */}
      <div>
        {result.files.map(f => (
          <FileCard key={f.path} file={f} reviewed={reviewed.has(f.path)} onToggleReview={() => toggleReview(f.path)}/>
        ))}
      </div>

      {/* Commit section — only for working changes */}
      {result.type === 'working' && !committed && (
        <div style={{ borderTop: '1px solid var(--glass-b)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Commit</div>
          <textarea
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            placeholder="feat(project): describe what changed…"
            rows={2}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 'var(--r-sm)',
              border: '1px solid var(--glass-b)', background: 'rgba(0,0,0,0.3)',
              color: 'var(--text-str)', fontSize: 11.5, fontFamily: 'monospace',
              resize: 'none', outline: 'none', lineHeight: 1.5,
            }}
          />
          <button
            onClick={() => void handleCommit()}
            disabled={committing || !commitMsg.trim()}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 'var(--r-sm)',
              border: '1px solid rgba(77,156,248,0.35)',
              background: committing || !commitMsg.trim() ? 'transparent' : 'rgba(77,156,248,0.1)',
              cursor: committing || !commitMsg.trim() ? 'not-allowed' : 'pointer',
              fontSize: 11.5, color: commitMsg.trim() ? 'var(--accent)' : 'var(--text-faint)', fontFamily: 'inherit',
            }}
          >
            <GitCommit size={12}/>
            {committing ? 'Committing…' : 'Commit all changes'}
          </button>
        </div>
      )}

      {committed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3de072', padding: '8px 0' }}>
          <CheckCircle size={14}/> Committed successfully
        </div>
      )}
    </div>
  );
}
