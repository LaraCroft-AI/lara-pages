const { test, expect } = require('@playwright/test');
const BASE = 'http://127.0.0.1:8765/vocabulary.html';

async function openMaps(page, hash = '#maps') {
  await page.goto(BASE + hash);
  await expect(page.locator('#maps-content')).toBeVisible();
}
async function listView(page) {
  await page.locator('[data-view="list"]').click();
}

test('section navigation preserves lesson selection and training mode', async ({ page }) => {
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Урок 1', exact: true }).click();
  await page.locator('#btn-training').click();
  await page.locator('#mode-hanzi2ru').click();
  const question = await page.locator('#questionWord').textContent();
  await page.locator('#nav-maps').click();
  await expect(page.locator('#maps-content')).toBeVisible();
  await expect(page.locator('#lessons')).toBeHidden();
  await page.locator('#nav-lessons').click();
  await expect(page.locator('#training')).toBeVisible();
  await expect(page.locator('#questionWord')).toHaveText(question);
  await expect(page.locator('#mode-hanzi2ru')).toHaveClass(/active/);
  await page.locator('#btn-gallery').click();
  await expect(page.locator('#vocabList .vocab-card')).toHaveCount(14);
  await page.locator('#btn-training').click();
  await expect(page.locator('#mode-hanzi2ru')).toHaveClass(/active/);
  await page.goBack();
  await expect(page.locator('#maps')).toBeVisible();
});

test('radical map uses character radicals from the remaining lessons', async ({ page }) => {
  await openMaps(page);
  await listView(page);
  await expect(page.locator('#map-title')).toContainText('亻');
  const words = await page.locator('#map-word-list .map-glyph').allTextContents();
  expect(words).toContain('他');
  expect(words).not.toContain('你');
  expect(words).toContain('他们');
  expect(words).not.toContain('她');
  expect(words).not.toContain('喝');
  await expect(page.locator('[data-node="亻"]')).toHaveAttribute('aria-pressed', 'true');
});

test('character map, exact HSK filters, deep link and reload agree', async ({ page }) => {
  await openMaps(page, '#maps?type=character&node=学&level=1');
  await listView(page);
  await expect(page.locator('#map-title')).toContainText('学');
  const words = await page.locator('#map-word-list .map-glyph').allTextContents();
  expect(words).toContain('学习');
  expect(words).not.toContain('学生');
  expect(words).toContain('学校');
  expect(words).not.toContain('学');
  expect(words.every(word => word.includes('学'))).toBe(true);
  for (const label of await page.locator('#map-word-list .map-level').allTextContents()) expect(label).toBe('HSK 3.0: 1');
  await page.locator('[data-level="2"]').click();
  await expect(page).toHaveURL(/level=2/);
  await page.reload();
  await expect(page.locator('[data-level="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map-title')).toContainText('学');
});

test('search supports hanzi, toneless pinyin, Russian and empty results', async ({ page }) => {
  await openMaps(page);
  await page.locator('#map-search').fill('shui');
  await expect(page.locator('#map-node-list .map-node')).toHaveCount(1);
  await expect(page.locator('#map-node-list')).toContainText('氵');
  await page.locator('#map-search').fill('дерево');
  await page.locator('[data-node="木"]').click();
  await expect(page.locator('#map-title')).toContainText('木');
  await page.locator('#map-search').fill('несуществующийузел');
  await expect(page.locator('#map-node-empty')).toBeVisible();
  await page.locator('#map-search').fill('');
  await expect(page.locator('#map-node-empty')).toBeHidden();
});

test('map paging reaches all words without overlapping cards or page overflow', async ({ page }, testInfo) => {
  await openMaps(page, '#maps?type=character&node=天&level=all');
  await page.locator('#maps').screenshot({ path: testInfo.outputPath('maps-responsive.png') });
  await page.locator('[data-view="map"]').click();
  const seen = [];
  while (true) {
    seen.push(...await page.locator('#map-canvas .map-word .map-glyph').allTextContents());
    const overlaps = await page.locator('#map-canvas .map-word').evaluateAll(nodes => {
      const boxes = nodes.map(node => node.getBoundingClientRect());
      return boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top));
    });
    expect(overlaps).toBe(false);
    if (await page.locator('#map-next').isDisabled()) break;
    await page.locator('#map-next').click();
  }
  await listView(page);
  const all = await page.locator('#map-word-list .map-glyph').allTextContents();
  expect(seen).toEqual(all);
  expect(new Set(seen).size).toBe(all.length);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('empty level state recovers and unlisted words remain accessible', async ({ page }) => {
  await openMaps(page, '#maps?type=character&node=学&level=7–9');
  await expect(page.locator('#map-empty')).toBeVisible();
  await expect(page.locator('#map-print')).toBeDisabled();
  await page.locator('#map-reset-level').click();
  await expect(page.locator('#map-empty')).toBeHidden();
  await page.locator('[data-level="none"]').click();
  await page.locator('[data-map-type="radical"]').click();
  await listView(page);
  const levels = await page.locator('#map-word-list .map-level').allTextContents();
  expect(levels.length).toBeGreaterThan(0);
  expect(levels.every(level => level === 'Вне списка HSK')).toBe(true);
});

test('word activation reveals full translation and requests Chinese speech', async ({ page }) => {
  await page.addInitScript(() => {
    window.speechSynthesis.speak = utterance => { window.testSpeech = { text: utterance.text, lang: utterance.lang }; };
  });
  await openMaps(page, '#maps?type=character&node=学&level=1');
  await listView(page);
  const first = page.locator('#map-word-list .map-word').first();
  const word = await first.locator('.map-glyph').textContent();
  await first.press('Enter');
  await expect(page.locator('#map-word-detail')).toContainText(word);
  expect(await page.evaluate(() => window.testSpeech)).toEqual({ text: word, lang: 'zh-CN' });
});

test('print maps and worksheets include every filtered word, including later pages', async ({ page }, testInfo) => {
  const originalViewport = page.viewportSize();
  await page.addInitScript(() => { window.print = () => { window.printRequested = true; }; });
  await openMaps(page, '#maps?type=character&node=天&level=all');
  await listView(page);
  const words = await page.locator('#map-word-list .map-glyph').allTextContents();
  await page.locator('#map-print').click();
  expect(await page.evaluate(() => window.printRequested)).toBe(true);
  expect(await page.locator('#mapPrint .map-word .map-glyph').allTextContents()).toEqual(words);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#mapPrint')).toBeVisible();
  await expect(page.locator('main')).toBeHidden();
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('map-print.png') });
  await page.setViewportSize(originalViewport);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.locator('#map-practice').click();
  await expect(page.locator('#mapPrint .practice-row')).toHaveCount(words.length);
  const hanziCount = words.reduce((sum, word) => sum + [...word].length, 0);
  await expect(page.locator('#mapPrint .practice-cell')).toHaveCount(hanziCount * 10);
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('practice-print.png') });
});

test('map data failure offers retry without breaking lessons', async ({ page }) => {
  await page.route('**/data/character-radicals.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto(BASE + '#maps');
  await expect(page.locator('#maps-loading')).toContainText('Не удалось загрузить карты');
  await expect(page.getByRole('button', { name: 'Повторить', exact: true })).toBeVisible();
  await page.locator('#nav-lessons').click();
  await page.getByRole('button', { name: 'Урок 1', exact: true }).click();
  await expect(page.locator('#vocabList .vocab-card')).toHaveCount(14);
});
