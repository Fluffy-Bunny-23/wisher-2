import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
async function test(url, label) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const logs = [];
  const failed = [];
  page.on('console', m => logs.push(`[${m.type()}] ${m.text().slice(0,300)}`));
  page.on('pageerror', e => logs.push(`[pageerror] ${e.message.slice(0,500)}`));
  page.on('requestfailed', r => failed.push(`[fail] ${r.url().slice(-80)} -> ${r.failure()?.errorText}`));
  console.log(`\n=== Testing ${label}: ${url} ===`);
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    console.log(`goto: status=${resp?.status()} finalURL=${page.url()}`);
    // wait for hydration
    await page.waitForTimeout(6000);
    const title = await page.title();
    const state = await page.evaluate(() => ({
      htmlLen: document.documentElement.outerHTML.length,
      bodyText: document.body.innerText.slice(0,800).replace(/\n/g,' | '),
      hasWelcome: document.body.innerText.includes('Welcome'),
      hasWisher: document.body.innerText.includes('Wisher'),
      hasSpinner: document.documentElement.outerHTML.includes('animate-spin'),
      hasUnauthorized: document.documentElement.outerHTML.includes('Unauthorized') || document.body.innerText.includes('Unauthorized'),
      scripts: Array.from(document.querySelectorAll('script[src]')).map(s=>s.getAttribute('src')).slice(0,8),
      errors: Array.from(document.querySelectorAll('*')).length
    }));
    console.log(`title: ${title}`);
    console.log(`htmlLen: ${state.htmlLen}, hasWelcome: ${state.hasWelcome}, hasWisher: ${state.hasWisher}, spinner: ${state.hasSpinner}, unauthorized: ${state.hasUnauthorized}`);
    console.log(`bodyText: ${state.bodyText.slice(0,400)}`);
    console.log(`scripts: ${state.scripts.join(' | ').slice(0,400)}`);
    if (logs.length) { console.log(`console (${logs.length}):`); logs.slice(0,15).forEach(l=>console.log('  '+l)); }
    if (failed.length) { console.log(`failed requests (${failed.length}):`); failed.slice(0,15).forEach(l=>console.log('  '+l)); }
    const snap = `/tmp/diag-${label}.png`;
    await page.screenshot({ path: snap, fullPage: false });
    console.log(`screenshot: ${snap}`);
    const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(r=>`${r.name.split('/').pop()}:${Math.round(r.duration)}ms:${r.transferSize||0}b`).slice(0,15));
    console.log(`resources: ${resources.join(' | ').slice(0,600)}`);
  } catch(e) {
    console.log(`ERROR ${label}: ${e.message}`);
    logs.forEach(l=>console.log('  '+l));
    failed.forEach(l=>console.log('  '+l));
  }
  await ctx.close();
}
await test('http://localhost:7061/', 'local7061');
await test('https://7tp1yxuqz19v.shares.zrok.io/', 'zrok');
await browser.close();
console.log('diag done');
