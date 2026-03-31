'use client';

import { useState, useEffect, useCallback } from 'react';

interface ToastItem { id: number; msg: string; type: 'success' | 'error' | 'info' }

let _add: ((msg: string, type: ToastItem['type']) => void) | null = null;

export function toast(msg: string, type: ToastItem['type'] = 'success') {
  if (_add) _add(msg, type);
}

export function ToastProvider() {
  const [items, setItems] = useState<ToastItem[]>([]);

  const add = useCallback((msg: string, type: ToastItem['type']) => {
    const id = Date.now() + Math.random();
    setItems(prev => [...prev.slice(-3), { id, msg, type }]);
    setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 3200);
  }, []);

  useEffect(() => {
    _add = add;
    return () => { _add = null; };
  }, [add]);

  if (items.length === 0) return null;

  const colours: Record<ToastItem['type'], { bg: string; border: string; color: string }> = {
    success: { bg: 'rgba(61,224,114,0.12)',  border: 'rgba(61,224,114,0.3)',  color: 'var(--done)'    },
    error:   { bg: 'rgba(245,82,74,0.12)',   border: 'rgba(245,82,74,0.3)',   color: 'var(--blocked)' },
    info:    { bg: 'rgba(77,156,248,0.12)',   border: 'rgba(77,156,248,0.3)',  color: 'var(--accent)'  },
  };

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 7, pointerEvents: 'none', minWidth: 200 }}>
      {items.map(item => {
        const c = colours[item.type];
        return (
          <div key={item.id} style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 12,
            background: c.bg, border: `1px solid ${c.border}`, color: c.color,
            backdropFilter: 'blur(20px) saturate(180%)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            animation: 'slide-up 0.18s cubic-bezier(0.22,0.61,0.36,1)',
            lineHeight: 1.4,
          }}>
            {item.msg}
          </div>
        );
      })}
    </div>
  );
}
