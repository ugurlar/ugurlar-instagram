// Ugurlar Admin Dashboard Logic

const authToken = localStorage.getItem('ugurlar_token');

if (!authToken) {
    window.location.href = '/';
}

// UI Elements
const mismatchBody = document.getElementById('mismatchBody');
const logBody = document.getElementById('logBody');
const btnSyncHamur = document.getElementById('btnSyncHamur');
const btnRefreshData = document.getElementById('btnRefreshData');
const btnSaveOverride = document.getElementById('btnSaveOverride');
const btnInspect = document.getElementById('btnInspect');
const inspectCodeInput = document.getElementById('inspectCode');
const inspectorResult = document.getElementById('inspectorResult');
const auditBody = document.getElementById('auditBody');
const btnStartAudit = document.getElementById('btnStartAudit');
const btnStopAudit = document.getElementById('btnStopAudit');
const btnExportCSV = document.getElementById('btnExportCSV');
const btnFilterMismatches = document.getElementById('btnFilterMismatches');
const progressWrapper = document.getElementById('progressWrapper');
const progressBarFill = document.getElementById('progressBarFill');
const progressStats = document.getElementById('progressStats');
const lastSyncTime = document.getElementById('lastSyncTime');
const lastSyncCount = document.getElementById('lastSyncCount');

// Auth Fetch Wrapper
async function adminFetch(url, options = {}) {
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
    };
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        localStorage.removeItem('ugurlar_token');
        window.location.href = '/';
    }
    return response;
}

