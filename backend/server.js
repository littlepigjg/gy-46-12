import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import getDb from './db.js';
import { startScheduler, triggerScreenshotNow, getScreenshotDevices } from './scheduler.js';
import { saveUrlDevices, getUrlDevices } from './screenshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

app.get('/api/urls', async (req, res) => {
  const db = await getDb();
  const urls = db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM screenshots s WHERE s.url_id = u.id) as screenshot_count
    FROM urls u
    ORDER BY u.created_at DESC
  `).all();
  res.json(urls);
});

app.post('/api/urls', async (req, res) => {
  const { url, name, frequency = 'daily', execution_strategy = 'parallel', devices = [] } = req.body;

  if (!url || !name) {
    return res.status(400).json({ error: 'URL和名称必填' });
  }

  const validFrequencies = ['hourly', 'daily', 'weekly', 'monthly'];
  if (!validFrequencies.includes(frequency)) {
    return res.status(400).json({ error: '无效的频率' });
  }

  const validStrategies = ['parallel', 'serial'];
  if (!validStrategies.includes(execution_strategy)) {
    return res.status(400).json({ error: '无效的执行策略' });
  }

  try {
    const db = await getDb();
    const stmt = db.prepare('INSERT INTO urls (url, name, frequency, execution_strategy) VALUES (?, ?, ?, ?)');
    const result = stmt.run(url, name, frequency, execution_strategy);
    const urlId = result.lastInsertRowid;

    if (devices && devices.length > 0) {
      await saveUrlDevices(urlId, devices);
    }

    const newUrl = db.prepare('SELECT * FROM urls WHERE id = ?').get(urlId);
    res.status(201).json(newUrl);
  } catch (err) {
    if (err.message.includes('UNIQUE') || err.message.includes('unique')) {
      res.status(400).json({ error: '该URL已存在' });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

app.delete('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const screenshots = db.prepare('SELECT file_path FROM screenshots WHERE url_id = ?').all(id);
  screenshots.forEach(s => {
    if (fs.existsSync(s.file_path)) {
      fs.unlinkSync(s.file_path);
      const dir = path.dirname(s.file_path);
      try {
        if (fs.readdirSync(dir).length === 0) {
          fs.rmdirSync(dir);
        }
      } catch (e) {}
    }
  });

  db.prepare('DELETE FROM screenshots WHERE url_id = ?').run(id);
  db.prepare('DELETE FROM url_devices WHERE url_id = ?').run(id);
  const stmt = db.prepare('DELETE FROM urls WHERE id = ?');
  stmt.run(id);
  res.json({ success: true });
});

app.put('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const { name, frequency, status, execution_strategy, devices } = req.body;
  const db = await getDb();

  const existing = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'URL不存在' });
  }

  const finalName = name || existing.name;
  const finalFrequency = frequency || existing.frequency;
  const finalStatus = status || existing.status;
  const finalStrategy = execution_strategy || existing.execution_strategy;

  const stmt = db.prepare('UPDATE urls SET name = ?, frequency = ?, status = ?, execution_strategy = ? WHERE id = ?');
  stmt.run(finalName, finalFrequency, finalStatus, finalStrategy, id);

  if (devices && Array.isArray(devices)) {
    await saveUrlDevices(id, devices);
  }

  const updated = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  res.json(updated);
});

app.get('/api/urls/:id/devices', async (req, res) => {
  const { id } = req.params;
  try {
    const devices = await getUrlDevices(parseInt(id));
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/urls/:id/devices', async (req, res) => {
  const { id } = req.params;
  const { devices } = req.body;

  if (!devices || !Array.isArray(devices)) {
    return res.status(400).json({ error: '设备配置格式错误' });
  }

  try {
    await saveUrlDevices(parseInt(id), devices);
    const updatedDevices = await getUrlDevices(parseInt(id));
    res.json(updatedDevices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/urls/:id/screenshots', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshots = db.prepare(`
    SELECT * FROM screenshots
    WHERE url_id = ?
    ORDER BY created_at DESC
  `).all(id);
  res.json(screenshots);
});

app.get('/api/screenshots/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }
  res.json(screenshot);
});

app.delete('/api/screenshots/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(id);
  if (!screenshot) {
    return res.status(404).json({ error: '截图不存在' });
  }

  if (fs.existsSync(screenshot.file_path)) {
    fs.unlinkSync(screenshot.file_path);
  }

  db.prepare('DELETE FROM screenshots WHERE id = ?').run(id);
  res.json({ success: true });
});

app.post('/api/urls/:id/screenshot', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await triggerScreenshotNow(parseInt(id));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/urls/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();
  const url = db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  if (!url) {
    return res.status(404).json({ error: 'URL不存在' });
  }
  res.json(url);
});

app.get('/api/devices', async (req, res) => {
  const db = await getDb();
  const devices = db.prepare(`
    SELECT * FROM devices
    ORDER BY is_default DESC, sort_order ASC, created_at ASC
  `).all();
  res.json(devices);
});

app.post('/api/devices', async (req, res) => {
  const { name, type = 'custom', width, height, device_scale_factor = 1, user_agent, is_mobile = 0, is_touch = 0, sort_order = 0 } = req.body;

  if (!name || !width || !height) {
    return res.status(400).json({ error: '名称、宽度、高度必填' });
  }

  if (!['desktop', 'tablet', 'mobile', 'custom'].includes(type)) {
    return res.status(400).json({ error: '无效的设备类型' });
  }

  try {
    const db = await getDb();
    const stmt = db.prepare(`
      INSERT INTO devices (name, type, width, height, device_scale_factor, user_agent, is_mobile, is_touch, is_default, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);
    const result = stmt.run(name, type, width, height, device_scale_factor, user_agent || null, is_mobile, is_touch, sort_order);
    const newDevice = db.prepare('SELECT * FROM devices WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(newDevice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/devices/:id', async (req, res) => {
  const { id } = req.params;
  const { name, type, width, height, device_scale_factor, user_agent, is_mobile, is_touch, sort_order } = req.body;
  const db = await getDb();

  const existing = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '设备不存在' });
  }

  if (existing.is_default === 1) {
    return res.status(403).json({ error: '不能修改系统默认设备' });
  }

  const finalName = name || existing.name;
  const finalType = type || existing.type;
  const finalWidth = width || existing.width;
  const finalHeight = height || existing.height;
  const finalDpr = device_scale_factor !== undefined ? device_scale_factor : existing.device_scale_factor;
  const finalUa = user_agent !== undefined ? user_agent : existing.user_agent;
  const finalMobile = is_mobile !== undefined ? is_mobile : existing.is_mobile;
  const finalTouch = is_touch !== undefined ? is_touch : existing.is_touch;
  const finalSort = sort_order !== undefined ? sort_order : existing.sort_order;

  const stmt = db.prepare(`
    UPDATE devices SET name = ?, type = ?, width = ?, height = ?, device_scale_factor = ?,
    user_agent = ?, is_mobile = ?, is_touch = ?, sort_order = ? WHERE id = ?
  `);
  stmt.run(finalName, finalType, finalWidth, finalHeight, finalDpr, finalUa, finalMobile, finalTouch, finalSort, id);

  const updated = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/devices/:id', async (req, res) => {
  const { id } = req.params;
  const db = await getDb();

  const existing = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: '设备不存在' });
  }

  if (existing.is_default === 1) {
    return res.status(403).json({ error: '不能删除系统默认设备' });
  }

  db.prepare('DELETE FROM devices WHERE id = ?').run(id);
  res.json({ success: true });
});

app.listen(PORT, async () => {
  console.log(`后端服务运行在 http://localhost:${PORT}`);
  await getDb();
  startScheduler();
});
