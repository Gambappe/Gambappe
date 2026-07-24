/** Throwaway: screenshot the xTrace-companion surfaces (banter, callout draft, season wrapped). */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = '/tmp/claude-0/screens';
mkdirSync(OUT, { recursive: true });

const CHALK_TOKEN = process.env.CHALK_TOKEN!;
const FADE_TOKEN = process.env.FADE_TOKEN!;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--no-sandbox'],
});

async function ctxFor(token: string) {
  const ctx = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
  });
  await ctx.addCookies([
    {
      name: 'authjs.session-token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  return ctx;
}

// --- chalk-daddy: /rivals (banter panel), then click "Draft it" for the callout draft ---
{
  const ctx = await ctxFor(CHALK_TOKEN);
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/rivals', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500); // banter panel fetches client-side after mount
  await page.screenshot({ path: `${OUT}/01-rivals-banter.png`, fullPage: true });
  console.log('01-rivals-banter: done');

  const draftButton = page.getByTestId('callout-draft-button').first();
  try {
    await draftButton.click({ timeout: 5000 });
    await page.waitForSelector('[data-testid="callout-draft-picker"]', { timeout: 20_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/02-rivals-callout-draft.png`, fullPage: true });
    console.log('02-rivals-callout-draft: done');
  } catch (e) {
    console.log('02-rivals-callout-draft: FAILED to click draft button —', String(e).slice(0, 200));
    await page.screenshot({ path: `${OUT}/02-rivals-callout-draft-FAILED.png`, fullPage: true });
  }
  await page.close();
  await ctx.close();
}

// --- fade-the-public: /rivals (banter from the other side) ---
{
  const ctx = await ctxFor(FADE_TOKEN);
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/rivals', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/03-rivals-banter-other-side.png`, fullPage: true });
  console.log('03-rivals-banter-other-side: done');
  await page.close();
  await ctx.close();
}

// --- chalk-daddy: /you (season wrapped recap) ---
{
  const ctx = await ctxFor(CHALK_TOKEN);
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/you', { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/04-you-season-wrapped.png`, fullPage: true });
  console.log('04-you-season-wrapped: done');
  await page.close();
  await ctx.close();
}

await browser.close();
console.log(`screenshots in ${OUT}`);
