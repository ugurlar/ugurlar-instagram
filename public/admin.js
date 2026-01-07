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
