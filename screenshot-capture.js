import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const CITIZEN_DIR = path.join(SCREENSHOTS_DIR, 'citizen');
const OFFICER_DIR = path.join(SCREENSHOTS_DIR, 'officer');

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(CITIZEN_DIR, { recursive: true });
  await fs.mkdir(OFFICER_DIR, { recursive: true });
  console.log('✓ Screenshot directories ready');
}

// Helper to take and save a screenshot
async function captureScreenshot(page, filename, directory) {
  const filepath = path.join(directory, filename);
  // Wait for body to have content and scroll to ensure rendering
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`✓ Captured: ${filename}`);
  return filepath;
}

// Wait for page to have meaningful content
async function waitForContent(page, timeout = 8000) {
  try {
    await page.waitForTimeout(2000); // Initial render wait
    await page.evaluate(() => {
      return new Promise(resolve => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', () => resolve());
        }
      });
    });
  } catch (e) {
    console.log('  (Content wait timeout, proceeding)');
  }
}

// Citizen platform screenshots
async function captureCitizenPlatform(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(15000);
  
  try {
    console.log('\n📱 Capturing Citizen Platform Screenshots...');
    
    // 1. Landing page
    console.log('→ Navigating to landing page...');
    await page.goto('https://hakrambuilders-cyber.github.io/biashara-guide.v2/', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    await waitForContent(page);
    await page.waitForTimeout(3000); // Extra render time
    // Try to wait for main content
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '01-landing-page.png', CITIZEN_DIR);
    
    // 2. AI Tax Assistant
    console.log('→ Looking for AI Tax Assistant...');
    try {
      // Try multiple selectors for the button
      const button = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const match = buttons.find(b => b.textContent?.includes('Assistant') || b.textContent?.includes('Tax'));
        return match ? true : false;
      });
      
      if (button) {
        await page.click('button:has-text("Assistant"), a:has-text("Assistant"), [role="button"]:has-text("Assistant")', { timeout: 5000 }).catch(() => {});
      }
    } catch (e) {
      console.log('  (Could not click, taking screenshot anyway)');
    }
    await page.waitForTimeout(2000);
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '02-ai-tax-assistant.png', CITIZEN_DIR);
    
    // Go back to main
    try {
      await page.goto('https://hakrambuilders-cyber.github.io/biashara-guide.v2/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    } catch (e) {}
    
    // 3. Tax Liability & Incentive Estimator
    console.log('→ Looking for Tax Liability Estimator...');
    try {
      const button = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const match = buttons.find(b => b.textContent?.includes('Liability') || b.textContent?.includes('Incentive') || b.textContent?.includes('Estimator'));
        return match ? true : false;
      });
      
      if (button) {
        await page.click('button:has-text("Liability"), a:has-text("Liability"), [role="button"]:has-text("Liability")', { timeout: 5000 }).catch(() => {});
      }
    } catch (e) {}
    await page.waitForTimeout(2000);
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '03-tax-liability-estimator.png', CITIZEN_DIR);
    
    try {
      await page.goto('https://hakrambuilders-cyber.github.io/biashara-guide.v2/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    } catch (e) {}
    
    // 4. Interactive Tax Risk Dashboard
    console.log('→ Looking for Risk Dashboard...');
    try {
      const button = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const match = buttons.find(b => b.textContent?.includes('Risk') || b.textContent?.includes('Dashboard'));
        return match ? true : false;
      });
      
      if (button) {
        await page.click('button:has-text("Risk"), a:has-text("Risk"), [role="button"]:has-text("Risk")', { timeout: 5000 }).catch(() => {});
      }
    } catch (e) {}
    await page.waitForTimeout(2000);
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '04-tax-risk-dashboard.png', CITIZEN_DIR);
    
    try {
      await page.goto('https://hakrambuilders-cyber.github.io/biashara-guide.v2/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    } catch (e) {}
    
    // 5. Penalty Simulator
    console.log('→ Looking for Penalty Simulator...');
    try {
      const button = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const match = buttons.find(b => b.textContent?.includes('Penalty') || b.textContent?.includes('Simulator'));
        return match ? true : false;
      });
      
      if (button) {
        await page.click('button:has-text("Penalty"), a:has-text("Penalty"), [role="button"]:has-text("Penalty")', { timeout: 5000 }).catch(() => {});
      }
    } catch (e) {}
    await page.waitForTimeout(2000);
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '05-penalty-simulator.png', CITIZEN_DIR);
    
    try {
      await page.goto('https://hakrambuilders-cyber.github.io/biashara-guide.v2/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    } catch (e) {}
    
    // 6. Dispute & Objection Navigator
    console.log('→ Looking for Dispute Navigator...');
    try {
      const button = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const match = buttons.find(b => b.textContent?.includes('Dispute') || b.textContent?.includes('Objection'));
        return match ? true : false;
      });
      
      if (button) {
        await page.click('button:has-text("Dispute"), a:has-text("Dispute"), [role="button"]:has-text("Dispute")', { timeout: 5000 }).catch(() => {});
      }
    } catch (e) {}
    await page.waitForTimeout(2000);
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '06-dispute-objection-navigator.png', CITIZEN_DIR);
    
  } catch (error) {
    console.error('Error capturing citizen platform:', error.message);
  } finally {
    await page.close();
  }
}

