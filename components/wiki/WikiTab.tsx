'use client';

// The "Wiki" subview. Combines the campaign relationship graph, entity-type /
// relationship-kind filters, a spotlight depth control, a click-to-open side
// panel (reusing RelationshipsSection), the review queue (auto-suggested +
// derivation-proposed edges with Accept / Reject), and graph editing: drag to
// reposition, drag node→node to create a link, click an edge to edit its kind /
// weight / visibility. Everything is driven by WikiContext.

import { useMemo, useState } from 'react';
import { Check, X, Wand2, Network, GitMerge, Trash2 } from 'lucide-react';
import { useWiki, WikiProvider } from './WikiContext';
import WikiGraph from './WikiGraph';
import RelationshipsSection from './RelationshipsSection';
import { ENTITY_COLORS, ENTITY_LABELS, edgeColor } from '@/lib/wiki/colors';
import { entityKey, type WikiEntity } from '@/lib/wiki/entities';
import { ruleFor, RELATIONSHIP_CATALOG } from '@/lib/wiki/catalog';
import { effectiveWeight } from '@/lib/wiki/edges';
import { propagateRelationships } from '@/lib/wiki/propagate';
import type { EdgeVisibility, EntityType, Relationship, RelationshipKind } from '@/lib/wiki/types';

