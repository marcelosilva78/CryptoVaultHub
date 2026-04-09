const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const dir = path.join(__dirname, 'docs', 'screenshots');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));

  console.log(`Found ${files.length} HTML files to convert.`);

  for (const file of files) {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    const filePath = path.join(dir, file);
    await page.goto('file://' + filePath);
    await page.waitForTimeout(1500);
    const pngPath = path.join(dir, file.replace('.html', '.png'));
    await page.screenshot({ path: pngPath, fullPage: false });
    const stats = fs.statSync(pngPath);
    const sizeKB = (stats.size / 1024).toFixed(1);
    console.log(`Screenshot: ${file} -> ${file.replace('.html', '.png')} (${sizeKB} KB)`);
    await page.close();
  }

  await browser.close();
  console.log('Done! All screenshots generated.');
})();
