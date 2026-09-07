const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('response', response => {
    if (!response.ok()) {
      console.log('FAILED RESPONSE:', response.url(), response.status());
    }
  });

  await page.goto('https://minhhaohan1320-design.github.io/Mstech4/', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'live-screenshot.png' });
  await browser.close();
})();
