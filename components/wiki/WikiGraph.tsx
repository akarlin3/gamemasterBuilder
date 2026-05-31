'use client';

// Campaign-wide relationship graph. The dependency-free SVG force layout was
// replaced (CP2) with a React Flow canvas backed by a d3-force layout
// (lib/wiki/graphLayout.ts) so the graph stays interactive (pan/zoom/select)
// and clustered by faction at 100+ nodes. It receives the in-memory entity/
// relationship view from WikiTab (no second fetch). Clicking a node selects it
// (parent opens the sidebar editor); clicking an edge opens its editor. When
// `interactive` is set (GM), nodes can be dragged (positions persisted) and
// dragged node→node to create a link. "Spotlight" dims everything more than
// `spotlightDepth` edges from the selected node.

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { entityKey, type WikiEntity } from '@/lib/wiki/entities';
import {
  buildClusters,
  edgesFromRelationships,
  type GraphEdge,
  type GraphNode,
} from '@/lib/wiki/graphModel';
import type { Relationship } from '@/lib/wiki/types';

// React Flow + d3-force are heavy and only needed once the graph is shown, so
// keep them out of the route's initial bundle (and off the SSR path).
const GraphCanvas = dynamic(() => import('./graph/GraphCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[60vh] items-center justify-center rounded-lg border border-rule bg-parchment-soft font-serif text-sm italic text-ink-mute">
      Loading graph…
    </div>
  ),
});

export default function WikiGraph({
  entities,
  relationships,
  selectedKey,
  spotlightDepth,
  onNodeClick,
  onEdgeClick,
  interactive,
  savedPositions,
  onPositionsChange,
  onConnectNodes,
  onEdgeDelete,
}: {
  entities: WikiEntity[];
  relationships: Relationship[];
  selectedKey: string | null;
  spotlightDepth: number;
  onNodeClick: (e: WikiEntity) => void;
  onEdgeClick?: (rel: Relationship, screenPos: { x: number; y: number }) => void;
  interactive?: boolean;
  savedPositions?: Record<string, { x: number; y: number }>;
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  onConnectNodes?: (sourceKey: string, targetKey: string) => void;
  /** GM-only: edge deleted from the canvas (e.g. Delete key on a selected edge). */
  onEdgeDelete?: (relationshipId: string) => void;
}) {
  const nodes = useMemo<GraphNode[]>(
    () =>
      entities.map((e) => ({
        key: entityKey(e.type, e.id),
        type: e.type,
        id: e.id,
        name: e.name,
      })),
    [entities],
  );

  const edges = useMemo<GraphEdge[]>(() => edgesFromRelationships(relationships), [relationships]);

  // Keep only edges whose endpoints are present, for clustering + spotlight.
  const nodeKeys = useMemo(() => new Set(nodes.map((n) => n.key)), [nodes]);
  const presentEdges = useMemo(
    () => edges.filter((e) => nodeKeys.has(e.source) && nodeKeys.has(e.target)),
    [edges, nodeKeys],
  );

  const clusters = useMemo(() => buildClusters(nodes, presentEdges), [nodes, presentEdges]);

  // BFS spotlight: keys within spotlightDepth edges of the selected node.
  const highlightKeys = useMemo(() => {
    if (!selectedKey) return null;
    const adj = new Map<string, string[]>();
    for (const e of presentEdges) {
      (adj.get(e.source) ?? adj.set(e.source, []).get(e.source)!).push(e.target);
      (adj.get(e.target) ?? adj.set(e.target, []).get(e.target)!).push(e.source);
    }
    const within = new Set<string>([selectedKey]);
    let frontier = [selectedKey];
    for (let d = 0; d < spotlightDepth; d++) {
      const next: string[] = [];
      for (const k of frontier) {
        for (const n of adj.get(k) ?? []) {
          if (!within.has(n)) {
            within.add(n);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return within;
  }, [selectedKey, presentEdges, spotlightDepth]);

  const byKey = useMemo(() => new Map(entities.map((e) => [entityKey(e.type, e.id), e])), [entities]);
  const relById = useMemo(() => new Map(relationships.map((r) => [r.id, r])), [relationships]);

  return (
    <GraphCanvas
      nodes={nodes}
      edges={edges}
      clusters={clusters}
      selectedKey={selectedKey}
      highlightKeys={highlightKeys}
      emptyLabel="No entities match the current filters."
      interactive={interactive}
      savedPositions={savedPositions}
      onPositionsChange={onPositionsChange}
      onConnectNodes={onConnectNodes}
      onEdgeDelete={interactive ? onEdgeDelete : undefined}
      onNodeClick={(n) => {
        const ent = byKey.get(n.key);
        if (ent) onNodeClick(ent);
      }}
      onEdgeClick={(e, pos) => {
        const rel = relById.get(e.id);
        if (rel && onEdgeClick) onEdgeClick(rel, pos);
      }}
    />
  );
}
