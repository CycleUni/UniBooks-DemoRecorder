const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Everything environment-specific is read here rather than hardcoded. This
// script used to live in UniBooks-FE/scripts and reached its neighbours by
// relative path, which only worked from that one spot in that one checkout.
// See .env.example for what each of these is and when it has to be set.
const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:4200';
const OUTPUT_DIR = path.resolve(process.env.DEMO_OUTPUT_DIR || path.join(__dirname, 'demo_videos'));
const RAW_DIR = path.join(OUTPUT_DIR, 'raw');

// Resolved from PATH, rather than the absolute Homebrew path this
// replaces, which existed only on an Apple-silicon Mac.
const FFMPEG = process.env.FFMPEG_BIN || 'ffmpeg';

// Where UniBooks-BE is checked out, for the pre-recording data cleanup.
// Deliberately no default: this repository no longer sits beside it, and a
// guessed path is how a cleanup silently cleans nothing.
const BE_DIR = process.env.UNIBOOKS_BE_DIR || '';
const BE_PYTHON = process.env.UNIBOOKS_BE_PYTHON || '.venv/bin/python';

// The local demo account the recording drives. Fictitious values for an
// account that exists only in a development database.
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'test@test.com';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Password123!';

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

// Visual cursor overlay for realistic demo presentation
async function setupVisualCursor(page) {
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const cursor = document.createElement('div');
      cursor.id = 'demo-visual-cursor';
      cursor.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: rgba(37, 99, 235, 0.75);
        border: 2px solid #ffffff;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
        pointer-events: none;
        z-index: 2147483647;
        transform: translate(-50%, -50%);
        transition: transform 0.08s ease, background 0.15s ease;
      `;
      document.body.appendChild(cursor);

      window.addEventListener('mousemove', (e) => {
        cursor.style.left = `${e.clientX}px`;
        cursor.style.top = `${e.clientY}px`;
      });
      window.addEventListener('mousedown', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(0.75)';
        cursor.style.background = 'rgba(239, 68, 68, 0.9)';
      });
      window.addEventListener('mouseup', () => {
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.background = 'rgba(37, 99, 235, 0.75)';
      });
    });
  });
}

// Smooth mouse move with cubic bezier easing
async function smoothMoveTo(page, target, steps = 18) {
  let targetX, targetY;
  if (typeof target === 'string') {
    const locator = page.locator(target).first();
    const box = await locator.boundingBox().catch(() => null);
    if (!box) return;
    targetX = box.x + box.width / 2;
    targetY = box.y + box.height / 2;
  } else if (target && target.boundingBox) {
    const box = await target.boundingBox().catch(() => null);
    if (!box) return;
    targetX = box.x + box.width / 2;
    targetY = box.y + box.height / 2;
  } else {
    targetX = target.x;
    targetY = target.y;
  }

  const current = page.__lastMousePos || { x: 960, y: 540 };
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const curX = current.x + (targetX - current.x) * ease;
    const curY = current.y + (targetY - current.y) * ease;
    await page.mouse.move(curX, curY);
    await page.waitForTimeout(14);
  }
  page.__lastMousePos = { x: targetX, y: targetY };
}

// Smooth scroll
async function smoothScroll(page, distance, steps = 20) {
  const stepDistance = distance / steps;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'auto' }), stepDistance);
    await page.waitForTimeout(18);
  }
}

async function convertWebmToMp4(webmPath, mp4Path) {
  console.log(`Encoding MP4: ${path.basename(webmPath)} -> ${path.basename(mp4Path)}...`);
  try {
    execSync(`${FFMPEG} -y -i "${webmPath}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 20 -movflags faststart "${mp4Path}"`, { stdio: 'inherit' });
    console.log(`✓ MP4 Generated: ${mp4Path} (${fs.statSync(mp4Path).size} bytes)`);
  } catch (err) {
    console.error('FFmpeg conversion error:', err.message);
  }
}

