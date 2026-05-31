import { test, expect } from '@playwright/test';

// Living World Tick — happy-path E2E (Appendix G), written against the real UI
// selectors built for this feature:
//   - Library → "Living World" tab
//   - "Add Tick Rule" → AddRuleForm (select[name="trigger"], input[name="intervalDays"],
//     input[name="advanceBy"], "Save Rule")
//   - Advance → PreviewModal (input[name="targetDay"], "Preview"/"Apply",
//     [data-preview-change])
//   - Briefing log ([data-briefing-change]) and "Undo Last Tick"
//
// SKIPPED: these steps require an authenticated session and a seeded campaign.
// The Playwright setup here boots with dummy public Firebase config and, by
// design (see playwright.config.ts), only exercises the unauthenticated
// surface. Wiring real auth + a `seedCampaign` helper (Firebase Auth emulator)
// is the follow-up that lets this run. The deterministic engine that backs
// every assertion below is fully covered by lib/world/__tests__/tick.test.ts;
// the end-to-end pipeline (rule -> applyTicks -> briefing -> undo + free-tier
// briefing surface) is covered by components/__tests__/livingWorldPipeline.test.tsx.
test.describe.skip('Living World Tick happy path (needs auth + seed helpers)', () => {
  test('rule fires 3x over 21 days, briefing shows, undo reverts', async ({ page }) => {
    // const { campaignId } = await seedCampaign(page, {
    //   clocks: [{ id: 'fc-1', text: 'The Cult Rises', filled: 0, max: 8 }],
    // });
    const campaignId = 'seeded-campaign-id';
    await page.goto(`/campaign/${campaignId}`);

    // Open Library → Living World.
    await page.getByRole('button', { name: 'Library' }).click();
    await page.getByRole('button', { name: 'Living World' }).click();

    // Create a tick rule: faction clock, every 7 days, +1.
    await page.getByRole('button', { name: 'Add Tick Rule' }).click();
    await page.selectOption('select[name="targetType"]', 'factionClock');
    await page.selectOption('select[name="trigger"]', 'everyNDays');
    await page.fill('input[name="intervalDays"]', '7');
    await page.fill('input[name="advanceBy"]', '1');
    await page.getByRole('button', { name: 'Save Rule' }).click();

    // Advance to Day 22 (current = 1) → rule fires 3x.
    await page.getByRole('button', { name: 'Advance To Next Session' }).click();
    await page.fill('input[name="targetDay"]', '22');
    await expect(page.locator('[data-preview-change]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Apply' }).click();

    // Briefing now lists 3 changes.
    await expect(page.locator('[data-briefing-change]')).toHaveCount(3);
    await expect(page.getByText('The Cult Rises')).toBeVisible();

    // Undo reverts the clock and the day counter.
    await page.getByRole('button', { name: 'Undo Last Tick' }).click();
    await expect(page.getByText(/In-World Day 1/)).toBeVisible();
  });

  test('free-tier briefing shows bullets + Pro CTA', async ({ page }) => {
    await page.goto('/campaign/seeded-campaign-id');
    await page.getByRole('button', { name: 'Library' }).click();
    await page.getByRole('button', { name: 'Living World' }).click();
    await page.getByRole('button', { name: 'Advance 1 Week' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    // Free users see the Pro upsell on the narrative.
    await expect(page.getByText(/Pro/i)).toBeVisible();
  });
});
