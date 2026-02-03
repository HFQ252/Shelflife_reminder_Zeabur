// 全局变量
let currentRecords = [];
let currentProducts = [];
let duplicateCheckData = null;
let deleteRecordId = null;

// DOM 加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    initApp();
    
    // 键盘快捷键
    document.addEventListener('keydown', function(e) {
        // Ctrl+R 刷新当前标签页
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            refreshCurrentTab();
        }
        
        // ESC 关闭所有模态框
        if (e.key === 'Escape') {
            closeAllModals();
        }
    });
});

// 初始化应用
function initApp() {
    // 设置生产日期最大值为今天
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('productionDate').max = today;
    
    // 绑定事件监听器
    bindEvents();
    
    // 加载初始数据
    loadInitialData();
    
    // 自动刷新数据（每5分钟）
    setInterval(refreshAllData, 5 * 60 * 1000);
}

// 绑定所有事件监听器
function bindEvents() {
    // SKU 输入事件
    const skuInput = document.getElementById('skuInput');
    skuInput.addEventListener('input', handleSkuInput);
    skuInput.addEventListener('focus', showSkuSuggestions);
    
    // 限制只能输入数字
    skuInput.addEventListener('keypress', function(e) {
        if (!/[0-9]/.test(e.key)) {
            e.preventDefault();
        }
    });
    
    // 5位数字输入完成后自动聚焦到日期选择框
    skuInput.addEventListener('input', function(e) {
        if (this.value.length === 5 && /^[0-9]{5}$/.test(this.value)) {
            setTimeout(() => {
                document.getElementById('productionDate').focus();
                document.getElementById('productionDate').showPicker();
            }, 100);
        }
    });
    
    // 商品数据库搜索框
    const productSearch = document.getElementById('productSearch');
    productSearch.addEventListener('input', handleProductSearch);
    productSearch.addEventListener('keypress', function(e) {
        if (!/[0-9]/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete') {
            e.preventDefault();
        }
    });
    
    // 生产日期变化事件
    document.getElementById('productionDate').addEventListener('change', calculateDates);
    
    // 保存按钮事件
    document.getElementById('saveBtn').addEventListener('click', saveProductRecord);
    
    // 新增商品按钮事件
    document.getElementById('addProductBtn').addEventListener('click', addNewProduct);
    
    // 编辑保存按钮事件
    document.getElementById('saveEditBtn').addEventListener('click', saveProductEdit);
    
    // 删除确认按钮事件
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
    
    // 表单验证
    document.querySelectorAll('input[required]').forEach(input => {
        input.addEventListener('blur', validateInput);
    });
    
    // 标签页切换事件
    document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
        tab.addEventListener('shown.bs.tab', handleTabSwitch);
    });
}

// 加载初始数据
function loadInitialData() {
    showLoading();
    Promise.all([
        loadExpiringProducts(),
        loadAllProducts(),
        loadProductDatabase()
    ]).finally(() => {
        hideLoading();
    });
}

// 刷新所有数据
function refreshAllData() {
    const activeTab = document.querySelector('.nav-link.active').id;
    switch(activeTab) {
        case 'expiring-tab':
            loadExpiringProducts();
            break;
        case 'all-tab':
            loadAllProducts();
            break;
        case 'database-tab':
            loadProductDatabase();
            break;
    }
}

// 刷新当前标签页
function refreshCurrentTab() {
    const activeTab = document.querySelector('.nav-link.active').id;
    switch(activeTab) {
        case 'expiring-tab':
            loadExpiringProducts();
            showAlert('临期商品列表已刷新', 'info');
            break;
        case 'all-tab':
            loadAllProducts();
            showAlert('所有商品列表已刷新', 'info');
            break;
        case 'database-tab':
            loadProductDatabase();
            showAlert('商品数据库已刷新', 'info');
            break;
        default:
            loadProductDatabase();
            showAlert('商品数据库已刷新', 'info');
    }
}

