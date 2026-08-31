import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
async function snap(name, w, h, isMobile, interact){
  const ctx = await browser.newContext({ viewport:{width:w,height:h}, isMobile: !!isMobile });
  const page = await ctx.newPage();
  await page.goto('http://localhost:7061', { waitUntil:'networkidle', timeout:20000 });
  await page.waitForTimeout(1500);
  if(interact) await interact(page);
  await page.waitForTimeout(900);
  await page.screenshot({ path:`/tmp/v2-${name}.png`, fullPage:true });
  console.log('shot v2', name);
  await ctx.close();
}
await snap('01-auth', 1280, 900, false, null);
await snap('02-auth-email', 1280, 900, false, async p=>{
  try{ const btn = p.locator('text=Sign in with Email'); await btn.click({timeout:3000}); await p.waitForTimeout(600);}catch(e){console.log('email fail',e.message)}
});
await snap('03-sidebar', 1280, 900, false, async p=>{
  try{ await p.getByRole('button', {name:'Menu'}).first().click({timeout:3000}); await p.waitForTimeout(700);}catch(e){console.log('sidebar fail',e.message)}
});
await snap('04-help', 1280, 900, false, async p=>{
  try{ await p.getByRole('button', {name:'Help'}).first().click({timeout:3000}); await p.waitForTimeout(600);}catch(e){console.log('help fail',e.message)}
});
await snap('05-dark', 1280, 900, false, async p=>{
  try{ await p.getByRole('button', {name:'Toggle theme'}).first().click({timeout:3000}); await p.waitForTimeout(700);}catch(e){console.log('theme fail',e.message)}
});
await snap('06-mobile', 390, 844, true, null);
await browser.close();
console.log('v2 all done');