// Part 1: Login & 30-Second Listing Showcase (Seller Journey)
async function recordLoginAndSell() {
  console.log('\n======================================================');
  console.log('🎥 Part 1: 登入優先與 30 秒極速上架 (Seller Journey)');
  console.log('======================================================');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: RAW_DIR, size: { width: 1920, height: 1080 } }
  });
  const page = await context.newPage();
  await setupVisualCursor(page);

  // 1. Login
  console.log(`1. 登入台大驗證學生身分 (${DEMO_EMAIL})...`);
  await page.goto(`${BASE_URL}/tw/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const emailInput = page.locator('ui-input input').first();
  await smoothMoveTo(page, emailInput);
  await emailInput.click();
  await page.keyboard.type(DEMO_EMAIL, { delay: 45 });
  await page.waitForTimeout(400);

  const pwInput = page.locator('ui-input input').nth(1);
  await smoothMoveTo(page, pwInput);
  await pwInput.click();
  await page.keyboard.type(DEMO_PASSWORD, { delay: 45 });
  await page.waitForTimeout(500);

  const loginBtn = page.locator('ui-button button').first();
  await smoothMoveTo(page, loginBtn);
  await loginBtn.click();
  await page.waitForTimeout(2200);

  // 2. Navigate to Sell Page
  console.log('2. 點擊「我要賣書」，進入刊登流程...');
  const sellNavBtn = page.locator('a[href*="/sell"], ui-button:has-text("賣書"), button:has-text("賣書")').first();
  if (await sellNavBtn.count() > 0) {
    await smoothMoveTo(page, sellNavBtn);
    await sellNavBtn.click();
  } else {
    await page.goto(`${BASE_URL}/tw/sell`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(2000);

  // 3. Step 1: Input ISBN
  console.log('3. 輸入 ISBN 條碼 (9780134685991)...');
  const isbnInput = page.locator('input[placeholder*="ISBN"], ui-input input').first();
  await smoothMoveTo(page, isbnInput);
  await isbnInput.click();
  await page.waitForTimeout(300);
  await page.keyboard.type('9780134685991', { delay: 75 });
  await page.waitForTimeout(600);

  // Click Search
  console.log('4. 雙引擎自動解析書目資料...');
  const searchBookBtn = page.locator('ui-button button:has-text("搜尋"), ui-button button:has-text("Search")').first();
  if (await searchBookBtn.count() > 0) {
    await smoothMoveTo(page, searchBookBtn);
    await searchBookBtn.click();
    await page.waitForTimeout(3000);
  }

  // Select book if list appears
  const selectResult = page.locator('.book-match.selectable, .results-container button').first();
  if (await selectResult.count() > 0) {
    await smoothMoveTo(page, selectResult);
    await selectResult.click();
    await page.waitForTimeout(1500);
  }

  // Pause on auto-filled book preview
  console.log('5. 展示秒級自動帶出之書名與原裝封面 (Effective Java)...');
  await page.waitForTimeout(2000);

  // Click Next Step
  const nextStepBtn1 = page.locator('.actions ui-button button').first();
  await smoothMoveTo(page, nextStepBtn1);
  await nextStepBtn1.click();
  await page.waitForTimeout(1800);

  // 4. Step 2: Condition & Course
  console.log('6. 勾選「近全新」書況與關聯課程...');
  const conditionOptions = page.locator('.condition-picker button, .condition-chip, label');
  if (await conditionOptions.count() >= 2) {
    await smoothMoveTo(page, conditionOptions.nth(1));
    await conditionOptions.nth(1).click();
    await page.waitForTimeout(600);
  }

  const courseInput = page.locator('input[placeholder*="課程"], ui-input input').nth(1);
  if (await courseInput.count() > 0) {
    await smoothMoveTo(page, courseInput);
    await courseInput.click();
    await page.keyboard.type('物件導向程式設計 (OOP)', { delay: 50 });
    await page.waitForTimeout(800);
  }

  await smoothScroll(page, 200, 15);
  await page.waitForTimeout(1000);

  const nextStepBtn2 = page.locator('.actions.split ui-button:last-child button').first();
  await smoothMoveTo(page, nextStepBtn2);
  await nextStepBtn2.click();
  await page.waitForTimeout(1800);

  // 5. Step 3: Price & Submit
  console.log('7. 設定售價 NT$ 380 並確認刊登...');
  const priceField = page.locator('.price-input, input[type="number"]').first();
  await smoothMoveTo(page, priceField);
  await priceField.click();
  await priceField.fill('380');
  await page.waitForTimeout(1500);

  const submitBtn = page.locator('.actions.split ui-button:last-child button').first();
  await smoothMoveTo(page, submitBtn);
  await submitBtn.click();
  await page.waitForTimeout(3000);

  // 6. Success & My Listings
  console.log('8. 刊登成功畫面（無請求限制錯誤）...');
  await page.waitForTimeout(2500);

  console.log('9. 前往會員「我的刊登」確認商品即時上架流通...');
  await page.goto(`${BASE_URL}/tw/account/listings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await smoothScroll(page, 250, 15);
  await page.waitForTimeout(2500);

  const video = page.video();
  await page.close();
  await context.close();
  await browser.close();

  const videoPath = await video.path();
  const finalMp4 = path.join(OUTPUT_DIR, '01_login_and_sell.mp4');
  await convertWebmToMp4(videoPath, finalMp4);
}

