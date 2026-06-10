import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import getDb from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
  }
  return browser;
}

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
}

export const DEFAULT_DEVICE = {
  name: '桌面端',
  type: 'desktop',
  width: 1920,
  height: 1080,
  device_scale_factor: 1,
  is_mobile: 0,
  is_touch: 0
};

export async function getUrlDevices(urlId) {
  const db = await getDb();
  const devices = db.prepare(`
    SELECT * FROM url_devices WHERE url_id = ? ORDER BY id ASC
  `).all(urlId);

  if (devices.length === 0) {
    const defaultDevices = db.prepare(`
      SELECT * FROM devices WHERE is_default = 1 ORDER BY sort_order ASC
    `).all();
    return defaultDevices.map(d => ({
      device_id: d.id,
      device_name: d.name,
      device_type: d.type,
      width: d.width,
      height: d.height,
      device_scale_factor: d.device_scale_factor,
      user_agent: d.user_agent,
      is_mobile: d.is_mobile,
      is_touch: d.is_touch
    }));
  }

  return devices;
}

export async function takeScreenshotWithDevice(urlRecord, deviceConfig, browserInstance = null) {
  const { id, url, name } = urlRecord;
  const device = { ...DEFAULT_DEVICE, ...deviceConfig };
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
  const deviceDir = sanitizeFilename(device.device_name || device.name || 'default');

  const urlDir = path.join(SCREENSHOTS_DIR, sanitizeFilename(name || url), dateStr, deviceDir);
  if (!fs.existsSync(urlDir)) {
    fs.mkdirSync(urlDir, { recursive: true });
  }

  const fileName = `${timeStr}.png`;
  const filePath = path.join(urlDir, fileName);

  let page = null;
  let localBrowser = null;
  try {
    const browser = browserInstance || (localBrowser = await getBrowser());
    page = await browser.newPage();

    const viewportOpts = {
      width: device.width,
      height: device.height,
      deviceScaleFactor: device.device_scale_factor || 1,
      isMobile: !!device.is_mobile,
      hasTouch: !!device.is_touch
    };
    await page.setViewport(viewportOpts);

    if (device.user_agent) {
      await page.setUserAgent(device.user_agent);
    }

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.screenshot({ path: filePath, fullPage: true });

    const db = await getDb();
    const insertStmt = db.prepare(`
      INSERT INTO screenshots (
        url_id, device_id, device_name, device_type,
        viewport_width, viewport_height, device_scale_factor, user_agent,
        file_path, file_name, width, height
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = insertStmt.run(
      id,
      device.device_id || null,
      device.device_name || device.name || null,
      device.device_type || device.type || null,
      device.width,
      device.height,
      device.device_scale_factor || 1,
      device.user_agent || null,
      filePath,
      fileName,
      device.width,
      device.height
    );

    const updateStmt = db.prepare(`
      UPDATE urls SET last_screenshot_at = CURRENT_TIMESTAMP WHERE id = ?
    `);
    updateStmt.run(id);

    return {
      id: result.lastInsertRowid,
      file_path: filePath,
      file_name: fileName,
      device_name: device.device_name || device.name,
      device_type: device.device_type || device.type,
      viewport_width: device.width,
      viewport_height: device.height,
      created_at: now.toISOString()
    };
  } catch (error) {
    console.error(`截图失败 [${url}] [${device.device_name || device.name}]:`, error.message);
    throw error;
  } finally {
    if (page) {
      await page.close().catch(console.error);
    }
  }
}

export async function takeScreenshot(urlRecord) {
  const devices = await getUrlDevices(urlRecord.id);
  const strategy = urlRecord.execution_strategy || 'parallel';

  const browser = await getBrowser();
  const results = [];
  const errors = [];

  if (strategy === 'serial') {
    for (const device of devices) {
      try {
        const result = await takeScreenshotWithDevice(urlRecord, device, browser);
        results.push(result);
      } catch (err) {
        errors.push({ device: device.device_name || device.name, error: err.message });
      }
    }
  } else {
    const tasks = devices.map(device =>
      takeScreenshotWithDevice(urlRecord, device, browser)
        .then(result => results.push(result))
        .catch(err => errors.push({ device: device.device_name || device.name, error: err.message }))
    );
    await Promise.all(tasks);
  }

  if (results.length === 0 && errors.length > 0) {
    throw new Error(`所有设备截图失败: ${errors.map(e => `${e.device}: ${e.error}`).join('; ')}`);
  }

  return {
    success: results.length,
    failed: errors.length,
    results,
    errors
  };
}

export async function saveUrlDevices(urlId, devices) {
  const db = await getDb();

  db.prepare('DELETE FROM url_devices WHERE url_id = ?').run(urlId);

  const insertStmt = db.prepare(`
    INSERT INTO url_devices (
      url_id, device_id, device_name, device_type,
      width, height, device_scale_factor, user_agent, is_mobile, is_touch
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const device of devices) {
    insertStmt.run(
      urlId,
      device.device_id || device.id || null,
      device.device_name || device.name,
      device.device_type || device.type || 'custom',
      device.width,
      device.height,
      device.device_scale_factor || 1,
      device.user_agent || null,
      device.is_mobile || 0,
      device.is_touch || 0
    );
  }

  return true;
}

export { SCREENSHOTS_DIR };
