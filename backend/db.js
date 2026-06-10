import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'data.db');

let dbInstance = null;

function wrapStatement(stmt, db) {
  return {
    run(...params) {
      stmt.bind(params);
      while (stmt.step()) {}
      const lastId = db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0];
      const changes = db.exec('SELECT changes() AS c')[0]?.values[0][0];
      stmt.reset();
      stmt.free();
      return { lastInsertRowid: lastId, changes: changes };
    },
    get(...params) {
      stmt.bind(params);
      let result = null;
      if (stmt.step()) {
        result = stmt.getAsObject();
      }
      stmt.reset();
      stmt.free();
      return result;
    },
    all(...params) {
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.reset();
      stmt.free();
      return results;
    }
  };
}

async function initDb() {
  const SQL = await initSqlJs({
    locateFile: (file) => {
      const rawPath = new URL(import.meta.resolve('sql.js')).pathname.replace(/^\/([A-Z]:)/, '$1');
      const modPath = path.dirname(decodeURIComponent(rawPath));
      const fullPath = path.join(modPath, file);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
      const altPath = path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
      return altPath;
    }
  });

  let db;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'daily',
      status TEXT NOT NULL DEFAULT 'active',
      execution_strategy TEXT NOT NULL DEFAULT 'parallel',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_screenshot_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'custom',
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      device_scale_factor REAL NOT NULL DEFAULT 1,
      user_agent TEXT,
      is_mobile INTEGER DEFAULT 0,
      is_touch INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS url_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      device_id INTEGER,
      device_name TEXT,
      device_type TEXT,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      device_scale_factor REAL NOT NULL DEFAULT 1,
      user_agent TEXT,
      is_mobile INTEGER DEFAULT 0,
      is_touch INTEGER DEFAULT 0,
      FOREIGN KEY (url_id) REFERENCES urls(id) ON DELETE CASCADE,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
    );
  `);

  function getColumnNames(tableName) {
    const result = db.exec(`PRAGMA table_info(${tableName})`);
    if (result.length === 0) return [];
    return result[0].values.map(row => row[1]);
  }

  const urlCols = getColumnNames('urls');
  if (!urlCols.includes('execution_strategy')) {
    db.exec("ALTER TABLE urls ADD COLUMN execution_strategy TEXT NOT NULL DEFAULT 'parallel'");
  }

  const shotCols = getColumnNames('screenshots');
  if (!shotCols.includes('device_id')) {
    db.exec(`
      ALTER TABLE screenshots ADD COLUMN device_id INTEGER REFERENCES devices(id) ON DELETE SET NULL;
    `);
  }
  if (!shotCols.includes('device_name')) {
    db.exec(`ALTER TABLE screenshots ADD COLUMN device_name TEXT;`);
  }
  if (!shotCols.includes('device_type')) {
    db.exec(`ALTER TABLE screenshots ADD COLUMN device_type TEXT;`);
  }
  if (!shotCols.includes('viewport_width')) {
    db.exec(`ALTER TABLE screenshots ADD COLUMN viewport_width INTEGER;`);
  }
  if (!shotCols.includes('viewport_height')) {
    db.exec(`ALTER TABLE screenshots ADD COLUMN viewport_height INTEGER;`);
  }
  if (!shotCols.includes('device_scale_factor')) {
    db.exec(`ALTER TABLE screenshots ADD COLUMN device_scale_factor REAL;`);
  }
  if (!shotCols.includes('user_agent')) {
    db.exec(`ALTER TABLE screenshots ADD COLUMN user_agent TEXT;`);
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_screenshots_url_id ON screenshots(url_id);
    CREATE INDEX IF NOT EXISTS idx_screenshots_created_at ON screenshots(created_at);
    CREATE INDEX IF NOT EXISTS idx_screenshots_device_id ON screenshots(device_id);
    CREATE INDEX IF NOT EXISTS idx_url_devices_url_id ON url_devices(url_id);
    CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(type);
  `);

  const deviceCount = db.exec("SELECT COUNT(*) as c FROM devices")[0]?.values[0][0] || 0;
  if (deviceCount === 0) {
    const defaultDevices = [
      { name: '桌面端', type: 'desktop', width: 1920, height: 1080, dpr: 1, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', mobile: 0, touch: 0, sort: 1 },
      { name: 'iPad Pro', type: 'tablet', width: 1024, height: 1366, dpr: 2, ua: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1', mobile: 0, touch: 1, sort: 2 },
      { name: 'iPhone 14 Pro', type: 'mobile', width: 393, height: 852, dpr: 3, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1', mobile: 1, touch: 1, sort: 3 },
      { name: 'Android Pixel 7', type: 'mobile', width: 412, height: 915, dpr: 2.625, ua: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36', mobile: 1, touch: 1, sort: 4 }
    ];
    defaultDevices.forEach(d => {
      const stmt = db.prepare(`INSERT INTO devices (name, type, width, height, device_scale_factor, user_agent, is_mobile, is_touch, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);
      stmt.bind([d.name, d.type, d.width, d.height, d.dpr, d.ua, d.mobile, d.touch, d.sort]);
      while (stmt.step()) {}
      stmt.free();
    });
  }

  const wrappedDb = {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return wrapStatement(stmt, db);
    },
    exec(sql) {
      db.exec(sql);
    },
    pragma() {},
    save() {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(DB_PATH, buffer);
    }
  };

  const origPrepare = wrappedDb.prepare;
  wrappedDb.prepare = function(sql) {
    const wrapped = origPrepare.call(this, sql);
    const origRun = wrapped.run;
    wrapped.run = function(...args) {
      const ret = origRun.call(this, ...args);
      wrappedDb.save();
      return ret;
    };
    return wrapped;
  };

  return wrappedDb;
}

export default async function getDb() {
  if (!dbInstance) {
    dbInstance = await initDb();
  }
  return dbInstance;
}