// Part 2: Search ➔ Active Listing ➔ Chat ➔ Meetup Request ➔ Order Page ➔ Back to Chat System Notification
async function recordSearchChatMeetupAndOrder() {
  console.log('\n========================================================================');
  console.log('🎥 Part 2: 智慧搜尋 ➔ 現貨教材 ➔ 即時私訊 ➔ 送出面交 ➔ 訂單頁 ➔ 聊天室卡片');
  console.log('========================================================================');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: RAW_DIR, size: { width: 1920, height: 1080 } }
  });
  const page = await context.newPage();
  await setupVisualCursor(page);

  // Login as verified student
  console.log('1. 以台大學生驗證身分登入...');
  await page.goto(`${BASE_URL}/tw/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const emailInput = page.locator('ui-input input').first();
  await emailInput.fill(DEMO_EMAIL);
  const pwInput = page.locator('ui-input input').nth(1);
  await pwInput.fill(DEMO_PASSWORD);
  await page.locator('ui-button button').first().click();
  await page.waitForTimeout(2000);

  // 1. Homepage Steady Exploration
  console.log('2. 停留在首頁，穩定展示 Hero 與搜尋框（不提前滑動）...');
  await page.goto(`${BASE_URL}/tw`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Smoothly move to search input while page remains perfectly steady
  const searchInput = page.locator('.hero-input input, input[type="text"]').first();
  await smoothMoveTo(page, searchInput);
  await searchInput.click();
  await page.waitForTimeout(400);

  // Smooth typing without page scroll
  console.log('3. 在搜尋欄平穩輸入「Calculus」...');
  await page.keyboard.type('Calculus', { delay: 85 });
  await page.waitForTimeout(700);

  // Click Search button
  console.log('4. 點擊搜尋按鈕，發送精準檢索...');
  const searchBtn = page.locator('.search-submit button, ui-button.search-submit button').first();
  if (await searchBtn.count() > 0) {
    await smoothMoveTo(page, searchBtn);
    await searchBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  // Wait until search results page is fully loaded and settled!
  await page.waitForURL('**/search**', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // 2. Smoothly scroll through search results
  console.log('5. 搜尋結果呈現完畢，平滑向下滾動瀏覽各校二手書單與篩選器...');
  await smoothScroll(page, 300, 20);
  await page.waitForTimeout(1800);

  // Select the book tile that HAS ACTIVE SELLERS
  console.log('6. 精確鎖定有學長姐現貨上架之《Calculus: Early Transcendentals》（標示有賣家與價格）...');
  const bookTileWithSellers = page.locator('ui-book-tile').filter({
    has: page.locator('.tile-sellers, .price-tag:not(.waitlist), ui-button:has-text("查看全部"), ui-button:has-text("View all")')
  }).first();

  if (await bookTileWithSellers.count() > 0) {
    await smoothMoveTo(page, bookTileWithSellers);
    await page.waitForTimeout(1500);
    const clickTarget = bookTileWithSellers.locator('.tile-body, ui-button button').first();
    await clickTarget.click();
  } else {
    await page.goto(`${BASE_URL}/tw/book?isbn=9781285741550`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(2500);

  // 3. Book Detail & Seller Listings
  console.log('7. 進入書籍詳情頁，平滑滾動展示真實賣家（台大學長）、近全新書況與 NT$600 價格...');
  await smoothScroll(page, 380, 22);
  await page.waitForTimeout(2200);

  // Click on "Contact seller" (聯絡賣家) on the listing card
  console.log('8. 點擊「聯絡賣家」開啟站內即時通訊 (CFEdgeChat)...');
  const contactBtn = page.locator('ui-listing-card ui-button button').filter({ hasText: /Contact seller|聯絡賣家/ }).first();
  if (await contactBtn.count() > 0) {
    await smoothMoveTo(page, contactBtn);
    await contactBtn.click();
    await page.waitForTimeout(3000);
  }

  // 4. Real-time Edge Chat (CFEdgeChat)
  console.log('9. 進入即時通訊聊天室，在對話框輸入面交詢問訊息...');
  const chatInput = page.locator('.message-input-area ui-input input');
  if (await chatInput.count() > 0) {
    await smoothMoveTo(page, chatInput);
    await chatInput.click();
    await page.waitForTimeout(400);

    await page.keyboard.type('學長好，請問這本微積分今天下午在總圖方便面交嗎？', { delay: 55 });
    await page.waitForTimeout(800);

    const sendBtn = page.locator('.message-input-area ui-button button').first();
    if (await sendBtn.count() > 0) {
      await smoothMoveTo(page, sendBtn);
      await sendBtn.click();
      await page.waitForTimeout(2000);
    }
  }

  // 5. Meetup & Checkout Flow
  console.log('10. 點擊頂部橫幅「立即購買 / 約定面交」，進入校園交易結帳頁面...');
  const buyBtn = page.locator('.listing-banner-actions ui-button button').filter({ hasText: /Buy|購買|面交/ }).first();
  if (await buyBtn.count() > 0) {
    await smoothMoveTo(page, buyBtn);
    await buyBtn.click();
    await page.waitForTimeout(2500);
  }

  // 6. Formally Submit Meetup Request
  console.log('11. 正式點擊「送出面交請求」按鈕，發送交易申請...');
  const placeOrderBtn = page.locator('.form-card ui-button button, button:has-text("送出面交請求"), button:has-text("Send Meetup Request")').first();
  if (await placeOrderBtn.count() > 0) {
    await smoothMoveTo(page, placeOrderBtn);
    await placeOrderBtn.click();
    await page.waitForTimeout(3000);
  }

  // 7. Success Screen & Jump to Orders Page
  console.log('12. 抵達面交請求送出成功頁面，點擊「查看訂單」...');
  await page.waitForTimeout(2000);
  const viewOrdersBtn = page.locator('ui-button[ng-reflect-link*="orders"], a:has-text("查看訂單"), ui-button a, ui-button button').first();
  if (await viewOrdersBtn.count() > 0) {
    await smoothMoveTo(page, viewOrdersBtn);
    await viewOrdersBtn.click();
    await page.waitForTimeout(2800);
  }

  // 8. Orders Page Showcase
  console.log('13. 進入帳號訂單頁面，展示微積分訂單（狀態：等候賣家確認 / pending）...');
  await smoothScroll(page, 200, 15);
  await page.waitForTimeout(2500);

  // 9. Switch back to Messages & Showcase System Meetup Card
  console.log('14. 切換回即時私訊頁面 (/tw/messages)...');
  const msgNav = page.locator('a[href*="/messages"], a[regionlink*="messages"], .nav-links a:has-text("MESSAGES"), .nav-links a:has-text("訊息")').first();
  if (await msgNav.count() > 0) {
    await smoothMoveTo(page, msgNav);
    await msgNav.click();
  } else {
    await page.goto(`${BASE_URL}/tw/messages`, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(2500);

  // Click the top conversation in the inbox to open chat room
  const firstChat = page.locator('messages-inbox-list .chat-item, .chat-item').first();
  if (await firstChat.count() > 0) {
    console.log('15. 開啟對話，展示系統自動發出的「面交請求」系統卡片與最新狀態...');
    await smoothMoveTo(page, firstChat);
    await firstChat.click();
    await page.waitForTimeout(2000);
  }

  // Smoothly focus on the system meetup notification card
  const meetupCard = page.locator('ui-meetup-card, .msg-bubble.meetup-card').first();
  if (await meetupCard.count() > 0) {
    console.log('16. 游標移動至系統面交請求卡片，定格展示完整閉環資訊...');
    await smoothMoveTo(page, meetupCard, 22);
    await page.waitForTimeout(4000);
  } else {
    await page.waitForTimeout(4000);
  }

  const video = page.video();
  await page.close();
  await context.close();
  await browser.close();

  const videoPath = await video.path();
  const finalMp4 = path.join(OUTPUT_DIR, '02_search_chat_meetup_order.mp4');
  await convertWebmToMp4(videoPath, finalMp4);
}

// Clean previous recording test data from backend DB
function cleanBackendData() {
  console.log('\n======================================================');
  console.log('🧹 正在清理前次錄製時後端產生的測試資料...');
  console.log('======================================================');
  if (!BE_DIR) {
    // Silence would be worse than skipping: the recording would then run
    // against whatever the previous run left behind, and the video would show
    // duplicate listings with nothing having reported a problem.
    console.warn('⚠️  UNIBOOKS_BE_DIR 未設定，略過後端資料清理。');
    console.warn('    錄製將沿用資料庫現有狀態，畫面可能出現前次遺留的資料。');
    return;
  }
  try {
    const cmd = `${BE_PYTHON} manage.py shell -c "
from listings.models import Listing
from orders.models import Order
from messaging.models import Conversation
from accounts.models import User

user = User.objects.filter(email='${DEMO_EMAIL}').first()
if user:
    Order.objects.filter(buyer=user).delete()
    Order.objects.filter(listing__seller=user).delete()
    Conversation.objects.filter(buyer=user).delete()
    Listing.objects.filter(seller=user, book__title__icontains='Effective Java').delete()
print('Backend test data cleaned!')
"`;
    execSync(cmd, { cwd: BE_DIR, stdio: 'inherit' });
    console.log('✓ 後端測試資料已徹底清除！');
  } catch (err) {
    console.warn('Backend cleanup warning:', err.message);
  }
}