// 处理SKU输入
async function handleSkuInput(e) {
    const sku = e.target.value;
    
    if (sku.length === 5 && /^[0-9]{5}$/.test(sku)) {
        await lookupProduct(sku);
    } else {
        clearProductFields();
    }
}

// 显示SKU建议
function showSkuSuggestions() {
    const input = document.getElementById('skuInput');
    const suggestions = document.getElementById('sku-suggestions');
    const value = input.value.toLowerCase();
    
    if (value.length < 2) {
        suggestions.style.display = 'none';
        return;
    }
    
    const filtered = currentProducts.filter(p => 
        p.sku.includes(value) || 
        p.name.toLowerCase().includes(value)
    ).slice(0, 5);
    
    if (filtered.length === 0) {
        suggestions.style.display = 'none';
        return;
    }
    
    suggestions.innerHTML = filtered.map(p => `
        <button type="button" class="list-group-item list-group-item-action" 
                onclick="selectSku('${p.sku}', '${p.name.replace(/'/g, "\\'")}')">
            <strong>${p.sku}</strong> - ${p.name}
        </button>
    `).join('');
    suggestions.style.display = 'block';
}

// 选择SKU
function selectSku(sku, name) {
    document.getElementById('skuInput').value = sku;
    document.getElementById('sku-suggestions').style.display = 'none';
    lookupProduct(sku);
}

// 查询商品信息
async function lookupProduct(sku) {
    try {
        const response = await fetch(`/api/products?sku=${sku}`);
        if (!response.ok) throw new Error('查询失败');
        
        const product = await response.json();
        
        if (product) {
            document.getElementById('productName').value = product.name;
            document.getElementById('shelfLife').value = product.shelf_life;
            document.getElementById('reminderDays').value = product.reminder_days;
            document.getElementById('productionDate').disabled = false;
            document.getElementById('productionDate').title = '';
            
            // 重新计算日期
            calculateDates();
        } else {
            clearProductFields();
            showAlert('未找到该SKU的商品信息，请先在"商品数据库"中添加', 'warning');
        }
    } catch (error) {
        console.error('查询商品失败:', error);
        showAlert('查询商品信息失败，请检查网络连接', 'danger');
    }
}

// 清空商品字段
function clearProductFields() {
    document.getElementById('productName').value = '';
    document.getElementById('shelfLife').value = '';
    document.getElementById('reminderDays').value = '';
    document.getElementById('productionDate').value = '';
    document.getElementById('productionDate').disabled = true;
    document.getElementById('saveBtn').disabled = true;
    
    document.getElementById('expiryDate').textContent = '-';
    document.getElementById('reminderDate').textContent = '-';
    document.getElementById('remainingDays').textContent = '-';
    
    updateStatusIndicator(0, 0);
}

// 计算日期
function calculateDates() {
    const productionDate = document.getElementById('productionDate').value;
    const shelfLife = parseInt(document.getElementById('shelfLife').value) || 0;
    const reminderDays = parseInt(document.getElementById('reminderDays').value) || 0;
    
    if (!productionDate || shelfLife <= 0) {
        document.getElementById('saveBtn').disabled = true;
        return;
    }
    
    const prodDate = new Date(productionDate);
    const expiryDate = new Date(prodDate);
    expiryDate.setDate(prodDate.getDate() + shelfLife);
    
    const reminderDate = new Date(expiryDate);
    reminderDate.setDate(expiryDate.getDate() - reminderDays);
    
    const today = new Date();
    const remainingDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    
    // 更新显示
    document.getElementById('expiryDate').textContent = formatDate(expiryDate);
    document.getElementById('reminderDate').textContent = formatDate(reminderDate);
    document.getElementById('remainingDays').textContent = remainingDays;
    
    // 更新状态指示器
    updateStatusIndicator(remainingDays, shelfLife);
    
    // 启用保存按钮
    document.getElementById('saveBtn').disabled = false;
}