// Load Data (Diagnostics)
async function loadDiagnostics() {
    try {
        const resp = await adminFetch('/api/admin/diagnostics');
        const data = await resp.json();

        // Render Mismatches
        const mismatches = data.mismatches || [];
        mismatchBody.innerHTML = mismatches.map(m => `
            <tr>
                <td style="font-weight:700; color:var(--primary);">${m.hamur_code}</td>
                <td style="color:var(--error);">${m.reason}</td>
                <td style="color:var(--text-muted);">${new Date(m.timestamp).toLocaleString()}</td>
                <td>
                    <button class="btn btn-secondary" style="padding:4px 8px; font-size:10px;" onclick="prepareOverride('${m.hamur_code}')">Eşle</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center;">Mükemmel! Hata kaydı yok.</td></tr>';

        // Render Logs
        const logs = data.logs || [];
        logBody.innerHTML = logs.map(l => `
            <tr>
                <td><span class="status-dot status-${l.severity === 'error' ? 'error' : 'success'}"></span> ${l.severity.toUpperCase()}</td>
                <td>${l.message}</td>
                <td><pre>${JSON.stringify(l.context || {})}</pre></td>
                <td style="color:var(--text-muted);">${new Date(l.timestamp).toLocaleString()}</td>
            </tr>
        `).join('') || '<tr><td colspan="4" style="text-align:center;">Günlük temiz.</td></tr>';

    } catch (err) {
        console.error('Diagnostic error:', err);
    }
    updateSyncStatus();
}

async function updateSyncStatus() {
    try {
        const resp = await adminFetch('/api/admin/sync-status');
        const data = await resp.json();

        if (data.status === 'running') {
            lastSyncTime.textContent = '⏳ Devam Ediyor...';
            lastSyncTime.style.color = 'var(--warning)';
            lastSyncCount.textContent = 'Ürünler Hamurlabs\'tan çekiliyor...';
            btnSyncHamur.disabled = true;
        } else {
            const dateStr = data.timestamp === 'Henüz yapılmadı' ? data.timestamp : new Date(data.timestamp).toLocaleString();
            lastSyncTime.textContent = dateStr;
            lastSyncTime.style.color = data.status === 'failed' ? 'var(--error)' : 'var(--primary)';
            lastSyncCount.textContent = data.count > 0 ? `${data.count} ürün başarıyla işlendi.` : '-';
            btnSyncHamur.disabled = false;
        }

        // Poll if running
        if (data.status === 'running') {
            setTimeout(updateSyncStatus, 5000);
        }
    } catch (e) { console.error(e); }
}

function prepareOverride(code) {
    document.getElementById('mapHamurCode').value = code;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event Handlers
btnRefreshData.addEventListener('click', loadDiagnostics);

btnSyncHamur.addEventListener('click', async () => {
    if (!confirm('Tüm ürünlerin senkronizasyonunu (Full Sync) arka planda başlatmak istiyor musunuz? Bu işlem yaklaşık 1 saat sürebilir.')) return;
    btnSyncHamur.disabled = true;
    try {
        const resp = await adminFetch('/api/admin/trigger-sync', { method: 'POST' });
        const data = await resp.json();
        showToast(data.message || 'Senkronizasyon başlatıldı.', 'info');
        updateSyncStatus();
    } catch (err) {
        showToast('Hata: ' + err.message, 'error');
        btnSyncHamur.disabled = false;
    }
});

btnSaveOverride.addEventListener('click', async () => {
    const hamur_code = document.getElementById('mapHamurCode').value.trim();
    const shopify_handle = document.getElementById('mapShopifyHandle').value.trim();
    if (!hamur_code || !shopify_handle) return showToast('Eksik alan var', 'warning');

    try {
        const resp = await adminFetch('/api/admin/match-override', {
            method: 'POST',
            body: JSON.stringify({ hamur_code, shopify_handle })
        });
        if (resp.ok) {
            showToast('Eşleştirme kaydedildi!', 'success');
            loadDiagnostics();
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
});

btnInspect.addEventListener('click', () => {
    const code = inspectCodeInput.value.trim();
    if (code) inspectProduct(code);
});

async function inspectProduct(code) {
    inspectorResult.style.display = 'block';
    inspectorResult.innerHTML = '<div style="text-align:center; padding:1rem;">📡 Sorgulanıyor...</div>';
    try {
        const hamurResp = await adminFetch(`/api/products/search?code=${encodeURIComponent(code)}`);
        const hamurData = await hamurResp.json();
        const hamurProduct = (hamurData.data || []).find(p => p.code === code) || (hamurData.data || [])[0];

        const shopifyResp = await adminFetch(`/api/shopify-product?code=${encodeURIComponent(code)}`);
        const shopifyData = await shopifyResp.json();

        if (!hamurProduct) {
            inspectorResult.innerHTML = `<div style="color:var(--error); padding:1rem;">❌ Hamurlabs'te bulunamadı.</div>`;
            return;
        }

        const variants = mergeVariants(hamurProduct, shopifyData);
        renderInspectorTable(code, hamurProduct, shopifyData, variants);
    } catch (err) {
        inspectorResult.innerHTML = 'Hata: ' + err.message;
    }
}

function mergeVariants(hamur, shopify) {
    const map = new Map();
    (hamur.metas || []).forEach(v => {
        const size = v.value || v.size || '?';
        map.set(size, { size, hamurStock: parseInt(v.quantity) || 0, shopifyStock: 0, status: 'missing_in_shopify' });
    });
    if (shopify.found && shopify.variants) {
        shopify.variants.forEach(sv => {
            const size = sv.options.Size || sv.options.Beden || sv.options.Option1 || '?';
            const existing = map.get(size);
            if (existing) {
                existing.shopifyStock = parseInt(sv.inventory) || 0;
                existing.status = existing.hamurStock === existing.shopifyStock ? 'match' : 'mismatch';
            } else {
                map.set(size, { size, hamurStock: 0, shopifyStock: parseInt(sv.inventory) || 0, status: 'missing_in_hamurlabs' });
            }
        });
    }
    return Array.from(map.values());
}