// Officer platform screenshots
async function captureOfficerPlatform(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(15000);
  
  try {
    console.log('\n👮 Capturing Officer Platform Screenshots...');
    
    // 1. Landing page
    console.log('→ Navigating to officer platform...');
    try {
      await page.goto('https://hakrambuilders-cyber.github.io/biashara-guide-officer/', { 
        waitUntil: 'load',
        timeout: 20000 
      });
    } catch (e) {
      console.log('  (Load timeout, proceeding with current state)');
    }
    await page.waitForTimeout(3000);
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '01-landing-page.png', OFFICER_DIR);
    
    // 2. Try to find and click Login button
    console.log('→ Looking for and clicking Login button...');
    try {
      // Get all visible buttons/links
      const buttons = await page.$$eval('button, a, [role="button"]', elements => 
        elements
          .filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            const style = window.getComputedStyle(el);
            return (text.includes('login') || text.includes('sign in')) && style.display !== 'none';
          })
          .map((el, idx) => ({idx, text: el.textContent, visible: true}))
      );
      
      if (buttons.length > 0) {
        console.log(`  ✓ Found ${buttons.length} login button(s), clicking first...`);
        // Click the first visible login button
        await page.click('button:has-text("Login"), button:has-text("Sign In"), a:has-text("Login"), a:has-text("Sign In")', { timeout: 5000 }).catch(() => {
          console.log('  (Click with text selector failed)');
        });
        await page.waitForTimeout(2500);
      } else {
        console.log('  (No login button found, checking for modal/form)');
      }
    } catch (e) {
      console.log('  (Error in login detection, proceeding)');
    }
    
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '02-login-dashboard.png', OFFICER_DIR);
    
    // 3. Policy Intelligence Dashboard
    console.log('→ Looking for Policy Intelligence Dashboard...');
    try {
      const buttons = await page.$$eval('button, a, [role="button"]', elements => 
        elements
          .filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            const style = window.getComputedStyle(el);
            return (text.includes('policy') || text.includes('intelligence') || text.includes('analytics')) && style.display !== 'none';
          })
          .map((el, idx) => ({idx, text: el.textContent}))
      );
      
      if (buttons.length > 0) {
        console.log(`  ✓ Found policy/analytics button, clicking...`);
        await page.click('button:has-text("Policy"), button:has-text("Intelligence"), button:has-text("Analytics"), a:has-text("Policy")', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    } catch (e) {}
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '03-policy-intelligence.png', OFFICER_DIR);
    
    // Navigate back
    try {
      await page.goto('https://hakrambuilders-cyber.github.io/biashara-guide-officer/', { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(1500);
    } catch (e) {}
    
    // 4. Dispute Escalation/Review Queue
    console.log('→ Looking for Dispute Escalation Queue...');
    try {
      const buttons = await page.$$eval('button, a, [role="button"]', elements => 
        elements
          .filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            const style = window.getComputedStyle(el);
            return (text.includes('dispute') || text.includes('escalation') || text.includes('queue') || text.includes('review')) && style.display !== 'none';
          })
          .map((el, idx) => ({idx, text: el.textContent}))
      );
      
      if (buttons.length > 0) {
        console.log(`  ✓ Found dispute button, clicking...`);
        await page.click('button:has-text("Dispute"), button:has-text("Escalation"), a:has-text("Dispute")', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    } catch (e) {}
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '04-dispute-escalation.png', OFFICER_DIR);
    
    // Navigate back
    try {
      await page.goto('https://hakrambuilders-cyber.github.io/biashara-guide-officer/', { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(1500);
    } catch (e) {}
    
    // 5. Taxpayer Profile / Risk Monitoring
    console.log('→ Looking for Taxpayer Profile...');
    try {
      const buttons = await page.$$eval('button, a, [role="button"]', elements => 
        elements
          .filter(el => {
            const text = el.textContent?.toLowerCase() || '';
            const style = window.getComputedStyle(el);
            return (text.includes('taxpayer') || text.includes('profile') || text.includes('risk') || text.includes('monitoring')) && style.display !== 'none';
          })
          .map((el, idx) => ({idx, text: el.textContent}))
      );
      
      if (buttons.length > 0) {
        console.log(`  ✓ Found taxpayer button, clicking...`);
        await page.click('button:has-text("Taxpayer"), button:has-text("Profile"), a:has-text("Taxpayer")', { timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    } catch (e) {}
    try {
      await page.waitForSelector('body > *', { timeout: 5000 });
    } catch (e) {}
    await captureScreenshot(page, '05-taxpayer-profile.png', OFFICER_DIR);
    
  } catch (error) {
    console.error('Error capturing officer platform:', error.message);
  } finally {
    await page.close();
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting screenshot capture with improved content detection...\n');
  
  await ensureDirectories();
  
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  
  try {
    await captureCitizenPlatform(browser);
    await captureOfficerPlatform(browser);
    
    console.log('\n✅ Screenshot capture completed!');
    console.log(`📸 Citizen screenshots: ${CITIZEN_DIR}`);
    console.log(`📸 Officer screenshots: ${OFFICER_DIR}`);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
