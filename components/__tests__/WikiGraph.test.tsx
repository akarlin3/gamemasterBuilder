import React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WikiGraph from '@/components/wiki/WikiGraph';
import type { WikiEntity } from '@/lib/wiki/entities';
import type { Relationship } from '@/lib/wiki/types';

// Mock the heavy React Flow canvas: expose props to the test via a singleton
// so we can drive onConnectNodes / onEdgeDelete / onPositionsChange and
// assert the parent → CRDT-shaped callback wiring.
type CapturedProps = {
  onConnectNodes?: (s: string, t: string) => void;
  onEdgeDelete?: (id: string) => void;
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  interactive?: boolean;
};
const captured: { last?: CapturedProps } = {};

vi.mock('next/dynamic', () => ({
  default: () => {
    function MockCanvas(props: CapturedProps) {
      captured.last = props;
      return <div data-testid="mock-graph-canvas" />;
    }
    return MockCanvas;
  },
}));

const entities: WikiEntity[] = [
  { type: 'npc', id: 'n1', name: 'Sera' } as WikiEntity,
  { type: 'faction', id: 'f1', name: 'Crown' } as WikiEntity,
];
const rels: Relationship[] = [
  {
    id: 'e1',
    fromType: 'npc',
    fromId: 'n1',
    toType: 'faction',
    toId: 'f1',
    kind: 'memberOf',
    createdAt: 0,
  },
];

describe('WikiGraph edge delete + drag/connect wiring (CRDT roundtrip)', () => {
  it('propagates onEdgeDelete to parent and (via wiki context) removes the edge from campaign data', () => {
    // Simulated CRDT-backed state container (same shape as setVal/setState).
    let state: { relationships: Relationship[] } = { relationships: [...rels] };
    const setVal = (key: 'relationships', next: Relationship[]) => {
      state = { ...state, [key]: next };
    };
    // The WikiTab onEdgeDelete handler calls wiki.removeRelationship(id), which
    // is what useWikiValue wires to setState(s => removeRelFromList(...)).
    const removeRelationship = (id: string) =>
      setVal('relationships', state.relationships.filter((r) => r.id !== id));

    const onEdgeDelete = vi.fn((id: string) => removeRelationship(id));

    render(
      <WikiGraph
        entities={entities}
        relationships={state.relationships}
        selectedKey={null}
        spotlightDepth={2}
        interactive
        onNodeClick={() => {}}
        onEdgeDelete={onEdgeDelete}
      />,
    );

    expect(captured.last?.interactive).toBe(true);
    expect(captured.last?.onEdgeDelete).toBeTypeOf('function');

    act(() => captured.last!.onEdgeDelete!('e1'));

    expect(onEdgeDelete).toHaveBeenCalledWith('e1');
    expect(state.relationships.find((r) => r.id === 'e1')).toBeUndefined();
    expect(state.relationships).toHaveLength(0);
  });

  it('does not pass onEdgeDelete in non-interactive (player) mode', () => {
    render(
      <WikiGraph
        entities={entities}
        relationships={rels}
        selectedKey={null}
        spotlightDepth={2}
        onNodeClick={() => {}}
        onEdgeDelete={() => {}}
      />,
    );
    expect(captured.last?.onEdgeDelete).toBeUndefined();
  });

  it('propagates drag (onPositionsChange) and connect (onConnectNodes) to parent', () => {
    const onPositionsChange = vi.fn();
    const onConnectNodes = vi.fn();
    render(
      <WikiGraph
        entities={entities}
        relationships={rels}
        selectedKey={null}
        spotlightDepth={2}
        interactive
        onNodeClick={() => {}}
        onPositionsChange={onPositionsChange}
        onConnectNodes={onConnectNodes}
      />,
    );
    act(() => captured.last!.onPositionsChange!({ 'npc:n1': { x: 12, y: 34 } }));
    act(() => captured.last!.onConnectNodes!('npc:n1', 'faction:f1'));
    expect(onPositionsChange).toHaveBeenCalledWith({ 'npc:n1': { x: 12, y: 34 } });
    expect(onConnectNodes).toHaveBeenCalledWith('npc:n1', 'faction:f1');
  });
});
