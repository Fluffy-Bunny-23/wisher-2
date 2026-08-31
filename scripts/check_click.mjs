import { chromium } from 'playwright';
const b = await chromium.launch({args:['--no-sandbox','--disable-setuid-sandbox']});
const c = await b.newContext(); const p = await c.newPage();
p.on('console', m=>console.log('[console]', m.text().slice(0,180)));
await p.goto('https://yjf19mk2jdwl.shares.zrok.io/', {waitUntil:'domcontentloaded', timeout:25000});
await p.waitForTimeout(1500);
console.log("BEFORE url:", p.url(), "title:", await p.title());
let html = await p.content();
console.log("has interstitial?", html.includes('You are about to visit'));
if (html.includes('Visit Share')) {
  console.log("clicking Visit Share...");
  const btn = p.locator('text=Visit Share');
  await btn.click({timeout:5000});
  await p.waitForTimeout(5000);
  // need to handle possible navigation
  try { await p.waitForLoadState('domcontentloaded', {timeout:10000}); } catch {}
  await p.waitForTimeout(3000);
}
console.log("AFTER url:", p.url(), "title:", await p.title());
console.log("AFTER has Wisher:", (await p.evaluate(()=>document.body.innerText)).includes('Wisher'));
console.log("AFTER snippet:", (await p.evaluate(()=>document.body.innerText.slice(0,500).replace(/\n/g,' | '))));
await p.screenshot({path:'/tmp/after-click.png', fullPage:false});
console.log("screenshot /tmp/after-click.png");
await b.close();
