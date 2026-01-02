// ===================================
// HAMURLABS PRODUCT PANEL - APP.JS
// ===================================

// DOM Elements
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const errorText = document.getElementById('errorText');
const resultsSection = document.getElementById('results');
const productList = document.getElementById('productList');
const resultCount = document.getElementById('resultCount');
const emptyState = document.getElementById('emptyState');

// API Base URL
const API_BASE = '';

// Event Listeners
searchForm.addEventListener('submit', handleSearch);

// Search Handler
async function handleSearch(e) {
  e.preventDefault();
  const query = searchInput.value.trim();

  if (!query) {
    showError('Lütfen ürün kodu veya barkod girin');
    return;
  }

  showLoading();

  try {
    const products = await searchProducts(query);

    if (products && products.length > 0) {
      // Fetch stock info for products
      const stockData = await fetchStock();
      displayProducts(products, stockData);
    } else {
      showNoResults();
    }
  } catch (error) {
    console.error('Search error:', error);
    showError(error.message || 'Arama sırasında bir hata oluştu');
  }
}

// API Functions
async function searchProducts(query) {
  // Yeni Backend Cache sistemi uzerinden arama yapiyoruz
  // Backend artik RAM'deki veriyi filtreleyip hizlica sunuyor
  const response = await fetch(`${API_BASE}/api/products/search?code=${encodeURIComponent(query)}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API hatası');
  }

  const data = await response.json();
  // Backend { total_count: ..., data: [...], from_cache: true } donuyor
  return data.data || data.results || [];
}

async function fetchStock() {
  try {
    const response = await fetch(`${API_BASE}/api/stock`);
    if (!response.ok) return {};
    const data = await response.json();
    return data.results || data;
  } catch {
    return {};
  }
}

// Display Functions
function displayProducts(products, stockData) {
  hideAll();

  const productArray = Array.isArray(products) ? products : [products];
  resultCount.textContent = `${productArray.length} ürün bulundu`;

  productList.innerHTML = productArray.map(product => createProductCard(product, stockData)).join('');

  resultsSection.classList.remove('hidden');
}

function createProductCard(product, stockData) {
  const variants = product.variants || [];
  const stockInfo = getStockInfo(product, stockData);

  // API Verify mapping
  const brand = product.brand || product.options?.Marka || '-';
  const color = product.options?.['Ana Renk'] || product.color || '-';
  const category = (product.categories && product.categories[0]) || product.options?.['Ürün Grubu'] || '-';
  const price = product.selling_price ? `${product.selling_price} TL` : '-';
  const season = product.options?.['Sezon/Yil'] || '-';

  // Stok ve Beden Bilgisi (metas'dan veya stockData'dan)
  // Eger metas varsa onlari kullan, yoksa varies yap
  const metaVariants = product.metas || [];

  return `
    <article class="product-card">
      <div class="product-header">
        <div>
            <h3 class="product-title">${escapeHtml(product.name || product.title || 'İsimsiz Ürün')}</h3>
            <span class="product-code">${escapeHtml(product.code || product.sku || '-')}</span>
        </div>
        <div class="product-price">${price}</div>
      </div>
      
      <div class="product-body">
        <div class="product-info-grid">
          <div class="info-item">
            <div class="info-label">Marka</div>
            <div class="info-value">${escapeHtml(brand)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Renk</div>
            <div class="info-value">${escapeHtml(color)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Kategori</div>
            <div class="info-value">${escapeHtml(category)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Sezon</div>
            <div class="info-value">${escapeHtml(season)}</div>
          </div>
        </div>
        
        ${createStockTable(metaVariants, stockInfo)}

        <div class="action-buttons" style="margin-top: 15px; display: flex; gap: 10px;">
            <button onclick="copyProductInfo('${escapeHtml(product.name)}', '${escapeHtml(product.code)}', '${price}', '${escapeHtml(color)}', '${escapeHtml(brand)}')" class="copy-btn" style="flex: 1; padding: 10px; background: #eee; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">
                📋 Bilgi Metni Kopyala
            </button>
            <button onclick="generateAIText('${escapeHtml(product.name)}', '${escapeHtml(brand)}', '${escapeHtml(color)}', '${price}', '${escapeHtml(category)}', '${stockInfo.quantity > 0 ? 'Stokta Var' : 'Tükendi'}')" class="ai-btn" style="flex: 1; padding: 10px; background: linear-gradient(135deg, #6366f1, #a855f7); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 5px;">
                ✨ AI ile Satış Metni Yaz
            </button>
        </div>
      </div>
    </article>
  `;
}

// Global scope AI function
window.generateAIText = async function (name, brand, color, price, category, stockStatus) {
  // Show AI loading modal (basit bir prompt/alert yerine custom div daha iyi olur ama hizlica alert/prompt ile baslayalim, sonra gelistiririz)
  // Ancak kullanici deneyimi icin bir overlay olusturalim.

  const loadingId = 'ai-loading-' + Date.now();
  const overlay = document.createElement('div');
  overlay.id = loadingId;
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; justify-content: center; align-items: center; flex-direction: column; color: white;';
  overlay.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 20px;">✨</div>
        <h3>Yapay Zeka Metni Hazırlıyor...</h3>
        <p>Ürün bilgileri analiz ediliyor ve satış metni oluşturuluyor.</p>
    `;
  document.body.appendChild(overlay);

  try {
    const response = await fetch(`${API_BASE}/api/generate-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product: { name, brand, color, price, category, stockStatus }
      })
    });

    const data = await response.json();

    // Remove loading
    document.body.removeChild(overlay);

    if (!response.ok) throw new Error(data.error || 'AI hatası');

    // Show result in a nice modal
    showAIResult(data.text);

  } catch (error) {
    if (document.getElementById(loadingId)) document.body.removeChild(document.getElementById(loadingId));
    alert('Hata: ' + error.message);
  }
}

function showAIResult(text) {
  const modalId = 'ai-result-modal';
  // Remove if exists
  const existing = document.getElementById(modalId);
  if (existing) document.body.removeChild(existing);

  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; justify-content: center; align-items: center;';

  modal.innerHTML = `
        <div style="background: #1e1e1e; padding: 25px; border-radius: 12px; width: 90%; max-width: 500px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #333;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #fff; display: flex; align-items: center; gap: 10px;">✨ AI Satış Metni</h3>
                <button onclick="document.body.removeChild(document.getElementById('${modalId}'))" style="background: none; border: none; color: #aaa; cursor: pointer; font-size: 20px;">✕</button>
            </div>
            <textarea id="ai-text-area" style="width: 100%; height: 200px; background: #2d2d2d; color: #eee; border: 1px solid #444; border-radius: 8px; padding: 10px; font-family: inherit; margin-bottom: 15px; resize: vertical;">${text}</textarea>
            <div style="display: flex; gap: 10px;">
                <button onclick="navigator.clipboard.writeText(document.getElementById('ai-text-area').value).then(() => alert('Metin kopyalandı!'))" style="flex: 1; padding: 12px; background: #6366f1; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">
                    Kopyala
                </button>
                <button onclick="document.body.removeChild(document.getElementById('${modalId}'))" style="padding: 12px 20px; background: #333; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Kapat
                </button>
            </div>
        </div>
    `;

  document.body.appendChild(modal);
}

function createStockTable(variants, stockInfo) {
  // Eger variants (metas) varsa onlari goster
  if (variants && variants.length > 0) {
    return `
    <div class="stock-section">
      <h4 class="stock-title">Beden & Stok Bilgisi</h4>
      <table class="stock-table">
        <thead>
          <tr>
            <th>Beden</th>
            <th>Barkod</th>
            <th>Stok</th>
          </tr>
        </thead>
        <tbody>
          ${variants.map(v => `
            <tr>
              <td>${escapeHtml(v.name || v.value || v.size || '-')}</td>
              <td>${escapeHtml(v.barcode || '-')}</td>
              <td class="${(v.quantity || 0) > 0 ? 'text-green' : 'text-red'}">
                ${v.quantity !== undefined ? v.quantity : '-'} 
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  }

  // Eski yontem (stockInfo'dan)
  if (stockInfo && Object.keys(stockInfo).length > 0) {
    // ... (Eski kod buradaydi ama metas varken buna gerek kalmayabilir)
    return '';
  }

  return '<div class="no-stock-info">Detaylı stok bilgisi yok</div>';
}

// Global scope'a kopyalama fonksiyonunu ekle
window.copyProductInfo = function (name, code, price, color, brand) {
  const text = `Merhaba,\n\nİlgilendiğiniz ürün bilgileri aşağıdadır:\n\nÜrün: ${name}\nKod: ${code}\nMarka: ${brand}\nRenk: ${color}\nFiyat: ${price}\n\nSipariş oluşturmak ister misiniz?`;

  navigator.clipboard.writeText(text).then(() => {
    alert('Bilgi metni kopyalandı!');
  }).catch(err => console.error('Kopyalama hatası:', err));
}

function getStockInfo(product, stockData) {
  if (!stockData || !Array.isArray(stockData)) return {};

  // Try to find stock info by barcode or product id
  const found = stockData.find(s =>
    s.barcode === product.barcode ||
    s.product_id === product.id ||
    s.sku === product.code
  );

  return found || {};
}

function getStockBadge(quantity) {
  const qty = parseInt(quantity) || 0;

  if (qty <= 0) {
    return '<span class="stock-badge out-of-stock">Stokta Yok</span>';
  } else if (qty <= 5) {
    return '<span class="stock-badge low-stock">Az Stok</span>';
  } else {
    return '<span class="stock-badge in-stock">Stokta</span>';
  }
}

// UI State Functions
function showLoading() {
  hideAll();
  loadingEl.classList.remove('hidden');
}

function showError(message) {
  hideAll();
  errorText.textContent = message;
  errorEl.classList.remove('hidden');
}

function showNoResults() {
  hideAll();
  showError('Aramanızla eşleşen ürün bulunamadı');
}

function hideAll() {
  loadingEl.classList.add('hidden');
  errorEl.classList.add('hidden');
  resultsSection.classList.add('hidden');
  emptyState.classList.add('hidden');
}

// Utility Functions
function escapeHtml(text) {
  if (!text) return '-';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize
console.log('🚀 Hamurlabs Product Panel loaded');
