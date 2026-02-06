const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 数据库连接
const dbPath = process.env.DB_PATH || 'data.db';
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('数据库连接失败:', err.message);
    } else {
        console.log('成功连接到SQLite数据库');
        
        // 创建表（如果不存在）
        db.run(`CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            shelf_life INTEGER NOT NULL,
            reminder_days INTEGER NOT NULL DEFAULT 7,
            location TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error('创建products表失败:', err);
        });
        
        db.run(`CREATE TABLE IF NOT EXISTS product_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT NOT NULL,
            name TEXT NOT NULL,
            production_date DATE NOT NULL,
            shelf_life INTEGER NOT NULL,
            reminder_days INTEGER NOT NULL,
            location TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sku) REFERENCES products (sku)
        )`, (err) => {
            if (err) console.error('创建product_records表失败:', err);
        });
        
        // 创建索引
        db.run(`CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`, (err) => {
            if (err) console.error('创建索引失败:', err);
        });
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_records_sku ON product_records(sku)`, (err) => {
            if (err) console.error('创建索引失败:', err);
        });
        
        db.run(`CREATE INDEX IF NOT EXISTS idx_records_expiry ON product_records(production_date, shelf_life)`, (err) => {
            if (err) console.error('创建索引失败:', err);
        });
    }
});

// 获取中国时间
function getChinaTime() {
    const now = new Date();
    // 中国时区为UTC+8
    return new Date(now.getTime() + (8 * 60 * 60 * 1000));
}

// API路由

// 获取所有商品记录
app.get('/api/records', (req, res) => {
    const query = `
        SELECT pr.*, p.location 
        FROM product_records pr
        JOIN products p ON pr.sku = p.sku
        ORDER BY pr.created_at DESC
    `;
    
    db.all(query, [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// 获取临期商品（使用中国时间计算）
app.get('/api/records/expiring', (req, res) => {
    const now = getChinaTime();
    const today = now.toISOString().split('T')[0];
    
    // 使用中国时间计算剩余天数
    const query = `
        SELECT 
            pr.*, 
            p.location,
            -- 计算到期日期（使用中国时区）
            date(pr.production_date, '+' || pr.shelf_life || ' days') as expiry_date,
            -- 计算剩余天数（考虑中国时区）
            julianday(date(pr.production_date, '+' || pr.shelf_life || ' days')) - julianday(?) as remaining_days
        FROM product_records pr
        JOIN products p ON pr.sku = p.sku
        WHERE julianday(date(pr.production_date, '+' || pr.shelf_life || ' days')) - julianday(?) <= pr.reminder_days
        ORDER BY remaining_days ASC
    `;
    
    db.all(query, [today, today], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // 格式化返回数据，确保有到期日期字段
        const formattedRows = rows.map(row => {
            return {
                ...row,
                expiry_date: row.expiry_date,
                remaining_days: Math.floor(row.remaining_days)
            };
        });
        
        res.json(formattedRows);
    });
});

// 添加商品记录
app.post('/api/records', (req, res) => {
    const { sku, productionDate, shelfLife, reminderDays } = req.body;
    
    // 首先获取商品信息
    db.get('SELECT * FROM products WHERE sku = ?', [sku], (err, product) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (!product) {
            res.status(404).json({ error: '商品不存在' });
            return;
        }
        
        const record = {
            sku,
            name: product.name,
            production_date: productionDate,
            shelf_life: shelfLife,
            reminder_days: reminderDays,
            location: product.location
        };
        
        const query = `INSERT INTO product_records (sku, name, production_date, shelf_life, reminder_days, location) 
                       VALUES (?, ?, ?, ?, ?, ?)`;
        
        db.run(query, [
            record.sku,
            record.name,
            record.production_date,
            record.shelf_life,
            record.reminder_days,
            record.location
        ], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, ...record });
        });
    });
});

// 检查重复记录
app.get('/api/check-duplicate', (req, res) => {
    const { sku, production_date } = req.query;
    
    const query = `SELECT * FROM product_records WHERE sku = ? AND production_date = ? LIMIT 1`;
    
    db.get(query, [sku, production_date], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ exists: !!row, record: row });
    });
});

// 删除商品记录
app.delete('/api/records/:id', (req, res) => {
    const { id } = req.params;
    
    db.run('DELETE FROM product_records WHERE id = ?', [id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ deleted: this.changes > 0 });
    });
});

// 获取所有商品
app.get('/api/products', (req, res) => {
    const { sku } = req.query;
    
    let query = 'SELECT * FROM products ORDER BY sku';
    let params = [];
    
    if (sku) {
        query = 'SELECT * FROM products WHERE sku = ?';
        params = [sku];
    }
    
    db.all(query, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(sku ? rows[0] || null : rows);
    });
});

// 添加新商品
app.post('/api/products', (req, res) => {
    const { sku, name, shelf_life, reminder_days, location } = req.body;
    
    // 验证SKU唯一性
    db.get('SELECT sku FROM products WHERE sku = ?', [sku], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        if (row) {
            res.status(400).json({ error: 'SKU已存在' });
            return;
        }
        
        const query = `INSERT INTO products (sku, name, shelf_life, reminder_days, location) 
                       VALUES (?, ?, ?, ?, ?)`;
        
        db.run(query, [sku, name, shelf_life, reminder_days, location], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ id: this.lastID, sku, name, shelf_life, reminder_days, location });
        });
    });
});

// 获取单个商品
app.get('/api/products/:id', (req, res) => {
    const { id } = req.params;
    
    db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row || {});
    });
});

// 更新商品
app.put('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const { name, shelf_life, reminder_days, location } = req.body;
    
    const query = `UPDATE products 
                   SET name = ?, shelf_life = ?, reminder_days = ?, location = ?
                   WHERE id = ?`;
    
    db.run(query, [name, shelf_life, reminder_days, location, id], function(err) {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json({ updated: this.changes > 0 });
    });
});

// 删除商品
app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    
    // 先删除相关记录
    db.run('DELETE FROM product_records WHERE sku IN (SELECT sku FROM products WHERE id = ?)', [id], (err) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        
        // 再删除商品
        db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            res.json({ deleted: this.changes > 0 });
        });
    });
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        china_time: getChinaTime().toISOString()
    });
});

// 服务前端应用
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`当前服务器时间: ${new Date().toISOString()}`);
    console.log(`中国时间: ${getChinaTime().toISOString()}`);
});
