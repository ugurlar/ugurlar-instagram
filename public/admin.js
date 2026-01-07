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

// Load Data
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
        showToast('Veriler alınamadı: ' + err.message, 'error');
    }
}

function prepareOverride(code) {
    document.getElementById('mapHamurCode').value = code;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Event Handlers
btnRefreshData.addEventListener('click', loadDiagnostics);

btnSyncHamur.addEventListener('click', async () => {
    if (!confirm('Tüm ürünlerin senkronizasyonunu tetiklemek istiyor musunuz? (Bu işlem birkaç dakika sürebilir)')) return;

    btnSyncHamur.disabled = true;
    btnSyncHamur.textContent = '⌛ Senkronize ediliyor...';

    try {
        const resp = await adminFetch('/api/cron'); // Trigger standard sync
        const data = await resp.json();
        showToast(`Başarılı! ${data.count || 0} ürün güncellendi.`, 'success');
    } catch (err) {
        showToast('Hata: ' + err.message, 'error');
    } finally {
        btnSyncHamur.disabled = false;
        btnSyncHamur.textContent = '🔄 Hamurlabs Senkronizasyonu Tetikle';
        loadDiagnostics();
    }
});

btnSaveOverride.addEventListener('click', async () => {
    const hamur_code = document.getElementById('mapHamurCode').value.trim();
    const shopify_handle = document.getElementById('mapShopifyHandle').value.trim();

    if (!hamur_code || !shopify_handle) {
        showToast('Tüm alanları doldurun', 'warning');
        return;
    }

    try {
        const resp = await adminFetch('/api/admin/match-override', {
            method: 'POST',
            body: JSON.stringify({ hamur_code, shopify_handle })
        });
        if (resp.ok) {
            showToast('Eşleştirme kaydedildi!', 'success');
            document.getElementById('mapHamurCode').value = '';
            document.getElementById('mapShopifyHandle').value = '';
            loadDiagnostics();
        } else {
            throw new Error('Kaydedilemedi');
        }
    } catch (err) {
        showToast(err.message, 'error');
    }
});

btnInspect.addEventListener('click', () => {
    const code = inspectCodeInput.value.trim();
    if (code) inspectProduct(code);
});

inspectCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const code = inspectCodeInput.value.trim();
        if (code) inspectProduct(code);
    }
});

async function inspectProduct(code) {
    inspectorResult.style.display = 'block';
    inspectorResult.innerHTML = '<div style="text-align:center; padding:1rem;">📡 Veriler sorgulanıyor...</div>';

    try {
        // 1. Fetch Hamurlabs (via Search API which hits Supabase)
        const hamurResp = await adminFetch(`/api/products/search?code=${encodeURIComponent(code)}`);
        const hamurData = await hamurResp.json();
        const hamurProduct = (hamurData.data || []).find(p => p.code === code) || (hamurData.data || [])[0];

        // 2. Fetch Shopify
        const shopifyResp = await adminFetch(`/api/shopify-product?code=${encodeURIComponent(code)}`);
        const shopifyData = await shopifyResp.json();

        if (!hamurProduct) {
            inspectorResult.innerHTML = `<div style="color:var(--error); padding:1rem;">❌ Hamurlabs'te "${code}" kodu bulunamadı.</div>`;
            return;
        }

        const variants = mergeVariants(hamurProduct, shopifyData);
        renderInspectorTable(code, hamurProduct, shopifyData, variants);

    } catch (err) {
        inspectorResult.innerHTML = `<div style="color:var(--error); padding:1rem;">Hata: ${err.message}</div>`;
    }
}

function mergeVariants(hamur, shopify) {
    const map = new Map();

    // Process Hamurlabs
    (hamur.metas || []).forEach(v => {
        const size = v.value || v.size || '?';
        map.set(size, { size, hamurStock: parseInt(v.quantity) || 0, shopifyStock: 0, status: 'missing_in_shopify' });
    });

    // Process Shopify
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
    const shopifyStatus = shopify.found ? `<span style="color:var(--success)">✅ Bağlı: ${shopify.handle}</span>` : `<span style="color:var(--error)">❌ Bağlı Değil</span>`;

    let html = `
        <div style="margin-top:1rem; border-top:1px solid var(--border); padding-top:1rem;">
            <div style="display:flex; justify-content:space-between; margin-bottom:1rem; font-size:0.9rem;">
                <span><strong>Hamurlabs:</strong> ${hamur.name}</span>
                <span><strong>Shopify:</strong> ${shopifyStatus}</span>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Beden</th>
                        <th style="text-align:center;">Hamurlabs</th>
                        <th style="text-align:center;">Shopify</th>
                        <th>Durum</th>
                    </tr>
                </thead>
                <tbody>
    `;

    variants.forEach(v => {
        let statusHtml = '';
        if (v.status === 'match') statusHtml = '<span style="color:var(--success)">✅ Tamam</span>';
        else if (v.status === 'mismatch') statusHtml = '<span style="color:var(--warning)">⚠️ Farklı</span>';
        else if (v.status === 'missing_in_shopify') statusHtml = '<span style="color:var(--error)">❓ Shopify\'da Yok</span>';
        else statusHtml = '<span style="color:var(--text-muted)">❓ Panelde Yok</span>';

        html += `
            <tr>
                <td><strong>${v.size}</strong></td>
                <td style="text-align:center; font-weight:600;">${v.hamurStock}</td>
                <td style="text-align:center; font-weight:600;">${v.shopifyStock}</td>
                <td style="font-size:0.75rem;">${statusHtml}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
            ${!shopify.found ? `
                <div style="margin-top:1rem;">
                    <button class="btn btn-secondary" style="width:100%; font-size:0.8rem;" onclick="prepareOverride('${code}')">🔗 Bu Ürünü Manuel Eşle</button>
                </div>
            ` : ''}
        </div>
    `;

    inspectorResult.innerHTML = html;
}

// Toast Helper
function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.background = type === 'success' ? 'var(--success)' : (type === 'error' ? 'var(--error)' : 'var(--primary)');
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

// Initial Load
loadDiagnostics();
setInterval(loadDiagnostics, 30000); // Auto refresh every 30s
