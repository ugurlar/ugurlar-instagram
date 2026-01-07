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
const btnFilterMismatches = document.getElementById('btnFilterMismatches');

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
}

function prepareOverride(code) {
    document.getElementById('mapHamurCode').value = code;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event Handlers
btnRefreshData.addEventListener('click', loadDiagnostics);

btnSyncHamur.addEventListener('click', async () => {
    if (!confirm('Tüm ürünlerin senkronizasyonunu tetiklemek istiyor musunuz?')) return;
    btnSyncHamur.disabled = true;
    try {
        const resp = await adminFetch('/api/cron');
        const data = await resp.json();
        showToast(`Başarılı! ${data.count || 0} ürün güncellendi.`, 'success');
    } catch (err) {
        showToast('Hata: ' + err.message, 'error');
    } finally {
        btnSyncHamur.disabled = false;
        loadDiagnostics();
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

btnStartAudit.addEventListener('click', runGlobalAudit);
btnFilterMismatches.addEventListener('click', toggleAuditFilter);

async function runGlobalAudit() {
    btnStartAudit.disabled = true;
    btnStartAudit.textContent = '⌛ Tarama Başladı...';
    auditBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">📡 Ürünler alınıyor...</td></tr>';
    try {
        const resp = await adminFetch('/api/products/search?code=');
        const data = await resp.json();
        const products = data.data || [];
        if (products.length === 0) {
            auditBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Ürün yok.</td></tr>';
            return;
        }
        fullAuditData = [];
        auditBody.innerHTML = '';
        for (let i = 0; i < products.length; i++) {
            const p = products[i];
            const rowId = `audit-row-${p.code.replace(/[^a-zA-Z0-9]/g, '-')}`;
            auditBody.insertAdjacentHTML('beforeend', `<tr id="${rowId}"><td><strong>${p.code}</strong></td><td class="text-muted">${p.name.substring(0, 20)}...</td><td colspan="3" style="text-align:center;">⌛...</td></tr>`);
            try {
                const sResp = await fetch(`/api/shopify-product?code=${encodeURIComponent(p.code)}`, { headers: { 'Authorization': `Bearer ${authToken}` } });
                const sData = await sResp.json();
                const result = calculateAuditScore(p, sData);
                fullAuditData.push(result);
                updateAuditRow(rowId, result);
                if (i % 5 === 0) await new Promise(r => setTimeout(r, 200));
            } catch (e) { console.error(e); }
        }
    } catch (err) { showToast(err.message, 'error'); }
    finally { btnStartAudit.disabled = false; btnStartAudit.textContent = 'Raporu Başlat'; }
}

function calculateAuditScore(hamur, shopify) {
    const hamurStock = (hamur.metas || []).reduce((sum, v) => sum + (parseInt(v.quantity) || 0), 0);
    const shopifyStock = shopify.found ? (shopify.variants || []).reduce((sum, v) => sum + (parseInt(v.inventory) || 0), 0) : 0;
    let status = 'match';
    if (!shopify.found) status = 'not_mapped';
    else if (hamurStock !== shopifyStock) status = 'mismatch';
    return { code: hamur.code, name: hamur.name, hamurStock, shopifyStock, status, shopifyFound: shopify.found };
}

function updateAuditRow(rowId, result) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const color = result.status === 'match' ? '#22c55e' : (result.status === 'mismatch' ? '#f59e0b' : '#ef4444');
    const label = result.status === 'match' ? '✅ Eşleşiyor' : (result.status === 'mismatch' ? '⚠️ Farklı' : '❓ Yok');
    row.innerHTML = `<td style="font-weight:700;">${result.code}</td><td>${result.name}</td><td style="text-align:center;">${result.hamurStock}</td><td style="text-align:center;">${result.shopifyFound ? result.shopifyStock : '-'}</td><td style="text-align:center;"><span style="color:${color}; font-size:0.75rem;">${label}</span></td>`;
    if (result.status !== 'match') {
        row.style.cursor = 'pointer';
        row.onclick = () => { inspectCodeInput.value = result.code; inspectProduct(result.code); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    }
}

function toggleAuditFilter() {
    onlyMismatches = !onlyMismatches;
    btnFilterMismatches.textContent = onlyMismatches ? 'Tümünü Göster' : 'Sadece Hataları Göster';
    const rows = auditBody.querySelectorAll('tr');
    rows.forEach((row, index) => {
        const data = fullAuditData[index];
        if (data && onlyMismatches && data.status === 'match') row.style.display = 'none';
        else row.style.display = '';
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