// 更新状态指示器
function updateStatusIndicator(remainingDays, shelfLife) {
    const statusText = document.getElementById('statusText');
    const percentageText = document.getElementById('percentageText');
    const progressBar = document.getElementById('statusProgress');
    
    if (shelfLife <= 0) {
        statusText.textContent = '状态：未设置';
        progressBar.style.width = '100%';
        progressBar.className = 'progress-bar bg-secondary';
        percentageText.textContent = '0%';
        return;
    }
    
    const percentage = Math.max(0, Math.min(100, Math.round((remainingDays / shelfLife) * 100)));
    
    if (remainingDays <= 0) {
        statusText.textContent = '状态：已过期';
        progressBar.style.width = '100%';
        progressBar.className = 'progress-bar bg-danger';
        percentageText.textContent = '已过期';
    } else if (remainingDays <= 7) {
        statusText.textContent = '状态：即将过期';
        progressBar.style.width = `${percentage}%`;
        progressBar.className = 'progress-bar bg-danger';
        percentageText.textContent = `${percentage}%`;
    } else if (remainingDays <= 30) {
        statusText.textContent = '状态：临期';
        progressBar.style.width = `${percentage}%`;
        progressBar.className = 'progress-bar bg-warning';
        percentageText.textContent = `${percentage}%`;
    } else {
        statusText.textContent = '状态：正常';
        progressBar.style.width = `${percentage}%`;
        progressBar.className = 'progress-bar bg-success';
        percentageText.textContent = `${percentage}%`;
    }
}

// 保存商品记录
async function saveProductRecord() {
    const sku = document.getElementById('skuInput').value;
    const productionDate = document.getElementById('productionDate').value;
    const shelfLife = parseInt(document.getElementById('shelfLife').value);
    const reminderDays = parseInt(document.getElementById('reminderDays').value);
    
    if (!sku || !productionDate || !shelfLife) {
        showAlert('请填写完整的商品信息', 'warning');
        return;
    }
    
    // 检查重复记录
    try {
        const checkResponse = await fetch(`/api/check-duplicate?sku=${sku}&production_date=${productionDate}`);
        if (checkResponse.ok) {
            const duplicate = await checkResponse.json();
            if (duplicate.exists) {
                showDuplicateWarning(duplicate.record);
                return;
            }
        }
    } catch (error) {
        console.error('检查重复记录失败:', error);
    }
    
    await saveRecord();
}

// 显示重复警告
function showDuplicateWarning(record) {
    duplicateCheckData = {
        sku: document.getElementById('skuInput').value,
        productionDate: document.getElementById('productionDate').value,
        shelfLife: parseInt(document.getElementById('shelfLife').value),
        reminderDays: parseInt(document.getElementById('reminderDays').value)
    };
    
    document.getElementById('duplicateBody').innerHTML = `
        <p>系统中已存在相同的SKU和生产日期的记录：</p>
        <div class="alert alert-light">
            <strong>SKU：</strong> ${record.sku}<br>
            <strong>商品名称：</strong> ${record.name}<br>
            <strong>生产日期：</strong> ${formatDate(new Date(record.production_date))}<br>
            <strong>库位：</strong> <span class="badge location-badge">${record.location}</span>
        </div>
        <p class="mb-0">是否仍然要添加新记录？</p>
    `;
    
    const modal = new bootstrap.Modal(document.getElementById('duplicateModal'));
    modal.show();
}

// 确认重复添加
async function confirmDuplicate() {
    if (duplicateCheckData) {
        await saveRecord();
        duplicateCheckData = null;
        bootstrap.Modal.getInstance(document.getElementById('duplicateModal')).hide();
    }
}

// 取消重复添加
function cancelDuplicate() {
    duplicateCheckData = null;
    bootstrap.Modal.getInstance(document.getElementById('duplicateModal')).hide();
}

