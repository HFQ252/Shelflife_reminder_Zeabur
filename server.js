// 删除商品 - 修改响应格式
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
            // 返回更清晰的响应
            res.json({ 
                deleted: this.changes > 0,
                changes: this.changes,
                id: id 
            });
        });
    });
});
