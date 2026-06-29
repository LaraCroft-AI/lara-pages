// @ts-nocheck
const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8765/vocabulary.html';

async function clearLocalStorage(page) {
  await page.evaluate(() => { try { localStorage.clear(); } catch (_) {} });
}

test.beforeEach(async ({ page }) => {
  await page.goto(BASE);
  await page.waitForFunction(() => typeof allDictionaries !== 'undefined' && Object.keys(allDictionaries).length > 0);
});

test.describe('Initial load and structure', () => {
  test('shows the header with brand + Chinese title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Китайский язык');
    await expect(page.locator('.font-hanzi').filter({ hasText: '汉字' })).toBeVisible();
    await expect(page.locator('header')).toContainText('Персональный интерактивный словарь');
  });

  test('renders dictionary chips for every loaded dictionary', async ({ page }) => {
    const chipCount = await page.locator('.dict-chip').count();
    const knownCount = await page.evaluate(() => Object.keys(allDictionaries).length);
    expect(chipCount).toBe(knownCount);
    expect(knownCount).toBeGreaterThanOrEqual(1);
  });

  test('does NOT pre-select any dictionary', async ({ page }) => {
    const activeChips = await page.locator('.dict-chip.active').count();
    expect(activeChips).toBe(0);
  });

  test('shows a friendly empty-state placeholder on first paint', async ({ page }) => {
    await expect(page.locator('#vocabList')).toContainText('Выберите словари');
    await expect(page.locator('#vocabList .font-hanzi')).toContainText(/选/);
  });

  test('training section is hidden until the user switches to it', async ({ page }) => {
    await expect(page.locator('#training')).toBeHidden();
    await expect(page.locator('#gallery')).toBeVisible();
  });
});

test.describe('Dictionary selection', () => {
  test('clicking a chip adds it to selection and shows cards', async ({ page }) => {
    const firstChip = page.locator('.dict-chip').first();
    await firstChip.click();
    await expect(firstChip).toHaveClass(/active/);
    await expect(page.locator('#vocabList .vocab-card').first()).toBeVisible();
    await expect(page.locator('#searchStats')).toContainText(/Всего слов: \d+/);
  });

  test('clicking again removes it; empty state returns', async ({ page }) => {
    const firstChip = page.locator('.dict-chip').first();
    await firstChip.click();
    await expect(page.locator('.dict-chip.active')).toHaveCount(1);
    await firstChip.click();
    await expect(page.locator('.dict-chip.active')).toHaveCount(0);
    await expect(page.locator('#vocabList')).toContainText('Выберите словари');
  });

  test('selecting multiple dictionaries merges their vocab', async ({ page }) => {
    const chips = page.locator('.dict-chip');
    const total = await chips.count();
    if (total < 2) {
      test.skip(true, 'Only one dictionary available — multi-select not applicable');
    }
    for (let i = 0; i < Math.min(total, 3); i++) await chips.nth(i).click();
    await expect(page.locator('.dict-chip.active')).toHaveCount(Math.min(total, 3));
    const cards = await page.locator('.vocab-card').count();
    expect(cards).toBeGreaterThan(0);
  });
});

test.describe('Search', () => {
  test('filters cards by hanzi, pinyin, and Russian meaning', async ({ page }) => {
    await page.locator('.dict-chip').first().click();
    const cardsBefore = await page.locator('.vocab-card').count();

    // Try a Cyrillic search term that should match the meaning column
    const input = page.locator('#searchInput');
    await input.fill('  '); // sanity: still shows cards
    await expect(page.locator('.vocab-card')).toHaveCount(cardsBefore);

    // Search by a digit; many dictionaries have number words
    await input.fill('один');
    await page.waitForTimeout(50);
    const cnt1 = await page.locator('.vocab-card').count();
    expect(cnt1).toBeLessThanOrEqual(cardsBefore);
    if (cnt1 > 0) {
      await expect(page.locator('.vocab-card').first()).toBeVisible();
    }

    await input.fill('zzz-no-such-word-zzz');
    await page.waitForTimeout(50);
    await expect(page.locator('#vocabList')).toContainText('Ничего не найдено');
  });

  test('shows "Found X of Y" only when there is a query', async ({ page }) => {
    await page.locator('.dict-chip').first().click();
    await expect(page.locator('#searchStats')).toContainText(/Всего слов: \d+/);
    await page.locator('#searchInput').fill('один');
    await page.waitForTimeout(50);
    await expect(page.locator('#searchStats')).toContainText(/Найдено: \d+ из \d+/);
  });
});

