const { chromium } = require('./node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3002/seller/bulk-exchange');
  await page.waitForTimeout(2000);
  
  // Click New Batch
  await page.click('button:has-text("New Batch")');
  await page.waitForTimeout(500);
  const modalHeading = await page.$eval('h2', el => el.textContent).catch(() => 'none');
  console.log('Modal heading:', modalHeading);
  
  // Fill and submit
  await page.fill('input[placeholder*="Consumer Electronics"]', 'Consumer Electronics');
  await page.fill('input[placeholder*="150"]', '50');
  await page.fill('textarea', 'Mixed laptops and accessories');
  await page.click('button:has-text("Submit Batch")');
  await page.waitForTimeout(1200);
  
  const processingH = await page.$eval('h2', el => el.textContent).catch(() => 'none');
  console.log('Processing heading:', processingH);
  
  await page.waitForTimeout(4500);
  const doneH = await page.$eval('h2', el => el.textContent).catch(() => 'none');
  console.log('Done heading:', doneH);
  
  await page.screenshot({ path: 'C:/tmp/modal_done.png' });
  
  const reviewBtn = await page.$('button:has-text("Review")');
  if (reviewBtn) {
    await reviewBtn.click();
    await page.waitForTimeout(1000);
    console.log('Clicked Review button');
  }
  
  const allBtns = await page.$$eval('button', btns => btns.map(b => b.textContent.trim()).filter(Boolean));
  console.log('All buttons after flow:', JSON.stringify(allBtns));
  
  await page.screenshot({ path: 'C:/tmp/after_new_batch.png', fullPage: true });
  await browser.close();
  console.log('Done');
})().catch(e => console.error('ERROR:', e.message));