export default function WikiTab() {
  const wiki = useWiki();
  const [hiddenTypes, setHiddenTypes] = useState<Set<EntityType>>(new Set());
  const [hiddenKinds, setHiddenKinds] = useState<Set<RelationshipKind>>(new Set());
  const [selected, setSelected] = useState<WikiEntity | null>(null);
  const [edgeEditor, setEdgeEditor] = useState<{ rel: Relationship; x: number; y: number } | null>(
    null,
  );
  const [connectDraft, setConnectDraft] = useState<{ from: WikiEntity; to: WikiEntity } | null>(null);
  const [spotlight, setSpotlight] = useState(false);
  const [depth, setDepth] = useState(2);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const allRels = wiki?.relationships ?? [];
  const confirmed = allRels.filter((r) => !r.suggested && !r.proposed);
  const pending = allRels.filter((r) => r.suggested || r.proposed);
  const allEntities = useMemo(() => wiki?.index.entities ?? [], [wiki?.index]);

  // Which entity types / kinds actually appear, for the filter chips.
  const presentTypes = useMemo(() => {
    const s = new Set<EntityType>();
    for (const e of allEntities) s.add(e.type);
    return [...s].sort();
  }, [allEntities]);

  const presentKinds = useMemo(() => {
    const s = new Set<RelationshipKind>();
    for (const r of confirmed) s.add(r.kind);
    return [...s].sort();
  }, [confirmed]);

  const visibleEntities = useMemo(
    () => allEntities.filter((e) => !hiddenTypes.has(e.type)),
    [allEntities, hiddenTypes],
  );

  const visibleRels = useMemo(
    () => confirmed.filter((r) => !hiddenKinds.has(r.kind)),
    [confirmed, hiddenKinds],
  );

  if (!wiki) return null;

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };

  const selectedKey = selected ? entityKey(selected.type, selected.id) : null;

  const doRescan = () => {
    if (!wiki.rescan) return;
    const n = wiki.rescan();
    setScanMsg(
      n > 0 ? `Found ${n} new suggestion${n === 1 ? '' : 's'}.` : 'No new suggestions found.',
    );
    setTimeout(() => setScanMsg(null), 4000);
  };

  // Derive second-order edges from the confirmed graph and stage them for review.
  const doPropagate = () => {
    if (!wiki.proposeRelationships) return;
    const { proposals } = propagateRelationships(confirmed, (p) => wiki.resolve(p.type, p.id)?.name);
    const added = wiki.proposeRelationships(proposals);
    setScanMsg(
      added > 0
        ? `Proposed ${added} inferred connection${added === 1 ? '' : 's'} for review.`
        : 'No new connections to infer.',
    );
    setTimeout(() => setScanMsg(null), 4000);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg uppercase tracking-wide text-ink">
            <Network size={18} className="text-brass-deep" /> Campaign Wiki
          </h2>
          <p className="font-serif text-xs italic text-ink-mute">
            Every entity and how it connects. Click a node to inspect and edit its relationships.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scanMsg && <span className="font-serif text-xs italic text-brass-deep">{scanMsg}</span>}
          {wiki.proposeRelationships && (
            <button
              onClick={doPropagate}
              className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
              title="Infer second-order connections (friend-of-a-friend, a friend's enemy…) from confirmed ally/enemy links, staged for your review"
            >
              <GitMerge size={12} /> Propagate
            </button>
          )}
          {wiki.rescan && (
            <button
              onClick={doRescan}
              className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
              title="Scan session recaps, the scratchpad, and scene transcripts for @-mentioned entity pairs"
            >
              <Wand2 size={12} /> Scan For Suggestions
            </button>
          )}
        </div>
      </header>

      {pending.length > 0 && (
        <section className="rounded-lg border border-brass/50 bg-brass/5 p-3">
          <h3 className="mb-2 font-display text-sm uppercase tracking-wide text-brass-deep">
            Review Queue ({pending.length})
          </h3>
          <ul className="space-y-1.5">
            {pending.map((r) => {
              const from = wiki.resolve(r.fromType, r.fromId);
              const to = wiki.resolve(r.toType, r.toId);
              const rule = ruleFor(r.kind);
              const origin = r.proposed ? (r.proposedReason ?? 'Derived') : 'Mentioned together';
              return (
                <li
                  key={r.id}
                  data-pending-suggestion
                  className="flex items-center justify-between gap-2 rounded border border-rule bg-parchment px-2 py-1.5"
                >
                  <span className="min-w-0 font-serif text-sm text-ink">
                    <span className="font-display">{from?.name ?? '(removed)'}</span>
                    <span className="mx-1.5 text-ink-mute">
                      {rule?.label.toLowerCase() ?? r.kind}
                    </span>
                    <span className="font-display">{to?.name ?? '(removed)'}</span>
                    <span className="ml-2 rounded-full border border-brass/30 px-1.5 py-px font-display text-[9px] uppercase tracking-wider text-brass-deep">
                      {origin}
                    </span>
                  </span>
                  <span className="flex flex-shrink-0 gap-1">
                    <button
                      onClick={() => wiki.acceptSuggestion(r.id)}
                      className="flex items-center gap-1 rounded border border-moss/50 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-moss hover:bg-moss/10"
                    >
                      <Check size={12} /> Accept
                    </button>
                    <button
                      onClick={() => wiki.rejectSuggestion(r.id)}
                      className="flex items-center gap-1 rounded border border-crimson/50 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson/10"
                    >
                      <X size={12} /> Reject
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Filters */}
      <div className="space-y-2 rounded-lg border border-rule bg-parchment-soft p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
            Entities:
          </span>
          {presentTypes.map((t) => {
            const on = !hiddenTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => setHiddenTypes((s) => toggle(s, t))}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-opacity ${
                  on ? 'border-rule text-ink' : 'border-rule text-ink-faint opacity-50'
                }`}
              >
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: ENTITY_COLORS[t] }}
                />
                {ENTITY_LABELS[t]}
              </button>
            );
          })}
        </div>
        {presentKinds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
              Links:
            </span>
            {presentKinds.map((k) => {
              const on = !hiddenKinds.has(k);
              return (
                <button
                  key={k}
                  onClick={() => setHiddenKinds((s) => toggle(s, k))}
                  className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-opacity ${
                    on ? 'border-rule text-ink' : 'border-rule text-ink-faint opacity-50'
                  }`}
                >
                  <span className="inline-block h-1 w-3" style={{ background: edgeColor(k) }} />
                  {ruleFor(k)?.label ?? k}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex items-center gap-3 pt-1">
          <label className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-ink-soft">
            <input
              type="checkbox"
              checked={spotlight}
              onChange={(e) => setSpotlight(e.target.checked)}
              className="accent-crimson"
            />
            Spotlight
          </label>
          {spotlight && (
            <label className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-ink-soft">
              Depth
              <input
                type="range"
                min={1}
                max={4}
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="accent-crimson"
              />
              <span className="text-ink">{depth}</span>
            </label>
          )}
          <span className="ml-auto font-serif text-xs italic text-ink-mute">
            {visibleEntities.length} entities · {visibleRels.length} links
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
        <WikiGraph
          entities={visibleEntities}
          relationships={visibleRels}
          selectedKey={spotlight ? selectedKey : null}
          spotlightDepth={depth}
          interactive
          savedPositions={wiki.graphPositions}
          onPositionsChange={wiki.setGraphPositions}
          onConnectNodes={(sourceKey, targetKey) => {
            const parse = (key: string) => {
              const idx = key.indexOf(':');
              return wiki.resolve(key.slice(0, idx) as EntityType, key.slice(idx + 1));
            };
            const from = parse(sourceKey);
            const to = parse(targetKey);
            if (from && to && !(from.type === to.type && from.id === to.id)) {
              setEdgeEditor(null);
              setConnectDraft({ from, to });
            }
          }}
          onNodeClick={(e) => {
            setEdgeEditor(null);
            setSelected(e);
          }}
          onEdgeClick={(rel, pos) => setEdgeEditor({ rel, x: pos.x, y: pos.y })}
          onEdgeDelete={(relId) => {
            setEdgeEditor((cur) => (cur && cur.rel.id === relId ? null : cur));
            wiki.removeRelationship(relId);
          }}
        />
        <aside className="rounded-lg border border-rule bg-parchment p-3 shadow-card">
          {selected ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: ENTITY_COLORS[selected.type] }}
                    />
                    <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                      {ENTITY_LABELS[selected.type]}
                    </span>
                  </div>
                  <h3 className="font-display text-base text-ink">{selected.name}</h3>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  aria-label="Close panel"
                  className="text-ink-mute hover:text-crimson"
                >
                  <X size={16} />
                </button>
              </div>
              {selected.body && (
                <p className="font-serif text-xs italic leading-relaxed text-ink-soft">
                  {selected.body}
                </p>
              )}
              <WikiProvider
                value={{
                  ...wiki,
                  navigateToEntity: (type, id) => {
                    const e = wiki.resolve(type, id);
                    if (e) setSelected(e);
                  },
                }}
              >
                <RelationshipsSection
                  entityType={selected.type}
                  entityId={selected.id}
                  entityName={selected.name}
                />
              </WikiProvider>
            </div>
          ) : (
            <p className="font-serif text-sm italic text-ink-mute">
              Click a node in the graph to inspect that entity and add or remove its relationships.
            </p>
          )}
        </aside>
      </div>

      {edgeEditor && (
        <EdgeEditor
          entry={edgeEditor}
          onClose={() => setEdgeEditor(null)}
          onUpdate={(patch) => wiki.updateRelationship?.(edgeEditor.rel.id, patch)}
          onDelete={() => {
            wiki.removeRelationship(edgeEditor.rel.id);
            setEdgeEditor(null);
          }}
        />
      )}

      {connectDraft && (
        <ConnectModal
          from={connectDraft.from}
          to={connectDraft.to}
          onClose={() => setConnectDraft(null)}
          onCreate={(kind) => {
            wiki.addRelationship(
              { type: connectDraft.from.type, id: connectDraft.from.id },
              { type: connectDraft.to.type, id: connectDraft.to.id },
              kind,
            );
            setConnectDraft(null);
          }}
        />
      )}
    </div>
  );
}

// Editable edge inspector. Clicking an edge in the graph opens this; the GM can
// change the relationship kind, weight (0..1), and player-mode visibility, or
// delete the link. All writes go through WikiContext (the CRDT auto-save path).
function EdgeEditor({
  entry,
  onClose,
  onUpdate,
  onDelete,
}: {
  entry: { rel: Relationship; x: number; y: number };
  onClose: () => void;
  onUpdate: (patch: Partial<Omit<Relationship, 'id' | 'createdAt'>>) => void;
  onDelete: () => void;
}) {
  const { rel, x, y } = entry;
  const weight = rel.weight ?? effectiveWeight(rel);
  const visibility: EdgeVisibility = rel.visibility ?? 'private';
  // Valid kinds for this directed pair (fall back to all kinds so an existing
  // edge's kind is always selectable even if the catalog is stricter).
  const validKinds = RELATIONSHIP_CATALOG.filter(
    (rule) => rule.validFrom.includes(rel.fromType) && rule.validTo.includes(rel.toType),
  ).map((r) => r.kind);
  const kinds = validKinds.length > 0 ? validKinds : RELATIONSHIP_CATALOG.map((r) => r.kind);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 w-64 space-y-2 rounded-lg border border-rule bg-parchment p-3 shadow-card"
        style={{ left: Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 280), top: y + 8 }}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
            <span className="inline-block h-1 w-3 rounded" style={{ background: edgeColor(rel.kind) }} />
            Edit Relationship
          </span>
          <button onClick={onClose} aria-label="Close" className="text-ink-mute hover:text-crimson">
            <X size={14} />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Type</span>
          <select
            value={rel.kind}
            onChange={(e) => onUpdate({ kind: e.target.value as RelationshipKind })}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {ruleFor(k)?.label ?? k}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="flex items-center justify-between font-display text-[10px] uppercase tracking-wider text-ink-mute">
            <span>Weight</span>
            <span className="text-ink">{weight.toFixed(2)}</span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={weight}
            onChange={(e) => onUpdate({ weight: Number(e.target.value) })}
            className="w-full accent-crimson"
          />
        </label>

        <label className="block space-y-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
            Player visibility
          </span>
          <select
            value={visibility}
            onChange={(e) => onUpdate({ visibility: e.target.value as EdgeVisibility })}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
          >
            <option value="private">Private (GM only)</option>
            <option value="party">Party (all players)</option>
            <option value="custom">Custom slots</option>
          </select>
        </label>

        <button
          onClick={onDelete}
          className="flex w-full items-center justify-center gap-1 rounded border border-crimson/50 px-2 py-1 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson/10"
        >
          <Trash2 size={12} /> Delete link
        </button>
      </div>
    </>
  );
}

