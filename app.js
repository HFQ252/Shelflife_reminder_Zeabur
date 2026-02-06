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
            e.preventDefault();
            closeAllModals();
        }
        
        // Enter 键导航（仅PC端）
        if (e.key === 'Enter' && !isMobileDevice()) {
            handleEnterNavigation(e);
        }
    });
});

// 初始化应用
function initApp() {
    // 设置生产日期最大值为今天（中国时间）
    const todayChina = getChinaDate();
    document.getElementById('productionDate').max = todayChina;
    
    // 清理可能的页面锁定状态
    cleanupPageLock();
    
    // 添加移动端特定样式
    if (isMobileDevice()) {
        addMobileStyles();
    }
    
    // 绑定事件监听器
    bindEvents();
    
    // 加载初始数据
    loadInitialData();
    
    // 自动刷新数据（每5分钟）
    setInterval(refreshAllData, 5 * 60 * 1000);
}

// 清理页面锁定状态
function cleanupPageLock() {
    // 移除所有模态框背景
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => {
        backdrop.remove();
    });
    
    // 恢复页面滚动
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    
    // 移除body上的内联样式
    document.body.removeAttribute('style');
    
    // 移除所有模态框的显示状态
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.classList.remove('show');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    });
}

// 绑定所有事件监听器
function bindEvents() {
    // SKU 输入事件
    const skuInput = document.getElementById('skuInput');
    skuInput.addEventListener('click', clearSkuInput);
    skuInput.addEventListener('input', handleSkuInput);
    skuInput.addEventListener('focus', showSkuSuggestions);
    
    // 生产日期变化事件
    document.getElementById('productionDate').addEventListener('change', handleDateChange);
    
    // 保存按钮事件
    document.getElementById('saveBtn').addEventListener('click', handleSave);
    
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
    
    // 绑定删除按钮事件（事件委托）
    bindDeleteEvents();
    
    // 移动端触摸事件
    if (isMobileDevice()) {
        addTouchEvents();
    }
}

