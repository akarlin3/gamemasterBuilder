import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));

import { applyTicks } from '@/lib/world/tick';
import { undoLastBriefing, canUndo } from '@/lib/world/undo';
import { emptyWorldClock, type WorldClock } from '@/lib/world/types';
import { BriefingView } from '@/components/world/BriefingView';

// Integration coverage for the Living World happy-path flow that the (skipped)
// Playwright spec at e2e/living-world.spec.ts would otherwise own. Runs the
// real engine + the real free-tier briefing surface (no browser, no auth).

const NOW = 1_700_000_000_000;

function baseData(over: Partial<Record<string, unknown>> = {}) {
  const wc: WorldClock = emptyWorldClock(NOW);
  return {
    worldClock: wc,
    clocks: [],
    downtime: [],
    factions: [],
    npcs: [],
    ...over,
  } as Record<string, any>;
}

describe('Living World end-to-end pipeline (engine + briefing surface)', () => {
  it('rule fires 3x over 21 days, briefing shows changes, undo reverts everything', () => {
    const data = baseData({
      clocks: [{ id: 'fc-1', text: 'The Cult Rises', filled: 0, max: 8 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'factionClock',
            targetId: 'fc-1',
            trigger: 'everyNDays',
            intervalDays: 7,
            advanceBy: 1,
            paused: false,
          },
        ],
      },
    });

    const { data: ticked, briefing } = applyTicks({ data, toDay: 22, rngSeed: 1, now: NOW });
    expect(briefing.changes).toHaveLength(3);
    expect(ticked.clocks[0].filled).toBe(3);
    expect(ticked.worldClock.currentDay).toBe(22);
    expect(canUndo(ticked)).toBe(true);

    // Briefing surface (free tier) shows one [data-briefing-change] per change.
    render(<BriefingView briefing={briefing} isPro={false} />);
    expect(screen.getAllByText(/The Cult Rises/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-briefing-change]').length).toBe(3);
    // Pro upsell ("Narrated Briefing — Pro") is visible to free users.
    expect(screen.getByText(/Narrated Briefing/)).toBeInTheDocument();
    expect(screen.getByText(/Pro/)).toBeInTheDocument();

    // Undo reverts both the world day and the clock segments.
    const reverted = undoLastBriefing(ticked);
    expect(reverted.worldClock.currentDay).toBe(1);
    expect(reverted.clocks[0].filled).toBe(0);
    expect(canUndo(reverted)).toBe(false);
  });
});