function renderInspectorTable(code, hamur, shopify, variants) {
    const shopifyStatus = shopify.found ? `<span style="color:var(--success)">✅ Bağlı</span>` : `<span style="color:var(--error)">❌ Bağlı Değil</span>`;
    let html = `<div style="margin-top:1rem; border-top:1px solid var(--border); padding-top:1rem;">
        <div style="font-size:0.8rem; margin-bottom:0.5rem;">${hamur.name} | ${shopifyStatus}</div>
        <table><thead><tr><th>Beden</th><th style="text-align:center;">H.labs</th><th style="text-align:center;">Shopify</th><th>Durum</th></tr></thead><tbody>`;
    variants.forEach(v => {
        const st = v.status === 'match' ? '✅' : (v.status === 'mismatch' ? '⚠️' : '❓');
        html += `<tr><td>${v.size}</td><td style="text-align:center;">${v.hamurStock}</td><td style="text-align:center;">${v.shopifyStock}</td><td>${st}</td></tr>`;
    });
    html += `</tbody></table></div>`;
    inspectorResult.innerHTML = html;
}

// --- GLOBAL AUDIT LOGIC ---
let fullAuditData = [];
let onlyMismatches = false;
let isAuditRunning = false;
let stopAuditRequested = false;
let totalToScan = 0;
let scannedCount = 0;
let mismatchCount = 0;

btnStartAudit.addEventListener('click', runFullCatalogAudit);
btnStopAudit.addEventListener('click', () => {
    stopAuditRequested = true;
    btnStopAudit.textContent = '🛑 Durduruluyor...';
    btnStopAudit.disabled = true;
});
btnFilterMismatches.addEventListener('click', toggleAuditFilter);
if (btnExportCSV) btnExportCSV.addEventListener('click', downloadAuditCSV);

async function runFullCatalogAudit() {
    if (isAuditRunning) return;

    // Reset State
    isAuditRunning = true;
    stopAuditRequested = false;
    fullAuditData = [];
    scannedCount = 0;
    mismatchCount = 0;

    // UI Setup
    btnStartAudit.disabled = true;
    btnStartAudit.textContent = '⌛ Tarama Başladı...';
    btnStopAudit.style.display = 'inline-block';
    btnStopAudit.textContent = '🛑 Durdur';
    btnStopAudit.disabled = false;

    progressWrapper.style.display = 'block';
    progressBarFill.style.width = '0%';
    progressStats.textContent = 'Hazırlanıyor...';

    auditBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">📡 Katalog taranıyor...</td></tr>';

    try {
        await processAuditBatch(0);
    } catch (err) {
        showToast('Audit Hatası: ' + err.message, 'error');
    } finally {
        isAuditRunning = false;
        btnStartAudit.disabled = false;
        btnStartAudit.textContent = 'Raporu Yeniden Başlat';
        btnStopAudit.style.display = 'none';

        if (stopAuditRequested) {
            showToast('Tarama durduruldu.', 'info');
        } else {
            showToast('Tüm katalog taraması tamamlandı!', 'success');
            progressStats.textContent = `Tamamlandı: ${scannedCount} / ${totalToScan} | Toplam Hata: ${mismatchCount}`;
        }
    }
}

async function processAuditBatch(offset) {
    if (stopAuditRequested) return;

    const limit = 100;
    let products = [];
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
        try {
            const resp = await adminFetch(`/api/products?limit=${limit}&offset=${offset}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const result = await resp.json();
            products = result.data || [];
            totalToScan = result.total_count || totalToScan;
            break; // Success
        } catch (err) {
            retryCount++;
            console.error(`Batch fetch failed (Attempt ${retryCount}):`, err);
            if (retryCount >= maxRetries) throw err;
            await new Promise(r => setTimeout(r, 2000 * retryCount)); // Exponential backoff
        }
    }

    if (offset === 0) auditBody.innerHTML = '';

    for (let i = 0; i < products.length; i++) {
        if (stopAuditRequested) break;

        const p = products[i];
        scannedCount++;

        try {
            const sResp = await fetch(`/api/shopify-product?code=${encodeURIComponent(p.code)}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const sData = await sResp.json();
            const auditResult = calculateAuditScore(p, sData);

            if (auditResult.status !== 'match') {
                mismatchCount++;
                const rowId = `audit-row-${p.code.replace(/[^a-zA-Z0-9]/g, '-')}`;
                renderAuditRow(rowId, auditResult);
                fullAuditData.push(auditResult);
            }

            const percent = Math.round((scannedCount / totalToScan) * 100);
            progressBarFill.style.width = `${percent}%`;
            progressStats.textContent = `Taranan: ${scannedCount} / ${totalToScan} | Hata: ${mismatchCount}`;

            if (i % 3 === 0) await new Promise(r => setTimeout(r, 50));
        } catch (e) { console.error(e); }
    }

    if (!stopAuditRequested && scannedCount < totalToScan && products.length > 0) {
        await processAuditBatch(offset + limit);
    }
}