// Kind picker shown when the GM drags one node onto another to create a link.
function ConnectModal({
  from,
  to,
  onClose,
  onCreate,
}: {
  from: WikiEntity;
  to: WikiEntity;
  onClose: () => void;
  onCreate: (kind: RelationshipKind) => void;
}) {
  const validKinds = RELATIONSHIP_CATALOG.filter(
    (rule) => rule.validFrom.includes(from.type) && rule.validTo.includes(to.type),
  ).map((r) => r.kind);
  const kinds = validKinds.length > 0 ? validKinds : RELATIONSHIP_CATALOG.map((r) => r.kind);
  const [kind, setKind] = useState<RelationshipKind>(kinds[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-80 space-y-3 rounded-lg border border-rule bg-parchment p-4 shadow-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm uppercase tracking-wide text-ink">New Connection</h3>
          <button onClick={onClose} aria-label="Close" className="text-ink-mute hover:text-crimson">
            <X size={16} />
          </button>
        </div>
        <p className="font-serif text-sm text-ink">
          <span className="font-display">{from.name}</span>
          <span className="mx-1.5 text-ink-mute">{ruleFor(kind)?.label.toLowerCase() ?? kind}</span>
          <span className="font-display">{to.name}</span>
        </p>
        <label className="block space-y-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Relationship</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as RelationshipKind)}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {ruleFor(k)?.label ?? k}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-rule px-3 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
          >
            Cancel
          </button>
          <button
            onClick={() => onCreate(kind)}
            className="flex items-center gap-1 rounded border border-crimson bg-crimson px-3 py-1 font-display text-xs uppercase tracking-wider text-parchment hover:bg-crimson-deep"
          >
            <Check size={12} /> Create
          </button>
        </div>
      </div>
    </div>
  );
}