// 保存记录到数据库
async function saveRecord() {
    showLoading();
    
    const data = duplicateCheckData || {
        sku: document.getElementById('skuInput').value,
        productionDate: document.getElementById('productionDate').value,
        shelfLife: parseInt(document.getElementById('shelfLife').value),
        reminderDays: parseInt(document.getElementById('reminderDays').value)
    };
    
    try {
        const response = await fetch('/api/records', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showAlert('商品记录保存成功', 'success');
            clearProductFields();
            loadAllProducts();
        } else {
            throw new Error('保存失败');
        }
    } catch (error) {
        console.error('保存记录失败:', error);
        showAlert('保存商品记录失败', 'danger');
    } finally {
        hideLoading();
    }
}

// 添加新商品到数据库
async function addNewProduct() {
    const sku = document.getElementById('newSku').value;
    const name = document.getElementById('newName').value.trim();
    const shelfLife = parseInt(document.getElementById('newShelfLife').value);
    const reminderDays = parseInt(document.getElementById('newReminderDays').value);
    const location = document.getElementById('newLocation').value.trim();
    
    // 验证输入
    if (!sku || !name || !shelfLife || isNaN(reminderDays) || !location) {
        showAlert('请填写所有必填字段', 'warning');
        return;
    }
    
    if (!/^[0-9]{5}$/.test(sku)) {
        showAlert('SKU必须是5位数字组合', 'warning');
        return;
    }
    
    if (shelfLife < 1) {
        showAlert('保质期必须大于0天', 'warning');
        return;
    }
    
    if (reminderDays < 0) {
        showAlert('临期提醒天数不能为负数', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sku,
                name,
                shelf_life: shelfLife,
                reminder_days: reminderDays,
                location
            })
        });
        
        if (response.ok) {
            showAlert('商品添加成功', 'success');
            
            // 清空表单
            document.getElementById('newSku').value = '';
            document.getElementById('newName').value = '';
            document.getElementById('newShelfLife').value = '';
            document.getElementById('newReminderDays').value = '';
            document.getElementById('newLocation').value = '';
            
            // 刷新商品数据库
            loadProductDatabase();
            
            // 如果是查询标签页，也刷新SKU列表
            if (document.querySelector('#query-tab').classList.contains('active')) {
                loadProductDatabase();
            }
        } else {
            const error = await response.text();
            throw new Error(error);
        }
    } catch (error) {
        console.error('添加商品失败:', error);
        showAlert(`添加商品失败: ${error.message}`, 'danger');
    } finally {
        hideLoading();
    }
}

// 处理商品数据库搜索
function handleProductSearch(e) {
    const searchTerm = e.target.value;
    
    if (searchTerm.length === 5 && /^[0-9]{5}$/.test(searchTerm)) {
        searchProductBySku(searchTerm);
    } else if (searchTerm.length === 0) {
        loadProductDatabase();
    } else {
        filterProducts(searchTerm);
    }
}