function calculateAuditScore(hamur, shopify) {
    const hamurStock = (hamur.metas || []).reduce((sum, v) => sum + (Math.round(Number(v.quantity)) || 0), 0);
    const shopifyStock = shopify.found ? (shopify.variants || []).reduce((sum, v) => sum + (Math.round(Number(v.inventory)) || 0), 0) : 0;
    let status = 'match';
    if (!shopify.found) status = 'not_mapped';
    else if (Math.abs(hamurStock - shopifyStock) > 0.01) status = 'mismatch';
    return { code: hamur.code, name: hamur.name, hamurStock, shopifyStock, status, shopifyFound: shopify.found };
}

function renderAuditRow(rowId, result) {
    const row = document.getElementById(rowId);
    if (!row) return;

    // Set status as data attribute for easy filtering
    row.setAttribute('data-status', result.status);

    const color = result.status === 'match' ? '#22c55e' : (result.status === 'mismatch' ? '#f59e0b' : '#ef4444');
    const label = result.status === 'match' ? '✅ Eşleşiyor' : (result.status === 'mismatch' ? '⚠️ Farklı' : '❓ Yok');

    row.innerHTML = `
        <td style="font-weight:700;">${result.code}</td>
        <td>${result.name}</td>
        <td style="text-align:center; font-weight:600;">${result.hamurStock}</td>
        <td style="text-align:center; font-weight:600;">${result.shopifyFound ? result.shopifyStock : '-'}</td>
        <td style="text-align:center;"><span style="color:${color}; font-size:0.75rem; font-weight:700;">${label}</span></td>
    `;

    if (result.status !== 'match') {
        row.style.cursor = 'pointer';
        row.onclick = () => {
            inspectCodeInput.value = result.code;
            inspectProduct(result.code);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };
    }
}

function downloadAuditCSV() {
    if (fullAuditData.length === 0) {
        return showToast('Önce raporu başlatın', 'warning');
    }

    // Use semicolon (;) for better compatibility with Excel in certain regions (like Turkey)
    // and include UTF-8 BOM for Turkish character support
    let csvContent = "\ufeffÜrün Kodu;Ürün Adı;Hamurlabs Stok;Shopify Stok;Durum\n";
    fullAuditData.forEach(r => {
        const st = { 'match': 'Eşleşiyor', 'mismatch': 'Farklı', 'not_mapped': 'Yok' };
        const row = [
            r.code,
            `"${r.name.replace(/"/g, '""')}"`,
            r.hamurStock,
            r.shopifyFound ? r.shopifyStock : 0,
            st[r.status] || r.status
        ].join(";");
        csvContent += row + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `ugurlar_stok_raporu_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function toggleAuditFilter() {
    onlyMismatches = !onlyMismatches;
    btnFilterMismatches.textContent = onlyMismatches ? 'Tümünü Göster' : 'Sadece Hataları Göster';

    const rows = auditBody.querySelectorAll('tr');
    rows.forEach(row => {
        const status = row.getAttribute('data-status');
        if (onlyMismatches && status === 'match') {
            row.style.display = 'none';
        } else {
            row.style.display = '';
        }
    });
}

function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.style.background = type === 'success' ? 'var(--success)' : (type === 'error' ? 'var(--error)' : 'var(--primary)');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

loadDiagnostics();
setInterval(loadDiagnostics, 60000);
