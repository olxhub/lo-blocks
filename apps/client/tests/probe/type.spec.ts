import { test, expect } from '@playwright/test';

test('fast typing into a TextArea keeps the caret and the text', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', m => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text()); });

  await page.goto('/TextArea');
  const box = page.locator('textarea').first();
  await box.waitFor({ state: 'visible', timeout: 30000 });
  await box.click();
  await box.fill('');

  const target = 'The quick brown fox jumps over the lazy dog';
  await box.type(target, { delay: 12 });          // fast, human-ish
  await page.waitForTimeout(1500);

  const value = await box.inputValue();
  const caret = await box.evaluate((el: any) => el.selectionStart);
  console.log('TYPED   :', JSON.stringify(target));
  console.log('VALUE   :', JSON.stringify(value));
  console.log('CARET   :', caret, 'of', value.length);
  console.log('WARNINGS:', JSON.stringify(warnings.slice(0, 10), null, 1));
  expect(value).toBe(target);
  expect(caret).toBe(target.length);
});