// 绑定删除事件（事件委托）
function bindDeleteEvents() {
    document.addEventListener('click', function(e) {
        const deleteBtn = e.target.closest('.btn-outline-danger');
        if (!deleteBtn) return;
        
        // 检查是否有tr父元素
        const row = deleteBtn.closest('tr');
        if (!row) return;
        
        // 获取按钮的onclick属性
        const onclickAttr = deleteBtn.getAttribute('onclick');
        if (!onclickAttr) return;
        
        // 解析onclick中的参数
        const match = onclickAttr.match(/showDeleteConfirm\(([^)]+)\)/);
        if (!match) return;
        
        const params = match[1].split(',').map(param => param.trim());
        const id = parseInt(params[0]);
        
        if (!id) return;
        
        // 获取表格类型
        const table = row.closest('table');
        let isProduct = false;
        
        if (table) {
            const tableId = table.parentElement.parentElement.id;
            if (tableId === 'productDatabaseTable') {
                isProduct = true;
            }
        }
        
        // 从行中获取数据
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) return;
        
        let recordData = {};
        
        if (isProduct) {
            // 商品数据库表格
            recordData = {
                sku: cells[0].textContent.trim(),
                name: cells[1].textContent.trim(),
                shelf_life: parseInt(cells[2].textContent.trim()) || 0,
                reminder_days: parseInt(cells[3].textContent.trim()) || 0,
                location: cells[4].querySelector('.location-badge')?.textContent.trim() || ''
            };
        } else {
            // 库存记录表格
            const productionDate = cells[3].textContent.trim();
            const shelfLife = parseInt(document.getElementById('shelfLife').value) || 0;
            const reminderDays = parseInt(document.getElementById('reminderDays').value) || 0;
            
            recordData = {
                sku: cells[0].textContent.trim(),
                name: cells[1].textContent.trim(),
                location: cells[2].querySelector('.location-badge')?.textContent.trim() || '',
                production_date: productionDate,
                shelf_life: shelfLife,
                reminder_days: reminderDays
            };
        }
        
        showDeleteConfirm(id, recordData, isProduct);
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

// 清空SKU输入框
function clearSkuInput() {
    const skuInput = document.getElementById('skuInput');
    skuInput.value = '';
    skuInput.focus();
    clearProductFields();
    highlightElement(skuInput);
    
    // 移动端优化：关闭键盘（如果已打开）
    if (isMobileDevice()) {
        setTimeout(() => {
            skuInput.blur();
        }, 100);
    }
}

// 处理SKU输入
async function handleSkuInput(e) {
    const sku = e.target.value.toUpperCase();
    e.target.value = sku;
    
    // 移除高亮动画
    e.target.classList.remove('focus-highlight');
    
    if (sku.length === 5 && /^[A-Z0-9]{5}$/.test(sku)) {
        await lookupProduct(sku);
        
        // 自动跳转到日期选择框
        setTimeout(() => {
            const dateInput = document.getElementById('productionDate');
            if (dateInput && !dateInput.disabled) {
                dateInput.focus();
                
                // 移动端兼容：只在支持的设备上调用 showPicker()
                if (dateInput.showPicker && isMobileDevice()) {
                    try {
                        dateInput.showPicker();
                    } catch (error) {
                        console.log('移动端日期选择器不支持自动弹出');
                        // 在移动端显示提示
                        showMobileDateHint();
                    }
                } else if (dateInput.showPicker) {
                    // PC端正常调用
                    dateInput.showPicker();
                }
                
                highlightElement(dateInput);
                
                // 如果是移动端，滚动到日期输入框可见
                if (isMobileDevice()) {
                    dateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }, 300);
    } else {
        clearProductFields();
    }
}

// 处理日期选择变化
function handleDateChange() {
    const productionDate = document.getElementById('productionDate').value;
    
    if (productionDate) {
        calculateDates();
        
        // 移除移动端提示（如果存在）
        const hint = document.querySelector('.mobile-hint');
        if (hint) {
            hint.remove();
        }
        
        // 自动跳转到保存按钮
        setTimeout(() => {
            const saveBtn = document.getElementById('saveBtn');
            if (saveBtn && !saveBtn.disabled) {
                saveBtn.focus();
                highlightElement(saveBtn);
                
                // 如果是移动端，滚动到保存按钮可见
                if (isMobileDevice()) {
                    saveBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }, 300);
    }
}

// 处理保存按钮点击
async function handleSave() {
    await saveProductRecord();
    
    // 保存完成后跳转回SKU输入框
    setTimeout(() => {
        const skuInput = document.getElementById('skuInput');
        if (skuInput) {
            skuInput.value = '';
            skuInput.focus();
            highlightElement(skuInput);
            
            // 如果是移动端，滚动到SKU输入框可见
            if (isMobileDevice()) {
                skuInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, 500);
}

// 高亮元素
function highlightElement(element) {
    element.classList.add('focus-highlight');
    setTimeout(() => {
        element.classList.remove('focus-highlight');
    }, 1000);
}

// 处理Enter键导航
function handleEnterNavigation(e) {
    // 移动端键盘处理
    if (isMobileDevice()) {
        return;
    }
    
    const activeElement = document.activeElement;
    
    if (activeElement.id === 'skuInput' && activeElement.value.length === 5) {
        e.preventDefault();
        const dateInput = document.getElementById('productionDate');
        if (dateInput && !dateInput.disabled) {
            dateInput.focus();
            if (dateInput.showPicker && !isMobileDevice()) {
                dateInput.showPicker();
            }
        }
    } else if (activeElement.id === 'productionDate') {
        e.preventDefault();
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn && !saveBtn.disabled) {
            saveBtn.focus();
        }
    } else if (activeElement.id === 'saveBtn') {
        e.preventDefault();
        saveBtn.click();
    }
}

// 检测是否为移动设备
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 添加移动端特定样式
function addMobileStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* 移动端优化样式 */
        .mobile-hint {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 9999;
            width: 90%;
            max-width: 400px;
            animation: slideUp 0.3s ease-out;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        
        @keyframes slideUp {
            from {
                transform: translateX(-50%) translateY(100%);
                opacity: 0;
            }
            to {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
        }
        
        /* 移动端输入框优化 */
        .sku-input-group input[type="date"] {
            font-size: 16px;
        }
        
        /* 移动端焦点优化 */
        .form-control:focus {
            border-color: var(--primary-color);
            box-shadow: 0 0 0 0.2rem rgba(67, 97, 238, 0.25);
        }
        
        /* 模态框移动端优化 */
        .modal-dialog {
            max-height: 80vh;
            margin: 10vh auto;
        }
        
        .modal-body {
            max-height: 60vh;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
        }
    `;
    document.head.appendChild(style);
}

// 显示移动端日期选择提示
function showMobileDateHint() {
    const hint = document.createElement('div');
    hint.className = 'alert alert-info mobile-hint';
    hint.innerHTML = `
        <i class="bi bi-calendar-check me-2"></i>
        <span>请点击上方日期输入框选择生产日期</span>
        <button type="button" class="btn-close" onclick="this.parentElement.remove()"></button>
    `;
    
    // 添加到页面
    const container = document.querySelector('#query-tab-pane .card-body');
    if (container) {
        // 移除已有的提示
        const existingHint = container.querySelector('.mobile-hint');
        if (existingHint) {
            existingHint.remove();
        }
        
        // 添加新提示
        container.appendChild(hint);
        
        // 5秒后自动移除
        setTimeout(() => {
            if (hint.parentNode) {
                hint.remove();
            }
        }, 5000);
    }
}

// 添加移动端触摸事件
function addTouchEvents() {
    // SKU输入完成后的提示
    const skuInput = document.getElementById('skuInput');
    skuInput.addEventListener('input', function() {
        if (this.value.length === 5) {
            // 显示触摸提示
            setTimeout(() => {
                if (this.value.length === 5) {
                    showMobileDateHint();
                }
            }, 500);
        }
    });
    
    // 日期输入框触摸优化
    const dateInput = document.getElementById('productionDate');
    dateInput.addEventListener('touchstart', function() {
        this.focus();
    });
    
    // 保存按钮触摸优化
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
        saveBtn.addEventListener('touchstart', function() {
            this.classList.add('active');
        });
        
        saveBtn.addEventListener('touchend', function() {
            this.classList.remove('active');
        });
    }
    
    // 防止模态框滚动锁定
    preventModalScrollLock();
}

// 防止模态框滚动锁定
function preventModalScrollLock() {
    const modalElement = document.getElementById('confirmModal');
    if (!modalElement) return;
    
    // 监听模态框显示事件
    modalElement.addEventListener('show.bs.modal', function() {
        // 确保页面状态正常
        cleanupPageLock();
    });
    
    // 监听模态框隐藏事件
    modalElement.addEventListener('hidden.bs.modal', function() {
        // 清理模态框背景
        setTimeout(cleanupModalBackdrop, 150);
    });
    
    // 监听触摸事件，防止背景滚动
    modalElement.addEventListener('touchmove', function(e) {
        // 如果内容可以滚动，允许滚动
        const modalBody = this.querySelector('.modal-body');
        if (modalBody && modalBody.scrollHeight > modalBody.clientHeight) {
            // 如果已经滚动到顶部或底部，阻止默认行为
            if (modalBody.scrollTop === 0 && e.touches[0].clientY > 0) {
                e.preventDefault();
            }
            if (modalBody.scrollTop + modalBody.clientHeight >= modalBody.scrollHeight && 
                e.touches[0].clientY < 0) {
                e.preventDefault();
            }
        } else {
            // 内容不能滚动，完全阻止
            e.preventDefault();
        }
    }, { passive: false });
}

// 清理模态框背景层（修复页面锁定）
function cleanupModalBackdrop() {
    // 移除所有模态框背景
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => {
        backdrop.remove();
    });
    
    // 恢复页面滚动
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    
    // 移除body上的内联样式
    document.body.removeAttribute('style');
}

// 显示SKU建议
function showSkuSuggestions() {
    const input = document.getElementById('skuInput');
    const suggestions = document.getElementById('sku-suggestions');
    const value = input.value.toLowerCase();
    
    if (value.length < 1) {
        suggestions.style.display = 'none';
        return;
    }
    
    const filtered = currentProducts.filter(p => 
        p.sku.toLowerCase().includes(value) || 
        p.name.toLowerCase().includes(value)
    ).slice(0, 5);
    
    if (filtered.length === 0) {
        suggestions.style.display = 'none';
        return;
    }
    
    suggestions.innerHTML = filtered.map(p => `
        <button type="button" class="list-group-item list-group-item-action" 
                onclick="selectSku('${p.sku}', '${escapeHtml(p.name)}')">
            <strong>${p.sku}</strong> - ${p.name}
        </button>
    `).join('');
    suggestions.style.display = 'block';
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

// 计算日期（使用中国时间）
function calculateDates() {
    const productionDate = document.getElementById('productionDate').value;
    const shelfLife = parseInt(document.getElementById('shelfLife').value) || 0;
    const reminderDays = parseInt(document.getElementById('reminderDays').value) || 0;
    
    if (!productionDate || shelfLife <= 0) {
        document.getElementById('saveBtn').disabled = true;
        return;
    }
    
    // 使用中国时间计算
    const prodDate = new Date(productionDate + 'T00:00:00+08:00'); // 中国时区
    const expiryDate = new Date(prodDate);
    expiryDate.setDate(prodDate.getDate() + shelfLife);
    
    const reminderDate = new Date(expiryDate);
    reminderDate.setDate(expiryDate.getDate() - reminderDays);
    
    // 获取当前中国时间
    const nowChina = getChinaDateTime();
    const remainingDays = Math.ceil((expiryDate - nowChina) / (1000 * 60 * 60 * 24));
    
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
        const modal = bootstrap.Modal.getInstance(document.getElementById('duplicateModal'));
        if (modal) {
            modal.hide();
        }
        cleanupModalBackdrop();
    }
}

// 取消重复添加
function cancelDuplicate() {
    duplicateCheckData = null;
    const modal = bootstrap.Modal.getInstance(document.getElementById('duplicateModal'));
    if (modal) {
        modal.hide();
    }
    cleanupModalBackdrop();
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
    const sku = document.getElementById('newSku').value.toUpperCase();
    const name = document.getElementById('newName').value.trim();
    const shelfLife = parseInt(document.getElementById('newShelfLife').value);
    const reminderDays = parseInt(document.getElementById('newReminderDays').value);
    const location = document.getElementById('newLocation').value.trim();
    
    // 验证输入
    if (!sku || !name || !shelfLife || isNaN(reminderDays) || !location) {
        showAlert('请填写所有必填字段', 'warning');
        return;
    }
    
    if (!/^[A-Z0-9]{5}$/.test(sku)) {
        showAlert('SKU必须是5位字母或数字组合', 'warning');
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

// 渲染临期商品表格（修复到期日期显示问题）
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
        // 修复：使用中国时间计算到期日期
        const productionDate = new Date(record.production_date + 'T00:00:00+08:00');
        const expiryDate = new Date(productionDate);
        expiryDate.setDate(productionDate.getDate() + record.shelf_life);
        
        const remainingDays = calculateRemainingDays(record.production_date, record.shelf_life);
        const status = getStatus(remainingDays, record.reminder_days);
        
        return `
            <tr class="${remainingDays <= 0 ? 'table-danger' : 'table-warning'}">
                <td><strong>${record.sku}</strong></td>
                <td style="word-break: break-word;">${record.name}</td>
                <td><span class="badge location-badge">${record.location}</span></td>
                <td>${formatDate(productionDate)}</td>
                <td>${formatDate(expiryDate)}</td>
                <td>
                    <span class="fw-bold ${remainingDays <= 0 ? 'text-danger' : 'text-warning'}">
                        ${remainingDays}
                    </span>
                </td>
                <td>${getStatusBadge(remainingDays, record.reminder_days)}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-danger" onclick="showDeleteConfirm(${record.id})">
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
        // 修复：使用中国时间计算到期日期
        const productionDate = new Date(record.production_date + 'T00:00:00+08:00');
        const expiryDate = new Date(productionDate);
        expiryDate.setDate(productionDate.getDate() + record.shelf_life);
        
        const remainingDays = calculateRemainingDays(record.production_date, record.shelf_life);
        const rowClass = remainingDays <= 0 ? 'table-danger' : 
                        remainingDays <= record.reminder_days ? 'table-warning' : '';
        
        return `
            <tr class="${rowClass}">
                <td><strong>${record.sku}</strong></td>
                <td style="word-break: break-word;">${record.name}</td>
                <td><span class="badge location-badge">${record.location}</span></td>
                <td>${formatDate(productionDate)}</td>
                <td>${formatDate(expiryDate)}</td>
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
                        <button class="btn btn-outline-danger" onclick="showDeleteConfirm(${record.id})">
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
                        <button class="btn btn-outline-danger" onclick="showDeleteConfirm(${product.id}, null, true)">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = html;
}

// 显示删除确认模态框（显示商品详情）
function showDeleteConfirm(id, recordData = null, isProduct = false) {
    // 清理之前的模态框状态
    cleanupModalBackdrop();
    
    deleteRecordId = id;
    
    // 如果是商品数据库删除，需要获取完整商品信息
    if (isProduct && !recordData) {
        // 从当前商品列表中查找
        const product = currentProducts.find(p => p.id === id);
        if (product) {
            recordData = product;
        }
    }
    
    // 如果是库存记录删除，需要获取完整记录信息
    if (!isProduct && !recordData) {
        // 从当前记录列表中查找
        const record = currentRecords.find(r => r.id === id);
        if (record) {
            recordData = record;
        }
    }
    
    let detailsHtml = '';
    
    if (isProduct) {
        // 商品数据库中的商品
        if (recordData) {
            detailsHtml = `
                <div class="delete-details">
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">SKU：</span>
                        <span class="delete-detail-value">${recordData.sku || ''}</span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">名称：</span>
                        <span class="delete-detail-value">${recordData.name || ''}</span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">库位：</span>
                        <span class="delete-detail-value"><span class="badge location-badge">${recordData.location || ''}</span></span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">保质期：</span>
                        <span class="delete-detail-value">${recordData.shelf_life || 0} 天</span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">提醒天数：</span>
                        <span class="delete-detail-value">${recordData.reminder_days || 0} 天</span>
                    </div>
                </div>
            `;
        }
    } else {
        // 库存记录中的商品
        if (recordData) {
            // 计算到期日期和剩余天数（使用中国时间）
            const productionDate = recordData.production_date ? 
                new Date(recordData.production_date + 'T00:00:00+08:00') : new Date();
            const expiryDate = new Date(productionDate);
            expiryDate.setDate(productionDate.getDate() + (recordData.shelf_life || 0));
            
            // const remainingDays = calculateRemainingDays(recordData.production_date, recordData.shelf_life);
            const remainingDays = recordData.remaining_days || calculateRemainingDays(recordData.production_date, recordData.shelf_life);
            const statusBadge = getStatusBadge(remainingDays, recordData.reminder_days);
            
            detailsHtml = `
                <div class="delete-details">
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">SKU：</span>
                        <span class="delete-detail-value">${recordData.sku || ''}</span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">名称：</span>
                        <span class="delete-detail-value">${recordData.name || ''}</span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">库位：</span>
                        <span class="delete-detail-value"><span class="badge location-badge">${recordData.location || ''}</span></span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">生产日期：</span>
                        <span class="delete-detail-value">${formatDate(productionDate)}</span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">到期日期：</span>
                        <span class="delete-detail-value">${formatDate(expiryDate)}</span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">剩余天数：</span>
                        <span class="delete-detail-value fw-bold ${remainingDays <= 0 ? 'text-danger' : 
                                                  remainingDays <= (recordData.reminder_days || 0) ? 'text-warning' : 
                                                  'text-success'}">
                            ${remainingDays} 天
                        </span>
                    </div>
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">状态：</span>
                        <span class="delete-detail-value">${statusBadge}</span>
                    </div>
                </div>
            `;
        } else {
            // 如果没有记录数据，显示基本信息
            detailsHtml = `
                <div class="delete-details">
                    <div class="delete-detail-item">
                        <span class="delete-detail-label">记录ID：</span>
                        <span class="delete-detail-value">${id}</span>
                    </div>
                </div>
            `;
        }
    }
    
    document.getElementById('modalBody').innerHTML = `
        <p>确定要删除以下${isProduct ? '商品' : '记录'}吗？此操作不可恢复。</p>
        ${detailsHtml}
        <p class="text-danger mb-0 mt-2">
            <small>
                <i class="bi bi-exclamation-triangle me-1"></i>
                ${isProduct ? '删除商品将同时删除所有相关记录！' : '删除后数据将无法恢复！'}
            </small>
        </p>
    `;
    
    // 确保页面可以滚动
    document.body.style.overflow = '';
    
    // 显示模态框
    const modalElement = document.getElementById('confirmModal');
    const modal = new bootstrap.Modal(modalElement, {
        backdrop: true,
        keyboard: true,
        focus: true
    });
    
    // 监听模态框隐藏事件
    modalElement.addEventListener('hidden.bs.modal', function() {
        cleanupModalBackdrop();
        deleteRecordId = null;
    });
    
    modal.show();
}

// 确认删除
async function confirmDelete() {
    if (!deleteRecordId) return;
    
    const modalElement = document.getElementById('confirmModal');
    const modal = bootstrap.Modal.getInstance(modalElement);
    const url = window.location.href.includes('product') ? 
                `/api/products/${deleteRecordId}` : 
                `/api/records/${deleteRecordId}`;
    
    showLoading();
    
    try {
        const response = await fetch(url, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // 先关闭模态框
            if (modal) {
                modal.hide();
            }
            
            // 清理模态框背景（修复页面锁定）
            cleanupModalBackdrop();
            
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
        // 关闭模态框
        if (modal) {
            modal.hide();
        }
        cleanupModalBackdrop();
        showAlert('删除失败', 'danger');
    } finally {
        hideLoading();
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
            if (modal) {
                modal.hide();
            }
            cleanupModalBackdrop();
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
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 计算剩余天数（使用中国时间）
function calculateRemainingDays(productionDate, shelfLife) {
    if (!productionDate || !shelfLife) return 0;
    
    const prodDate = new Date(productionDate + 'T00:00:00+08:00');
    const expiryDate = new Date(prodDate);
    expiryDate.setDate(prodDate.getDate() + shelfLife);
    
    const nowChina = getChinaDateTime();
    const diffTime = expiryDate - nowChina;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// 获取当前中国日期时间
function getChinaDateTime() {
    const now = new Date();
    // 转换为中国时区时间（UTC+8）
    const chinaTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    return chinaTime;
}

// 获取当前中国日期（YYYY-MM-DD格式）
function getChinaDate() {
    const chinaTime = getChinaDateTime();
    return formatDate(chinaTime);
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
        if (bsModal) {
            bsModal.hide();
        }
    });
    
    // 清理背景层
    setTimeout(cleanupModalBackdrop, 150);
}

function showAlert(message, type = 'info') {
    const container = document.getElementById('globalAlertContainer');
    
    // 移除旧的提示
    const oldAlerts = container.querySelectorAll('.alert');
    if (oldAlerts.length > 3) {
        oldAlerts[0].remove();
    }
    
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
