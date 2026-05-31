'use client';

// Shared React Flow canvas for the campaign node graph. Used by both the GM
// graph (WikiGraph) and the read-only player graph. It renders the
// GraphNode/GraphEdge model it is handed, runs a d3-force layout once per
// structural change, and reports node/edge clicks upward.
//
// Interactivity is opt-in via `interactive` (GM only): when on, nodes can be
// dragged (final positions reported through onPositionsChange and pinned) and
// dragged node→node to propose a new edge (onConnectNodes). The player graph
// leaves `interactive` off, so it stays pan/zoom/select with a settled layout.

import { useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  useNodesState,
  ConnectionMode,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { computeLayout } from '@/lib/wiki/graphLayout';
import { ENTITY_COLORS } from '@/lib/wiki/colors';
import type { GraphNode, GraphEdge } from '@/lib/wiki/graphModel';
import { EntityNode } from './EntityNode';
import { RelationshipEdge, arrowMarker } from './RelationshipEdge';

const nodeTypes = { entity: EntityNode };
const edgeTypes = { relationship: RelationshipEdge };

export type GraphCanvasProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** nodeKey -> faction cluster id (or null). From buildClusters(). */
  clusters: Map<string, string | null>;
  selectedKey?: string | null;
  /** Spotlight set: when non-null, nodes/edges outside it are dimmed. */
  highlightKeys?: Set<string> | null;
  onNodeClick?: (node: GraphNode) => void;
  onEdgeClick?: (edge: GraphEdge, screenPos: { x: number; y: number }) => void;
  emptyLabel?: string;
  /** GM editing: enable node drag + connect-to-create. */
  interactive?: boolean;
  /** Persisted (pinned) node positions; override the computed layout. */
  savedPositions?: Record<string, { x: number; y: number }>;
  /** Report dragged node positions (final, on drag stop). */
  onPositionsChange?: (positions: Record<string, { x: number; y: number }>) => void;
  /** A node was dragged onto another — propose an edge between them. */
  onConnectNodes?: (sourceKey: string, targetKey: string) => void;
  /** GM-only: an edge was deleted from the canvas (React Flow remove / Delete key). */
  onEdgeDelete?: (edgeId: string) => void;
};

function GraphCanvasInner({
  nodes,
  edges,
  clusters,
  selectedKey,
  highlightKeys,
  onNodeClick,
  onEdgeClick,
  emptyLabel = 'Nothing to graph yet.',
  interactive = false,
  savedPositions,
  onPositionsChange,
  onConnectNodes,
  onEdgeDelete,
}: GraphCanvasProps) {
  const { fitView } = useReactFlow();

  const nodeKeys = useMemo(() => new Set(nodes.map((n) => n.key)), [nodes]);
  const presentEdges = useMemo(
    () => edges.filter((e) => nodeKeys.has(e.source) && nodeKeys.has(e.target) && e.source !== e.target),
    [edges, nodeKeys],
  );

  // Structural keys: the force layout only recomputes when the node/edge set or
  // clustering changes — not on selection/spotlight/drag.
  const nodesSig = useMemo(() => nodes.map((n) => n.key).sort().join(','), [nodes]);
  const edgesSig = useMemo(
    () => presentEdges.map((e) => `${e.source}>${e.target}:${e.weight.toFixed(2)}`).sort().join(','),
    [presentEdges],
  );
  const clusterSig = useMemo(
    () => [...clusters.entries()].map(([k, v]) => `${k}=${v ?? ''}`).sort().join(','),
    [clusters],
  );
  const savedSig = useMemo(
    () => Object.entries(savedPositions ?? {}).map(([k, p]) => `${k}:${p.x.toFixed(0)},${p.y.toFixed(0)}`).sort().join(','),
    [savedPositions],
  );

  const positions = useMemo(() => {
    const computed = computeLayout(
      nodes.map((n) => ({ id: n.key, cluster: clusters.get(n.key) ?? null })),
      presentEdges.map((e) => ({ source: e.source, target: e.target, weight: e.weight })),
    );
    // Pinned (dragged) positions win over the computed layout.
    return { ...computed, ...(savedPositions ?? {}) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesSig, edgesSig, clusterSig, savedSig]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);

  // Reset node list (positions + data) when structure or layout changes.
  useEffect(() => {
    setRfNodes(
      nodes.map((n) => ({
        id: n.key,
        type: 'entity',
        position: positions[n.key] ?? { x: 0, y: 0 },
        data: {
          type: n.type,
          name: n.name,
          selected: n.key === selectedKey,
          dimmed: !!highlightKeys && !highlightKeys.has(n.key),
          connectable: interactive,
        },
        draggable: interactive,
        selectable: true,
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodesSig, positions, interactive]);

  // Update only data (selection/spotlight) without disturbing positions.
  useEffect(() => {
    setRfNodes((prev) =>
      prev.map((rn) => ({
        ...rn,
        data: {
          ...rn.data,
          selected: rn.id === selectedKey,
          dimmed: !!highlightKeys && !highlightKeys.has(rn.id),
        },
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, highlightKeys]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      presentEdges.map((e) => {
        const dimmed = !!highlightKeys && (!highlightKeys.has(e.source) || !highlightKeys.has(e.target));
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'relationship',
          data: { kind: e.kind, weight: e.weight, directed: e.directed, dimmed },
          markerEnd: e.directed ? arrowMarker(e.kind) : undefined,
        };
      }),
    [presentEdges, highlightKeys],
  );

  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 60);
    return () => clearTimeout(t);
  }, [nodesSig, fitView]);

  if (nodes.length === 0) {
    return (
      <div className="flex h-[60vh] items-center justify-center rounded-lg border border-dashed border-rule bg-parchment-soft text-center font-serif text-sm italic text-ink-mute">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="h-[60vh] overflow-hidden rounded-lg border border-rule bg-parchment-soft shadow-card">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        minZoom={0.1}
        maxZoom={2.5}
        nodesDraggable={interactive}
        nodesConnectable={interactive}
        elementsSelectable
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        onNodeDragStop={(_, node) => {
          if (interactive) onPositionsChange?.({ [node.id]: { x: node.position.x, y: node.position.y } });
        }}
        onConnect={(c: Connection) => {
          if (interactive && c.source && c.target && c.source !== c.target) {
            onConnectNodes?.(c.source, c.target);
          }
        }}
        edgesFocusable={interactive}
        deleteKeyCode={interactive ? ['Backspace', 'Delete'] : null}
        onEdgesDelete={(removed) => {
          if (!interactive) return;
          for (const e of removed) onEdgeDelete?.(e.id);
        }}
        onNodeClick={(_, node) => {
          const n = nodes.find((x) => x.key === node.id);
          if (n) onNodeClick?.(n);
        }}
        onEdgeClick={(evt, edge) => {
          const e = presentEdges.find((x) => x.id === edge.id);
          if (e) onEdgeClick?.(e, { x: evt.clientX, y: evt.clientY });
        }}
      >
        <Background color="#d8cbb0" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          nodeColor={(n) => ENTITY_COLORS[(n.data as { type?: keyof typeof ENTITY_COLORS })?.type ?? 'scene'] ?? '#52443a'}
          maskColor="rgba(90,76,58,0.15)"
        />
      </ReactFlow>
    </div>
  );
}

export default function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