// 搜索商品
async function searchProductBySku(sku) {
    try {
        const response = await fetch(`/api/products?sku=${sku}`);
        if (!response.ok) throw new Error('搜索失败');
        
        const product = await response.json();
        if (product) {
            // 显示单个商品
            renderProductDatabaseTable([product]);
        } else {
            document.getElementById('productDatabaseTable').innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-5">
                        <div class="empty-state">
                            <i class="bi bi-search text-muted"></i>
                            <h5 class="mt-3">未找到商品</h5>
                            <p class="text-muted">未找到SKU为 ${sku} 的商品</p>
                        </div>
                    </td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('搜索商品失败:', error);
        showAlert('搜索商品失败', 'danger');
    }
}

// 过滤商品
function filterProducts(searchTerm) {
    const filtered = currentProducts.filter(p => 
        p.sku.includes(searchTerm) || 
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    
    if (filtered.length === 0) {
        document.getElementById('productDatabaseTable').innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <div class="empty-state">
                        <i class="bi bi-search text-muted"></i>
                        <h5 class="mt-3">未找到匹配的商品</h5>
                        <p class="text-muted">请尝试其他搜索词</p>
                    </div>
                </td>
            </tr>
        `;
    } else {
        renderProductDatabaseTable(filtered);
    }
}

// 加载临期商品
async function loadExpiringProducts() {
    try {
        const response = await fetch('/api/records/expiring');
        if (!response.ok) throw new Error('加载失败');
        
        const records = await response.json();
        currentRecords = records;
        renderExpiringTable(records);
        
        // 更新计数
        document.getElementById('expiring-count').textContent = records.length;
    } catch (error) {
        console.error('加载临期商品失败:', error);
        document.getElementById('expiringTable').innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    加载失败，请刷新页面重试
                </td>
            </tr>
        `;
    }
}

// 加载所有商品
async function loadAllProducts() {
    try {
        const response = await fetch('/api/records');
        if (!response.ok) throw new Error('加载失败');
        
        const records = await response.json();
        currentRecords = records;
        renderAllTable(records);
        
        // 更新计数
        document.getElementById('all-count').textContent = records.length;
    } catch (error) {
        console.error('加载所有商品失败:', error);
        document.getElementById('allTable').innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    加载失败，请刷新页面重试
                </td>
            </tr>
        `;
    }
}

// 加载商品数据库
async function loadProductDatabase() {
    try {
        const response = await fetch('/api/products');
        if (!response.ok) throw new Error('加载失败');
        
        const products = await response.json();
        currentProducts = products;
        renderProductDatabaseTable(products);
        
        // 更新计数
        document.getElementById('database-count').textContent = products.length;
        
        // 清空搜索框
        document.getElementById('productSearch').value = '';
    } catch (error) {
        console.error('加载商品数据库失败:', error);
        document.getElementById('productDatabaseTable').innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    加载失败，请刷新页面重试
                </td>
            </tr>
        `;
    }
}

// 渲染临期商品表格
function renderExpiringTable(records) {
    const tbody = document.getElementById('expiringTable');
    
    if (!records || records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-5">
                    <div class="empty-state">
                        <i class="bi bi-check-circle text-success"></i>
                        <h5 class="mt-3">暂无临期商品</h5>
                        <p class="text-muted">所有商品都在保质期内</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    const html = records.map(record => {
        const remainingDays = calculateRemainingDays(record.production_date, record.shelf_life);
        const status = getStatus(remainingDays, record.reminder_days);
        
        return `
            <tr class="${remainingDays <= 0 ? 'table-danger' : 'table-warning'}">
                <td><strong>${record.sku}</strong></td>
                <td>${record.name}</td>
                <td><span class="badge location-badge">${record.location}</span></td>
                <td>${formatDate(new Date(record.production_date))}</td>
                <td>${formatDate(new Date(record.production_date + record.shelf_life * 24 * 60 * 60 * 1000))}</td>
                <td>
                    <span class="fw-bold ${remainingDays <= 0 ? 'text-danger' : 'text-warning'}">
                        ${remainingDays}
                    </span>
                </td>
                <td>${getStatusBadge(remainingDays, record.reminder_days)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="showDeleteConfirm(${record.id}, '${record.sku}', '${record.name}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = html;
}

// 渲染所有商品表格
function renderAllTable(records) {
    const tbody = document.getElementById('allTable');
    
    if (!records || records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-5">
                    <div class="empty-state">
                        <i class="bi bi-box text-muted"></i>
                        <h5 class="mt-3">暂无商品记录</h5>
                        <p class="text-muted">请先在"商品查询"中添加商品</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // 按剩余天数排序
    const sortedRecords = [...records].sort((a, b) => {
        const daysA = calculateRemainingDays(a.production_date, a.shelf_life);
        const daysB = calculateRemainingDays(b.production_date, b.shelf_life);
        return daysA - daysB;
    });
    
    const html = sortedRecords.map(record => {
        const remainingDays = calculateRemainingDays(record.production_date, record.shelf_life);
        const status = getStatus(remainingDays, record.reminder_days);
        const rowClass = remainingDays <= 0 ? 'table-danger' : 
                        remainingDays <= record.reminder_days ? 'table-warning' : '';
        
        return `
            <tr class="${rowClass}">
                <td><strong>${record.sku}</strong></td>
                <td>${record.name}</td>
                <td><span class="badge location-badge">${record.location}</span></td>
                <td>${formatDate(new Date(record.production_date))}</td>
                <td>${formatDate(new Date(record.production_date + record.shelf_life * 24 * 60 * 60 * 1000))}</td>
                <td>
                    <span class="fw-bold ${remainingDays <= 0 ? 'text-danger' : 
                                      remainingDays <= record.reminder_days ? 'text-warning' : 
                                      'text-success'}">
                        ${remainingDays}
                    </span>
                </td>
                <td>${getStatusBadge(remainingDays, record.reminder_days)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="showDeleteConfirm(${record.id}, '${record.sku}', '${record.name}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = html;
}

// 渲染商品数据库表格
function renderProductDatabaseTable(products) {
    const tbody = document.getElementById('productDatabaseTable');
    
    if (!products || products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <div class="empty-state">
                        <i class="bi bi-database text-muted"></i>
                        <h5 class="mt-3">暂无商品数据</h5>
                        <p class="text-muted">请先添加商品到数据库</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    const html = products.map(product => {
        return `
            <tr>
                <td><strong>${product.sku}</strong></td>
                <td>${product.name}</td>
                <td>${product.shelf_life}</td>
                <td>${product.reminder_days}</td>
                <td><span class="badge location-badge">${product.location}</span></td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="showEditModal(${product.id})">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-danger" onclick="showDeleteConfirm(${product.id}, '${product.sku}', '${product.name}', true)">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = html;
}

// 显示删除确认模态框
function showDeleteConfirm(id, sku, name, isProduct = false) {
    deleteRecordId = id;
    const isProductDb = isProduct;
    
    document.getElementById('modalBody').innerHTML = `
        <p>确定要删除以下${isProductDb ? '商品' : '记录'}吗？此操作不可恢复。</p>
        <div class="alert alert-danger">
            <strong>SKU：</strong> ${sku}<br>
            <strong>${isProductDb ? '商品名称' : '记录名称'}：</strong> ${name}
        </div>
        <p class="text-danger mb-0"><small>
            <i class="bi bi-exclamation-triangle me-1"></i>
            ${isProductDb ? '删除商品将同时删除所有相关记录！' : '删除后数据将无法恢复！'}
        </small></p>
    `;
    
    const modal = new bootstrap.Modal(document.getElementById('confirmModal'));
    modal.show();
}

// 确认删除
async function confirmDelete() {
    if (!deleteRecordId) return;
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('confirmModal'));
    const url = window.location.href.includes('product') ? 
                `/api/products/${deleteRecordId}` : 
                `/api/records/${deleteRecordId}`;
    
    showLoading();
    
    try {
        const response = await fetch(url, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showAlert('删除成功', 'success');
            
            // 根据当前标签页刷新数据
            const activeTab = document.querySelector('.nav-link.active').id;
            switch(activeTab) {
                case 'expiring-tab':
                    loadExpiringProducts();
                    break;
                case 'all-tab':
                    loadAllProducts();
                    break;
                case 'database-tab':
                    loadProductDatabase();
                    break;
                default:
                    loadProductDatabase();
            }
        } else {
            throw new Error('删除失败');
        }
    } catch (error) {
        console.error('删除失败:', error);
        showAlert('删除失败', 'danger');
    } finally {
        hideLoading();
        modal.hide();
        deleteRecordId = null;
    }
}

// 显示编辑模态框
async function showEditModal(productId) {
    try {
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) throw new Error('加载失败');
        
        const product = await response.json();
        
        document.getElementById('editSku').value = product.sku;
        document.getElementById('editName').value = product.name;
        document.getElementById('editShelfLife').value = product.shelf_life;
        document.getElementById('editReminderDays').value = product.reminder_days;
        document.getElementById('editLocation').value = product.location;
        
        // 保存产品ID到按钮
        document.getElementById('saveEditBtn').dataset.productId = productId;
        
        const modal = new bootstrap.Modal(document.getElementById('editModal'));
        modal.show();
    } catch (error) {
        console.error('加载商品信息失败:', error);
        showAlert('加载商品信息失败', 'danger');
    }
}

// 保存商品编辑
async function saveProductEdit() {
    const productId = document.getElementById('saveEditBtn').dataset.productId;
    const name = document.getElementById('editName').value.trim();
    const shelfLife = parseInt(document.getElementById('editShelfLife').value);
    const reminderDays = parseInt(document.getElementById('editReminderDays').value);
    const location = document.getElementById('editLocation').value.trim();
    
    if (!name || !shelfLife || isNaN(reminderDays) || !location) {
        showAlert('请填写所有必填字段', 'warning');
        return;
    }
    
    showLoading();
    
    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name,
                shelf_life: shelfLife,
                reminder_days: reminderDays,
                location
            })
        });
        
        if (response.ok) {
            showAlert('商品信息更新成功', 'success');
            loadProductDatabase();
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('editModal'));
            modal.hide();
        } else {
            throw new Error('更新失败');
        }
    } catch (error) {
        console.error('更新商品信息失败:', error);
        showAlert('更新商品信息失败', 'danger');
    } finally {
        hideLoading();
    }
}

// 工具函数
function formatDate(date) {
    if (!date || isNaN(date.getTime())) return '-';
    return date.toISOString().split('T')[0];
}

function calculateRemainingDays(productionDate, shelfLife) {
    const expiryDate = new Date(productionDate);
    expiryDate.setDate(expiryDate.getDate() + shelfLife);
    
    const today = new Date();
    const diffTime = expiryDate - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getStatus(remainingDays, reminderDays) {
    if (remainingDays <= 0) return 'expired';
    if (remainingDays <= reminderDays) return 'warning';
    return 'normal';
}

function getStatusBadge(remainingDays, reminderDays) {
    const status = getStatus(remainingDays, reminderDays);
    const texts = {
        'expired': { text: '已过期', class: 'status-expired' },
        'warning': { text: '临期', class: 'status-warning' },
        'normal': { text: '正常', class: 'status-normal' }
    };
    
    const { text, className } = texts[status];
    return `<span class="badge ${className}">${text}</span>`;
}

function validateInput(e) {
    const input = e.target;
    if (input.required && input.value.trim() === '') {
        input.classList.remove('is-valid');
        input.classList.add('is-invalid');
    } else {
        input.classList.remove('is-invalid');
        input.classList.add('is-valid');
    }
}

function handleTabSwitch(e) {
    const tabId = e.target.id;
    switch(tabId) {
        case 'expiring-tab':
            loadExpiringProducts();
            break;
        case 'all-tab':
            loadAllProducts();
            break;
        case 'database-tab':
            loadProductDatabase();
            break;
    }
}

function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const bsModal = bootstrap.Modal.getInstance(modal);
        if (bsModal) bsModal.hide();
    });
}

function showAlert(message, type = 'info') {
    const container = document.getElementById('globalAlertContainer');
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.innerHTML = `
        <i class="bi bi-${type === 'success' ? 'check-circle' : 
                        type === 'warning' ? 'exclamation-triangle' : 
                        type === 'danger' ? 'x-circle' : 'info-circle'} me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    container.appendChild(alert);
    
    // 自动消失
    setTimeout(() => {
        if (alert.parentNode) {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 150);
        }
    }, 3000);
}

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}
