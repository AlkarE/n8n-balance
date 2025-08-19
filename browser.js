const puppeteer = require('puppeteer-extra');
const axios = require('axios');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
// FIXME: 
const fs = require('fs');
const path = require('path');
// CapMonster API settings
const CAPMONSTER_KEY = 'c7ae0a04d0a5dc8094695807a364429f';
const CAPMONSTER_URL = 'https://api.capmonster.cloud/createTask';
const CAPMONSTER_RESULT_URL = 'https://api.capmonster.cloud/getTaskResult';

let balance = '';

/**
 * Solves a text/image captcha using CapMonster Cloud via ImageToTextTask
 * @param {string} imageUrl - URL or base64 of CAPTCHA image
 * @returns {Promise<string>} - Solved text (e.g., "8" for "5 + 3 = ?")
 */


const sleep = ms => new Promise(res => setTimeout(res, ms))

async function solveCaptcha(base64Image, type = 'string') {
  try {
    const timestamp = Date.now();
    const debugImagePath = path.resolve(__dirname, `captcha-debug-${timestamp}.jpg`);

    // ✅ 1. Save image to disk for debugging
    // saveBase64Image(base64Image, debugImagePath);

    // console.log('📤 Sending CAPTCHA to CapMonster...');
    // console.log(`📁 Debug image saved: ${debugImagePath}`);
    // console.log(`🔍 CAPTCHA type: ${type}`);

    // ✅ 2. Configure task based on type
    let numeric = 0;
    let math = 0;
    let caseValue = false;
    let comment = '';

    if (type === 'math') {
      math = 1;
      numeric = 1; // Helps for digits
      caseValue = false;
      comment = 'Solve the math expression';
    } else if (type === 'string') {
      math = 0;
      numeric = 1; // Let CapMonster auto-detect
      caseValue = false; // Set to `true` only if case matters
      comment = 'Enter the text from the image';
    } else {
      throw new Error(`Unsupported CAPTCHA type: ${type}. Use 'math' or 'string'.`);
    }

    const createResponse = await axios.post('https://api.capmonster.cloud/createTask', {
      clientKey: CAPMONSTER_KEY,
      task: {
        type: 'ImageToTextTask',
        body: base64Image, // Base64 without prefix
        case: caseValue,
        numeric: numeric,   // 0=auto, 1=digits only, 2=letters only
        math: math,         // 1=enable math solving
        minLength: 1,
        maxLength: 10,
        comment: comment,   // Optional hint (may help)
      },
    });

    // console.log('✅ CapMonster createTask response:', createResponse.data);

    if (createResponse.data.errorId !== 0) {
      throw new Error(`CapMonster error: ${createResponse.data.errorCode} - ${createResponse.data.errorDescription}`);
    }

    const taskId = createResponse.data.taskId;

    // ✅ 3. Poll for result
    // console.log('⏳ Waiting for solution...');
    for (let i = 0; i < 30; i++) {
      const resultResponse = await axios.post('https://api.capmonster.cloud/getTaskResult', {
        clientKey: CAPMONSTER_KEY,
        taskId,
      });

      // console.log('📡 getTaskResult:', resultResponse.data);

      const { status, solution } = resultResponse.data;

      if (status === 'ready' && solution && solution.text) {
        const text = solution.text.trim();
        console.log('🎉 CAPTCHA solved:', text);
        return text;
      }

      if (status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    throw new Error('⏰ CapMonster: Timeout waiting for solution (30s)');
  } catch (error) {
    console.error('❌ CAPTCHA solving failed:', error.message);
    if (error.response) {
      console.error('💥 API Error:', error.response.data);
      console.error('>Status:', error.response.status);
    } else if (error.request) {
      console.error('💥 No response (network issue)');
    } else {
      console.error('>Error:', error.stack);
    }
    throw error;
  }
}

// ✅ Helper: Save base64 image to file
function saveBase64Image(base64Data, filePath) {
  try {
    // Remove data:image/...;base64, prefix
    const base64Image = base64Data.split(';base64,').pop();
    fs.writeFileSync(filePath, base64Image, 'base64');
  } catch (err) {
    console.warn('⚠️ Failed to save debug image:', err.message);
  }
}

/**
 * Parses math expression like "What is 5 + 3?" and returns result as string
 * @param {string} text
 * @returns {string}
 */
function solveMathCaptchaLocally(text) {
  const match = text.match(/(\d+)\s*([+\-*\/])\s*(\d+)/);
  if (!match) return null;

  const [, a, op, b] = match;
  let result;
  switch (op) {
    case '+': result = parseInt(a) + parseInt(b); break;
    case '-': result = parseInt(a) - parseInt(b); break;
    case '*': result = parseInt(a) * parseInt(b); break;
    case '/': result = parseInt(a) / parseInt(b); break;
    default: return null;
  }
  return Math.round(result).toString();
}


/**
 * Main login function with optional CAPTCHA handling
 * @param {Object} config
 */
async function loginToWebsite(config) {
  const {
    url,
    username,
    password,
    selectorUsername,
    selectorPassword,
    selectorCaptchaInput = null,
    selectorCaptchaQuestion = null,
    selectorSubmit,
    selectorBalance,
    dashboardUrl,
    captchaFormat = null,
    selectorCheckLogin = null,
    captchaType,
    timeout = 30000,
    ajaxForm = false,
    selectorContractButton = null,
    selectorContract = null,
    selectorLoginInput = null,
  } = config;

  const browser = await puppeteer.launch({
    headless: true,
    slowMo: 100, // Slow down operations for realism
    args: [
      '--start-maximized',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled', // Hide automation flags
      '--disable-infobars',
      '--disable-extensions',
      '--disable-plugins-discovery',
      '--disable-web-security',
      '--allow-running-insecure-content',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-ipc-flooding-protection',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-sync',
      '--metrics-recording-only',
      '--safebrowsing-disable-auto-update',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--mute-audio',
      '--no-zygote', // Helps in some environments
      '--window-position=0,0', // Start at top-left
      '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    ],
    defaultViewport: null, // Use full window
  });

  const page = await browser.newPage();

  await page.setViewport({ width: 1600, height: 900, isMobile: false, hasHouch: false, deviceScaleFactor: 1 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Connection': 'keep-alive',
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });

    // Spoof plugins and languages
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });

    Object.defineProperty(navigator, 'language', { get: () => 'ru-RU' });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US', 'en'] });
  });


  try {
    console.log(`🚀 Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 80000 });

    await page.setViewport({ width: 1600, height: 900 });

    // Fill login fields
    console.log('🔐 Filling login form...');
    await page.waitForSelector(selectorUsername, { timeout: 5000 });
    await page.type(selectorUsername, username, { delay: 100 });
    sleep(500);

    if (selectorCheckLogin) {
      console.log('Found check login button');
      await page.click(selectorCheckLogin);
    }

    await page.waitForSelector(selectorPassword, { timeout: 5000 });
    await page.type(selectorPassword, password, { delay: 100 });
    sleep(500);

    let captchaAnswer = null;



    // ———————————————————————————————
    // 🧩 CAPTCHA Detection & Solving
    // ———————————————————————————————

    if (selectorCaptchaQuestion) {
      const captchaElement = await page.$(selectorCaptchaQuestion);
      if (captchaElement) {
        console.log('⚠️ CAPTCHA detected!');

        const isImage = await page.evaluate(el => el.tagName === 'IMG', captchaElement);

        if (isImage) {
          console.log('🖼️ CAPTCHA is an image. Trying to extract base64...');

          // Wait for image to be fully loaded
          await page.waitForFunction(
            sel => {
              const img = document.querySelector(sel);
              return img && img.complete && img.naturalHeight !== 0;
            },
            { timeout: 10000 },
            selectorCaptchaQuestion
          );

          let base64Image = '';

          // ✅ Extract src and check if it's base64
          const src = await page.evaluate(sel => {
            const img = document.querySelector(sel);
            return img?.src || null;
          }, selectorCaptchaQuestion);

          if (src && src.startsWith('data:image/')) {
            console.log('✅ Base64 image detected in src. Extracting...');
            base64Image = src.replace(/^data:image\/\w+;base64,/, '');
          } else if (src) {
            console.log('🌐 Image is a URL, falling back to screenshot...');
            const screenshot = await captchaElement.screenshot({ encoding: 'base64' });
            base64Image = screenshot;
          } else {
            throw new Error('❌ CAPTCHA image has no valid src');
          }

          // Solve via CapMonster
          captchaAnswer = await solveCaptcha(base64Image, captchaType);
          console.log('📤 Sent CAPTCHA image to CapMonster');
        } else {
          // Text-based CAPTCHA (e.g., math question)
          const questionText = await page.evaluate(
            sel => document.querySelector(sel)?.innerText || '',
            selectorCaptchaQuestion
          );

          if (questionText.match(/\d/)) {
            const localAnswer = solveMathCaptchaLocally(questionText);
            if (localAnswer) {
              captchaAnswer = localAnswer;
              console.log('🧠 Solved math CAPTCHA locally:', localAnswer);
            } else {
              // Send text as fake "image" to CapMonster (not ideal, but fallback)
              const textBase64 = Buffer.from(questionText).toString('base64');
              captchaAnswer = await solveCaptcha(`data:text/plain;base64,${textBase64}`);
              console.log('📤 Sent text CAPTCHA to CapMonster');
            }
          }
        }

        // ✅ Fill CAPTCHA answer if found
        if (captchaAnswer && selectorCaptchaInput) {
          await page.type(selectorCaptchaInput, captchaAnswer, { delay: 50 });
          console.log('✅ CAPTCHA answer filled:', captchaAnswer);
        }
      }
    }

    // ———————————————————————————————
    // 📤 Submit Form
    // ———————————————————————————————

    console.log('📤 Submitting login form...');

    page.on('dialog', async dialog => {
      if (dialog.type() === 'permission') {
        console.log(`Accepting permission: ${dialog.message()}`);
        await dialog.accept();
      } else {
        console.log(`Unhandled dialog: ${dialog.type()} - ${dialog.message()}`);
      }
    });

    // ✅ CORRECT WAY: Grant permissions via browser context
    const context = browser.defaultBrowserContext();

    await context.overridePermissions('https://lk-new.licard.com', [
      'notifications'
    ]);


    if (ajaxForm) {
      await page.click(selectorSubmit);
      // await page.evaluate(() => {
      //   const form = document.querySelector('form');
      //   if (form) {
      //     form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      //   } else {
      //     console.error('Form not found');
      //   }
      // });
      // await page.waitForSelector(selectorPassword, { timeout: 5000 });


    } else {

      await Promise.all([
        page.click(selectorSubmit),
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout }),
      ]);
    }

    if (selectorContractButton) {
      await page.waitForSelector(selectorContractButton, { timeout: 10000 });
      await page.click(selectorContractButton);
      await page.waitForSelector(selectorContract, { timeout: 3000 });
      await page.click(selectorContract);
    }

    if (config.name == 'mcn') {
      await page.waitForSelector('.topbar-menu-accounts .accounts__title_caret');
      await page.click('.topbar-menu-accounts .accounts__title_caret');
      sleep(100);

      await page.click('.accounts-contragent__contracts.accounts-contragent__contracts-expanded .account-contract:nth-child(1)');
      sleep(100);


      await Promise.all([
        page.waitForNavigation({ timeout: 20000, waitUntil: 'domcontentloaded' }),
        await page.click('.accounts-contragent__contracts.accounts-contragent__contracts-expanded .account-contract:nth-child(1) .accounts-list__accounts'),
      ]);
      await page.waitForSelector(selectorBalance, { timeout: 10000 });
    }


    console.log('✅ Login successful! Page title:', await page.title());

    await page.waitForSelector(selectorBalance, { timeout: 14000 });

    // Extract text from the page and return it to Node.js
    const balanceText = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      return el ? el.innerText.trim() : '';
    }, selectorBalance); // ← Pass 'selector' into the browser function

    console.log('✅ balance:', balanceText);



    // Keep open for inspection
    console.log('👀 Browser will stay open for 1 seconds...');
    sleep(1000)

    return {
      success: true,
      message: 'Login successful',
      data: {
        site: config.name,
        balance: balanceText,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error('❌ Login failed:', error.message);

    return {
      success: false,
      message: 'Login failed',
      data: {
        site: config.name,
      },
    };

  } finally {

    if (browser) {
      await browser.close().catch(() => { });
    }
  }
}

// ———————— Example Usage ————————

const config = {
  name: 'Луколй ИП',
  url: 'https://lk-new.licard.com/auth',
  username: 'reg@avg.su',
  password: 'Km12345Mk!',
  selectorUsername: 'form input[name="login"]',
  selectorPassword: 'form input[name="password"]',
  selectorCaptchaQuestion: 'form .classes_imageWrapper__5OpUn img',
  captchaFormat: 'base64',
  captchaType: 'string',
  selectorCaptchaInput: 'div[class*="classes_forgotPassword__"] + .mantine-Grid-col input[type="text"]',
  selectorSubmit: 'form button[type="Submit"]',
  selectorBalance: 'div[class*="Balance_balance__"] span[class*="Balance_balanceSum__"]',
  ajaxForm: true,
};

const sites = [
  {
    name: 'vdsinaRu',
    url: 'https://cp.vdsina.ru',
    username: 'reg@avg.su',
    password: '5HGsa8752!@',
    selectorUsername: '.auth-form input[name="email"]',
    selectorPassword: '.auth-form input[name="password"]',
    selectorCaptchaQuestion: '.auth-form .captcha-block-image img',
    // selectorCaptchaQuestion: 'img#captcha-image', // Or image
    selectorCaptchaInput: '.auth-form .captcha-block-image input[name="captcha"]',
    selectorSubmit: '.auth-form button[type="button"]',
    dashboardUrl: 'https://cp.vdsina.ru/vds/list',
    selectorBalance: '.w5-client-balance .info-box-balance-value > span'
  },
  {
    name: 'vdsinaCom',
    url: 'https://cp.vdsina.com',
    username: 'reg@avg.su',
    password: '94Z4me6186',
    selectorUsername: '.auth-form input[name="email"]',
    selectorPassword: '.auth-form input[name="password"]',
    selectorCaptchaQuestion: '.auth-form .captcha-block-image img',
    // selectorCaptchaQuestion: 'img#captcha-image', // Or image
    selectorCaptchaInput: '.auth-form .captcha-block-image input[name="captcha"]',
    selectorSubmit: '.auth-form button[type="button"]',
    dashboardUrl: 'https://cp.vdsina.com/vds/list',
    selectorBalance: '.w5-client-balance .info-box-balance-value > span'
  },
  {
    name: 'megafon',
    url: 'https://b2blk.megafon.ru/',
    username: '9111984806',
    password: 'km1234mk',
    selectorUsername: 'form input[name="username"]',
    selectorPassword: 'form input[name="password"]',
    selectorSubmit: 'form button[type="Submit"]',
    dashboardUrl: 'https://b2blk.megafon.ru/soho/subscribers',
    selectorBalance: '.Menu_Wrapper h5.MuiTypography-h5'
  },
  {
    name: 'ЗСД ИП',
    url: 'https://cabinet.nch-spb.com/onyma/',
    username: '25.52.526965',
    password: '848900',
    selectorUsername: 'form input[name="login"]',
    selectorPassword: 'form input[name="password"]',
    // selectorCaptchaQuestion: '.auth-form .captcha-block-image img',
    // selectorCaptchaQuestion: 'img#captcha-image', // Or image
    // selectorCaptchaInput: '.auth-form .captcha-block-image input[name="captcha"]',
    selectorSubmit: 'form input[type="Submit"]',
    dashboardUrl: 'https://cabinet.nch-spb.com/onyma/rm/party/AAAZegAAUAAJ00YAA2',
    selectorBalance: '.lkmenu .balance-value'
  },
  {
    name: 'ЗСД Аврора',
    url: 'https://cabinet.nch-spb.com/onyma/',
    username: '25.52.233726',
    password: '760117',
    selectorUsername: 'form input[name="login"]',
    selectorPassword: 'form input[name="password"]',
    // selectorCaptchaQuestion: '.auth-form .captcha-block-image img',
    // selectorCaptchaQuestion: 'img#captcha-image', // Or image
    // selectorCaptchaInput: '.auth-form .captcha-block-image input[name="captcha"]',
    selectorSubmit: 'form input[type="Submit"]',
    dashboardUrl: 'https://b2blk.megafon.ru/soho/subscribers',
    selectorBalance: '.lkmenu .balance-value'
  },
  {
    name: 'Луколй ИП',
    url: 'https://lk-new.licard.com/auth',
    username: 'reg@avg.su',
    password: 'Km12345Mk!',
    selectorUsername: 'form input[name="login"]',
    selectorPassword: 'form input[name="password"]',
    selectorCaptchaQuestion: 'form .classes_imageWrapper__5OpUn img',
    captchaFormat: 'base64',
    captchaType: 'string',
    selectorCaptchaInput: 'div[class*="classes_forgotPassword__"] + .mantine-Grid-col input[type="text"]',
    selectorSubmit: 'form button[type="Submit"]',
    selectorBalance: 'div[class*="Balance_balance__"] span[class*="Balance_balanceSum__"]',
    ajaxForm: true,
  },
  {
    name: 'Лукойл Аврора',
    url: 'https://lk-new.licard.com/auth',
    username: '1@avg.su',
    password: 'Km12345Mk!',
    selectorUsername: 'form input[name="login"]',
    selectorPassword: 'form input[name="password"]',
    selectorCaptchaQuestion: 'form .classes_imageWrapper__5OpUn img',
    captchaFormat: 'base64',
    captchaType: 'string',
    selectorCaptchaInput: 'div[class*="classes_forgotPassword__"] + .mantine-Grid-col input[type="text"]',
    selectorSubmit: 'form button[type="Submit"]',
    selectorBalance: 'div[class*="Balance_balance__"] span[class*="Balance_balanceSum__"]',
    ajaxForm: true,
    selectorContractButton: 'div[class*="classes_chooseBlock__"] svg',
    selectorContract: 'div[class*="classes_listItem__"]:nth-child(3)',
  },
  {
    name: 'mcn',
    url: 'https://base.mcn.ru/',
    username: 'buh@avg.su',
    password: 'auGz9o2Y',
    selectorUsername: '.mcn-login input[name="login"]',
    selectorPassword: '.mcn-login input[name="password"]',
    ajaxForm: true,
    selectorCheckLogin: '.mcn-login .check-login__btn button',
    selectorSubmit: '.mcn-login .check-password__btn button[type="button"]',
    selectorBalance: '.accounts__balance_money-working',
  },
];

// Run login
module.exports = { loginToWebsite };

// async function getBalance(data) {
//   let done = false;

//   let attempt = 1;
//   while (!done) {
//     console.log('attempt: ', attempt);

//     const res = await loginToWebsite(data)
//     console.log(res)
//     if (res.success) {
//       done = true;
//     }
//     sleep(1500);
//     attempt++;
//   }

// }
// getBalance(config)
// .then((res) => console.log(res))
// .catch(err => console.error('💥 Script failed:', err));