// Combine all clips into a master showcase video
function combineMasterVideo() {
  console.log('\n======================================================');
  console.log('🎬 正在將兩段展示合成完整一鏡到底成片...');
  console.log('======================================================');
  const part1 = path.join(OUTPUT_DIR, '01_login_and_sell.mp4');
  const part2 = path.join(OUTPUT_DIR, '02_search_chat_meetup_order.mp4');
  const master = path.join(OUTPUT_DIR, 'unibooks_master_showcase.mp4');
  const listFile = path.join(OUTPUT_DIR, 'concat_list.txt');

  if (fs.existsSync(part1) && fs.existsSync(part2)) {
    fs.writeFileSync(listFile, `file '${part1}'\nfile '${part2}'\n`);
    execSync(`${FFMPEG} -y -f concat -safe 0 -i "${listFile}" -c copy "${master}"`, { stdio: 'inherit' });
    if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
    console.log(`✓ Master成片生成完畢: ${master} (${fs.statSync(master).size} bytes)`);
  }
}

async function main() {
  try {
    cleanBackendData();
    await recordLoginAndSell();
    await recordSearchChatMeetupAndOrder();
    combineMasterVideo();
    console.log('\n======================================================');
    console.log('🎉 所有展演短影片已完美錄製並轉檔成功！');
    console.log(`📁 輸出位置: ${OUTPUT_DIR}`);
    console.log('======================================================\n');
  } catch (err) {
    console.error('Recording failed:', err);
    process.exit(1);
  }
}

main();
