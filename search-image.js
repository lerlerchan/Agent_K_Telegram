const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function searchImage() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log('Searching for Johor Bahru CIQ images...');

  // Search Google Images
  await page.goto('https://www.google.com/search?q=Johor+Bahru+CIQ+building&tbm=isch');
  await page.waitForTimeout(3000);

  // Get image URLs
  const imageUrls = await page.evaluate(() => {
    const images = [];
    const imgElements = document.querySelectorAll('img[src^="http"]');
    imgElements.forEach((img, index) => {
      if (index < 10 && img.src && img.src.startsWith('http') && !img.src.includes('google')) {
        images.push({
          src: img.src,
          alt: img.alt || 'Johor Bahru CIQ'
        });
      }
    });
    return images;
  });

  console.log('Found images:', imageUrls.length);

  // Try to get a larger image by clicking on first result
  try {
    // Click on first image to get larger version
    await page.click('img[alt*="Johor"], img[alt*="CIQ"], img[alt*="Sultan"]', { timeout: 5000 });
    await page.waitForTimeout(2000);

    // Get the larger image URL
    const largeImageUrl = await page.evaluate(() => {
      const largeImg = document.querySelector('img[src^="https://"][style*="max-width"], img[src^="https://encrypted"]');
      return largeImg ? largeImg.src : null;
    });

    if (largeImageUrl) {
      imageUrls.unshift({ src: largeImageUrl, alt: 'Johor Bahru CIQ - Large' });
    }
  } catch (e) {
    console.log('Could not get larger image:', e.message);
  }

  // Take a screenshot of the search results
  await page.goto('https://www.google.com/search?q=Johor+Bahru+CIQ+Sultan+Iskandar+building&tbm=isch');
  await page.waitForTimeout(2000);

  const screenshotPath = path.join(__dirname, 'workspace', 'jb-ciq-search.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('Screenshot saved to:', screenshotPath);

  // Try to download one image
  if (imageUrls.length > 0) {
    console.log('\nImage URLs found:');
    imageUrls.slice(0, 5).forEach((img, i) => {
      console.log(`${i + 1}. ${img.alt}: ${img.src.substring(0, 100)}...`);
    });
  }

  await browser.close();
  console.log('\nDone!');

  return { screenshotPath, imageUrls };
}

searchImage().catch(console.error);
