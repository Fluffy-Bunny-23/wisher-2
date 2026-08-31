import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
async function snap(name, w, h, isMobile, interact){
  const ctx = await browser.newContext({ viewport:{width:w,height:h}, isMobile: !!isMobile });
  const page = await ctx.newPage();
  await page.goto('http://localhost:7060', { waitUntil:'networkidle', timeout:15000 });
  await page.waitForTimeout(900);
  if(interact) await interact(page);
  await page.waitForTimeout(600);
  await page.screenshot({ path:`/tmp/wisher-${name}.png`, fullPage:true });
  console.log('shot', name);
  await ctx.close();
}
await snap('01-auth', 1280, 900, false, null);
await snap('02-auth-email', 1280, 900, false, async p=>{
  try{ await p.click('#emailSignIn', {timeout:3000}); await p.waitForTimeout(600);}catch(e){console.log('email toggle',e.message)}
});
await snap('03-sidebar', 1280, 900, false, async p=>{
  try{ await p.click('#menuButton', {timeout:3000}); await p.waitForTimeout(700);}catch(e){console.log('sidebar',e.message)}
});
await snap('04-help', 1280, 900, false, async p=>{
  try{ await p.click('#helpBtn', {timeout:3000}); await p.waitForTimeout(600);}catch(e){console.log('help',e.message)}
});
await snap('05-settings', 1280, 900, false, async p=>{
  try{ await p.click('#settingsBtn', {timeout:3000}); await p.waitForTimeout(600);}catch(e){console.log('settings',e.message)}
});
await snap('06-dark', 1280, 900, false, async p=>{
  try{ await p.click('#themeToggle', {timeout:3000}); await p.waitForTimeout(700);}catch(e){console.log('theme',e.message)}
});
await snap('07-mobile', 390, 844, true, null);
await snap('08-mobile-sidebar', 390, 844, true, async p=>{
  try{ await p.click('#menuButton', {timeout:3000}); await p.waitForTimeout(700);}catch(e){console.log('m sidebar',e.message)}
});
await browser.close();
console.log('all done');
