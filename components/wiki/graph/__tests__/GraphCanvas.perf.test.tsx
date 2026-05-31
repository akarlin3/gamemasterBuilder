import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import GraphCanvas from '@/components/wiki/graph/GraphCanvas';
import type { GraphNode, GraphEdge } from '@/lib/wiki/graphModel';

// Minimal jsdom polyfills React Flow expects in a browser environment. We only
// need the existence of the constructors; the simulation under test is the
// graph layout, not the actual DOM measurement.
beforeAll(() => {
  if (typeof (globalThis as any).ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof (globalThis as any).DOMMatrixReadOnly === 'undefined') {
    (globalThis as any).DOMMatrixReadOnly = class {
      m22 = 1;
      constructor(_t?: string) {}
    };
  }
  if (!(window as any).matchMedia) {
    (window as any).matchMedia = () => ({
      matches: false,
      media: '',
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    });
  }
});

afterEach(() => cleanup());

describe('GraphCanvas — 100-node layout perf + render', () => {
  it('renders 100 nodes / ~200 edges without throwing', () => {
    const N = 100;
    const nodes: GraphNode[] = Array.from({ length: N }, (_, i) => ({
      key: `npc:n${i}`,
      type: 'npc',
      id: `n${i}`,
      name: `NPC ${i}`,
    }));
    const edges: GraphEdge[] = [];
    for (let i = 0; i < N; i++) {
      edges.push({
        id: `e-ring-${i}`,
        source: `npc:n${i}`,
        target: `npc:n${(i + 1) % N}`,
        kind: 'knows',
        weight: 0.5,
        directed: false,
      });
      edges.push({
        id: `e-cross-${i}`,
        source: `npc:n${i}`,
        target: `npc:n${(i * 7 + 3) % N}`,
        kind: 'knows',
        weight: 0.3,
        directed: false,
      });
    }
    const clusters = new Map<string, string | null>(nodes.map((n) => [n.key, null] as const));

    const start = Date.now();
    expect(() =>
      render(<GraphCanvas nodes={nodes} edges={edges} clusters={clusters} />),
    ).not.toThrow();
    const elapsed = Date.now() - start;
    // Generous bound — the layout itself is <2s in the pure unit test; rendering
    // adds React Flow setup. Keep it loose to avoid CI flakiness.
    expect(elapsed).toBeLessThan(8000);
  });
});