test.describe('Training flow', () => {
  test('clicking the Training tab reveals it and prepares a question', async ({ page }) => {
    await page.locator('.dict-chip').first().click();
    await page.locator('#btn-training').click();

    await expect(page.locator('#training')).toBeVisible();
    await expect(page.locator('#questionWord')).not.toHaveText('学');
    await expect(page.locator('#questionMeta')).not.toBeEmpty();

    // Should have 3 options
    await expect(page.locator('.option-btn')).toHaveCount(3);
  });

  test('each option shows pinyin + hanzi (no Russian translation)', async ({ page }) => {
    await page.locator('.dict-chip').first().click();
    await page.locator('#btn-training').click();

    const firstOption = page.locator('.option-btn').first();
    await expect(firstOption).toBeVisible();

    // Pinyin: the .font-semibold block holds the pinyin and should be reasonably large
    const pinyinEl = firstOption.locator('.font-semibold');
    await expect(pinyinEl).not.toBeEmpty();
    const pinyinFontSize = await pinyinEl.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(pinyinFontSize).toBeGreaterThanOrEqual(18);  // ~1.35rem, big enough to read tones

    // Hanzi on the right
    const hanziEl = firstOption.locator('.font-hanzi');
    await expect(hanziEl).not.toBeEmpty();

    // No Russian (Cyrillic) text inside the option button at all
    const optionText = await firstOption.innerText();
    expect(optionText).not.toMatch(/[а-яё]/i);
  });

  test('shows placeholder until a dictionary is selected', async ({ page }) => {
    await page.locator('#btn-training').click();
    await expect(page.locator('#questionMeta')).toContainText('Выберите словари');
    await expect(page.locator('#questionWord')).toContainText(/选|学/);
    await expect(page.locator('.option-btn')).toHaveCount(0);
  });

  test('correct answer removes the word from the pool', async ({ page }) => {
    await page.locator('.dict-chip').first().click();
    await page.locator('#btn-training').click();

    const total = parseInt((await page.locator('#progressText').innerText()).match(/(\d+)/)[1], 10);
    expect(total).toBeGreaterThan(0);

    // Find the option whose hanzi matches the current question word
    const questionWord = (await page.locator('#questionWord').innerText()).trim();
    const correct = page.locator('.option-btn', { has: page.locator('.font-hanzi', { hasText: questionWord }) });
    await correct.first().click();

    await expect(page.locator('#feedback')).toContainText(/Правильно|Попробуй/);
    // After ~1.8s the next question appears
    await page.waitForTimeout(2000);
    const remainingText = await page.locator('#progressText').innerText();
    const remaining = parseInt(remainingText.match(/(\d+)/)[1], 10);
    expect(remaining).toBeLessThan(total);
  });

  test('accuracy counter updates after a few rounds', async ({ page }) => {
    await page.locator('.dict-chip').first().click();
    await page.locator('#btn-training').click();

    for (let i = 0; i < 3; i++) {
      const questionWord = (await page.locator('#questionWord').innerText()).trim();
      const opt = page.locator('.option-btn', { has: page.locator('.font-hanzi', { hasText: questionWord }) }).first();
      await opt.click();
      await page.waitForTimeout(2100);
    }
    const acc = await page.locator('#accuracyText').innerText();
    expect(acc).toMatch(/Точность: \d+%/);
  });
});

test.describe('Reset button', () => {
  test('training reset button restores the original pool size', async ({ page }) => {
    await page.locator('.dict-chip').first().click();
    await page.locator('#btn-training').click();
    const initialTotal = parseInt((await page.locator('#progressText').innerText()).match(/(\d+)/)[1], 10);

    // Click correct answer once to reduce the pool
    const questionWord = (await page.locator('#questionWord').innerText()).trim();
    await page.locator('.option-btn', { has: page.locator('.font-hanzi', { hasText: questionWord }) }).first().click();
    await page.waitForTimeout(2100);
    const after = parseInt((await page.locator('#progressText').innerText()).match(/(\d+)/)[1], 10);
    expect(after).toBeLessThan(initialTotal);

    await page.getByRole('button', { name: /Начать заново/ }).click();
    await page.waitForTimeout(200);
    const reset = parseInt((await page.locator('#progressText').innerText()).match(/(\d+)/)[1], 10);
    expect(reset).toBe(initialTotal);
  });
});

test.describe('Stability', () => {
  test('no console errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => { if (msg.type() === 'error' && !/favicon/i.test(msg.text())) errors.push(msg.text()); });
    await page.reload();
    await page.waitForTimeout(1500);
    expect(errors).toEqual([]);
  });

  test('handles reload mid-training gracefully', async ({ page }) => {
    await page.locator('.dict-chip').first().click();
    await page.locator('#btn-training').click();
    await page.waitForTimeout(200);
    await page.reload();
    await page.waitForFunction(() => typeof allDictionaries !== 'undefined' && Object.keys(allDictionaries).length > 0);
    await expect(page.locator('#vocabList')).toContainText('Выберите словари');
  });
});
