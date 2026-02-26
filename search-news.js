const { chromium } = require('playwright');

async function searchNews() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  const results = [];

  // Search Google News for AI automation accounting tax firm news
  console.log('\n--- Searching Google News ---');
  await page.goto('https://news.google.com/search?q=AI+automation+accounting+firm+tax+firm+2025&hl=en-US&gl=US&ceid=US:en');
  await page.waitForTimeout(3000);

  // Get article titles and sources
  const googleNewsResults = await page.evaluate(() => {
    const articles = [];
    const articleElements = document.querySelectorAll('article');
    articleElements.forEach((article, index) => {
      if (index < 15) {
        const titleEl = article.querySelector('a[href*="./articles/"]');
        const sourceEl = article.querySelector('div[data-n-tid]') || article.querySelector('a[data-n-tid]');
        const timeEl = article.querySelector('time');
        if (titleEl) {
          articles.push({
            title: titleEl.textContent?.trim() || '',
            source: sourceEl?.textContent?.trim() || 'Unknown',
            time: timeEl?.textContent?.trim() || ''
          });
        }
      }
    });
    return articles;
  });

  console.log('Google News results:', googleNewsResults.length);
  results.push(...googleNewsResults);

  // Search Accounting Today
  console.log('\n--- Searching Accounting Today ---');
  try {
    await page.goto('https://www.accountingtoday.com/tag/artificial-intelligence', { timeout: 30000 });
    await page.waitForTimeout(2000);

    const accountingTodayResults = await page.evaluate(() => {
      const articles = [];
      const articleElements = document.querySelectorAll('article, .PromoMediumImageLeft, .PromoSmallImageLeft, [class*="Promo"]');
      articleElements.forEach((article, index) => {
        if (index < 10) {
          const titleEl = article.querySelector('h3 a, h2 a, .PromoMediumImageLeft-title a, a[class*="title"]');
          if (titleEl && titleEl.textContent) {
            articles.push({
              title: titleEl.textContent.trim(),
              source: 'Accounting Today',
              time: ''
            });
          }
        }
      });
      return articles;
    });

    console.log('Accounting Today results:', accountingTodayResults.length);
    results.push(...accountingTodayResults);
  } catch (e) {
    console.log('Accounting Today error:', e.message);
  }

  // Search CPA Practice Advisor
  console.log('\n--- Searching CPA Practice Advisor ---');
  try {
    await page.goto('https://www.cpapracticeadvisor.com/search?q=AI+automation', { timeout: 30000 });
    await page.waitForTimeout(2000);

    const cpaResults = await page.evaluate(() => {
      const articles = [];
      const articleElements = document.querySelectorAll('.search-result, article, .card');
      articleElements.forEach((article, index) => {
        if (index < 10) {
          const titleEl = article.querySelector('h2 a, h3 a, .card-title a, a');
          if (titleEl && titleEl.textContent && titleEl.textContent.length > 20) {
            articles.push({
              title: titleEl.textContent.trim(),
              source: 'CPA Practice Advisor',
              time: ''
            });
          }
        }
      });
      return articles;
    });

    console.log('CPA Practice Advisor results:', cpaResults.length);
    results.push(...cpaResults);
  } catch (e) {
    console.log('CPA Practice Advisor error:', e.message);
  }

  // Additional search on general tech news for accounting AI
  console.log('\n--- Searching Bing News ---');
  try {
    await page.goto('https://www.bing.com/news/search?q=AI+automation+accounting+tax+firm+2025', { timeout: 30000 });
    await page.waitForTimeout(2000);

    const bingResults = await page.evaluate(() => {
      const articles = [];
      const newsCards = document.querySelectorAll('.news-card, .card-with-cluster');
      newsCards.forEach((card, index) => {
        if (index < 10) {
          const titleEl = card.querySelector('a.title, .title');
          const sourceEl = card.querySelector('.source');
          if (titleEl && titleEl.textContent) {
            articles.push({
              title: titleEl.textContent.trim(),
              source: sourceEl?.textContent?.trim() || 'Bing News',
              time: ''
            });
          }
        }
      });
      return articles;
    });

    console.log('Bing News results:', bingResults.length);
    results.push(...bingResults);
  } catch (e) {
    console.log('Bing News error:', e.message);
  }

  await browser.close();

  // Filter and deduplicate results
  const seen = new Set();
  const uniqueResults = results.filter(r => {
    if (!r.title || r.title.length < 10) return false;
    const key = r.title.toLowerCase().substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log('\n========================================');
  console.log('TOP AI & AUTOMATION NEWS FOR ACCOUNTING/TAX FIRMS');
  console.log('========================================\n');

  uniqueResults.slice(0, 15).forEach((item, index) => {
    console.log(`${index + 1}. ${item.title}`);
    console.log(`   Source: ${item.source}${item.time ? ' | ' + item.time : ''}`);
    console.log('');
  });

  return uniqueResults;
}

searchNews().catch(console.error);
