// ===================================
// HAMURLABS PRODUCT PANEL - APP.JS
// ===================================

// Global Cache for Products (Veri kaybını önlemek için)
window.pageProducts = {};

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

// Sidebar Elements
const historySidebar = document.getElementById('historySidebar');
const toggleSidebarBtn = document.getElementById('toggleSidebar');
const closeSidebarBtn = document.getElementById('closeSidebar');
const sidebarContent = document.getElementById('sidebarContent');

// API Base URL
console.log("🚀 Ugurlar Instagram Envanter Paneli - v1.23 (Live Stock Engine) Yüklendi");

const API_BASE = '';

// Event Listeners
// Event Listeners
searchForm.addEventListener('submit', handleSearch);

// Sidebar Toggles
if (toggleSidebarBtn) {
  toggleSidebarBtn.addEventListener('click', () => {
    historySidebar.classList.add('open');
  });
}
if (closeSidebarBtn) {
  closeSidebarBtn.addEventListener('click', () => {
    historySidebar.classList.remove('open');
  });
}

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
  if (historySidebar.classList.contains('open') &&
    !historySidebar.contains(e.target) &&
    !toggleSidebarBtn.contains(e.target)) {
    historySidebar.classList.remove('open');
  }
});

// Search Handler
// Search Handler
async function handleSearch(e) {
  e.preventDefault();
  const rawQuery = searchInput.value.trim();

  if (!rawQuery) {
    showError('Lütfen ürün kodu veya barkod girin');
    return;
  }

  // Multi-search: Split by space, comma or newline
  const queries = rawQuery.split(/[\s,]+/).filter(Boolean);

  showLoading();
  // Cache Temizle
  window.pageProducts = {};
  window.currentResultCodes = []; // Store current results

  try {
    let allProducts = [];

    // Parallel fetch for all queries
    const results = await Promise.all(
      queries.map(q => searchProducts(q))
    );

    // Flatten and Deduplicate
    const seen = new Set();
    results.flat().forEach(p => {
      if (!seen.has(p.code)) {
        seen.add(p.code);
        allProducts.push(p);
      }
    });

    if (allProducts.length > 0) {
      // Fetch stock info for products
      const stockData = await fetchStock();
      displayProducts(allProducts, stockData);
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
  const response = await fetch(`${API_BASE}/api/products/search?code=${encodeURIComponent(query)}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'API hatası');
  }

  const data = await response.json();
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
// Display Functions
function displayProducts(products, stockData) {
  hideAll();
  // recentProductsSection removed from main view

  productList.innerHTML = '';

  const productArray = Array.isArray(products) ? products : [products];
  resultCount.textContent = `${productArray.length} ürün bulundu`;
  resultsSection.classList.remove('hidden');

  // Store codes for Combined AI
  window.currentResultCodes = productArray.map(p => p.code);

  // Show Combined AI Button if multiple products
  if (productArray.length > 1) {
    const combinedBtn = `
        <div class="fade-in-up" style="display: flex; justify-content: center; margin-bottom: 2rem;">
            <button onclick="generateCombinedAIText()" class="btn-premium btn-ai-magic" style="width: auto; padding: 1rem 2rem;">
                ✨ ${productArray.length} Ürün İçin Ortak Metin Oluştur
            </button>
        </div>
      `;
    productList.insertAdjacentHTML('beforeend', combinedBtn);
  }

  productArray.forEach((product, index) => {
    // Global Cache'e kaydet (Code yoksa rastgele ID ata)
    const productId = product.code || 'unknown_' + Math.random().toString(36).substr(2, 9);
    if (!product.code) product.code = productId;

    // Stock Data'yı merge et
    product.stockInfo = getStockInfo(product, stockData);
    window.pageProducts[productId] = product;

    const cardHtml = createProductCard(product, index);
    productList.insertAdjacentHTML('beforeend', cardHtml);
  });

  // Shopify linklerini yükle
  loadShopifyStatus(productArray);
}

function createProductCard(product, index = 0) {
  const code = product.code;
  const brand = product.brand || product.options?.Marka || '-';
  const color = product.options?.['Ana Renk'] || product.color || '-';
  const price = product.selling_price ? `${product.selling_price} TL` : '-';
  const season = product.options?.['Sezon/Yil'] || '-';
  const metaVariants = product.metas || [];
  const imageUrl = (product.images && product.images.length > 0) ? product.images[0] : null;

  // Stagger animation delay
  const delay = index * 0.1;

  return `
    <article class="product-card fade-in-up" style="animation-delay: ${delay}s">
      <div class="shopify-top-badge" id="shopify-badge-${escapeHtml(code)}">
        <!-- Will be populated by loadShopifyStatus -->
      </div>

      <div class="product-header">
        <div class="product-header-content">
             <div class="product-image-container">
                ${imageUrl
      ? `<img src="${imageUrl}" alt="${escapeHtml(product.name)}" class="product-image" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'product-image-placeholder\\'><svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'currentColor\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'1\\' d=\\'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z\\' /></svg><span>Görsel Yok</span></div>';">`
      : `<div class="product-image-placeholder">
           <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
           </svg>
           <span>Görsel Yok</span>
         </div>`
    }
             </div>
             <div class="product-title-group">
                <h3 class="product-title">${escapeHtml(product.name || product.title || 'İsimsiz Ürün')}</h3>
                <div class="price-display" id="price-display-${escapeHtml(code)}">
                  <div class="price-main">${price}</div>
                </div>
                
                <div class="shopify-action-group" id="shopify-action-${escapeHtml(code)}">
                    <button class="btn-premium btn-shopify" disabled>
                       <span class="status-dot status-loading"></span> Kontrol...
                    </button>
                </div>
             </div>
        </div>
      </div>
      
      <div class="product-body">
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Ürün Kodu</div>
            <div class="info-value copy-code" onclick="copyToClipboard('${escapeHtml(code)}')" title="Kopyala">${escapeHtml(code)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Marka</div>
            <div class="info-value">${escapeHtml(brand)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Renk</div>
            <div class="info-value">${escapeHtml(color)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Sezon</div>
            <div class="info-value">${escapeHtml(season)}</div>
          </div>
        </div>
        
        ${createStockTable(metaVariants, product.stockInfo)}

        <div class="action-buttons">
            <button onclick="generateAIText('${escapeHtml(code)}')" class="btn-premium btn-ai-magic">
                ✨ Yapay Zeka ile Açıklama Oluştur
            </button>
            <button onclick="copyProductInfo('${escapeHtml(code)}')" class="btn-premium btn-copy-info">
                📋 Ürün Bilgilerini Kopyala
            </button>
        </div>
      </div>
    </article>
  `;
}

// Shopify Durumunu ve Linkini Yukle
async function loadShopifyStatus(products) {
  for (const product of products) {
    const code = product.code;
    const badgeContainer = document.getElementById(`shopify-badge-${code}`);
    const actionContainer = document.getElementById(`shopify-action-${code}`);
    if (!badgeContainer || !actionContainer) continue;

    try {
      const response = await fetch(`${API_BASE}/api/shopify-product?code=${encodeURIComponent(code)}`);
      const data = await response.json();

      if (data.found && data.url) {
        // Update Action Button
        actionContainer.innerHTML = `
          <a href="${data.url}" target="_blank" style="text-decoration: none;">
            <button class="btn-premium btn-shopify">
               🛍️ Sitede Gör
            </button>
          </a>
        `;
        // Update Top Badge
        badgeContainer.innerHTML = `
          <div class="badge" style="border-color: var(--success); color: var(--success); background: rgba(34, 197, 94, 0.1);">
            <span class="status-dot status-success"></span> Sitede Var
          </div>
        `;

        // UPDATE PRICE: Shopify'dan gelen güncel fiyatı göster (İndirim varsa üstü çizili)
        if (data.price) {
          const card = badgeContainer.closest('.product-card');
          const priceContainer = card?.querySelector('.price-display');

          if (priceContainer) {
            // Helper to get Shopify variant option by name (robust)
            const getOpt = (v, names) => {
              if (!v.options) return null;
              for (const name of names) {
                if (v.options[name]) return v.options[name].trim();
                const found = Object.keys(v.options).find(k => k.toLowerCase().replace(/\s/g, '') === name.toLowerCase());
                if (found) return v.options[found].trim();
              }
              return null;
            };

            const currentPrice = parseFloat(data.price);
            const comparePrice = data.compareAtPrice ? parseFloat(data.compareAtPrice) : null;
            const hamurlabsPrice = getParsedPrice(product.selling_price);
            const currency = data.currency || 'TL';

            if (!isNaN(currentPrice)) {
              let html = '';

              if (hamurlabsPrice > 0 && Math.abs(hamurlabsPrice - currentPrice) > 1) {
                html += `<div class="price-row store-price" style="opacity: 0.6; font-size: 0.8em; text-decoration: line-through; margin-bottom: 2px;">
                            Mağaza: ${hamurlabsPrice.toLocaleString('tr-TR')} ${currency}
                          </div>`;
              } else if (comparePrice && !isNaN(comparePrice) && comparePrice > currentPrice) {
                html += `<div class="price-row store-price" style="opacity: 0.6; font-size: 0.8em; text-decoration: line-through; margin-bottom: 2px;">
                            Liste: ${comparePrice.toLocaleString('tr-TR')} ${currency}
                          </div>`;
              }

              html += `
                <div class="price-row shopify-price" style="display: flex; flex-direction: column; gap: 0px;">
                  <div style="font-size: 1.65rem; font-weight: 800; color: #ef4444; line-height: 1;">
                    ${currentPrice.toLocaleString('tr-TR')} ${currency}
                  </div>
                  <div style="font-size: 10px; color: var(--success); font-weight: 600; display: flex; align-items: center; gap: 4px; margin-top: 4px;">
                    <span style="display:inline-block; width:6px; height:6px; background:var(--success); border-radius:50%; box-shadow: 0 0 8px var(--success); animation: pulse 2s infinite;"></span>
                    Shopify Canlı Fiyat
                  </div>
                </div>
              `;

              priceContainer.innerHTML = html;

              product.shopifyPrice = currentPrice;
              product.shopifyComparePrice = comparePrice;
              product.hasShopifyDiscount = true;

              // UPDATE VARIANT STOCK IN TABLE
              if (data.variants && data.variants.length > 0) {
                console.log(`📦 Varyant stokları güncelleniyor: ${code}`);

                const cardColor = (product.options?.['Ana Renk'] || product.color || '').toLowerCase();
                const colorList = cardColor.split(/[,/]/).map(c => c.trim()).filter(Boolean);

                data.variants.forEach(sv => {
                  let row = null;
                  let matchType = 'none';

                  // 1. Level 1: Exact Barcode Match
                  row = card?.querySelector(`tr[data-barcode="${sv.barcode}"]`);
                  if (row) matchType = 'barcode';

                  // 2. Level 2: Size + Color Match
                  if (!row && sv.options) {
                    const size = getOpt(sv, ['Size', 'Beden', 'Option1', 'Option2', 'Size/Quantity', 'Beden/Stok']);
                    const svColor = (getOpt(sv, ['Color', 'Renk', 'Option1', 'Option2', 'Renk/Desen']) || '').toLowerCase();

                    if (size) {
                      const rows = card?.querySelectorAll('.stock-table tbody tr');
                      rows?.forEach(r => {
                        const hamurSize = r.cells[0].textContent.trim();
                        const sizeMatch = hamurSize === size;

                        let colorMatch = true;
                        if (colorList.length > 0 && svColor) {
                          colorMatch = colorList.some(c => svColor.includes(c) || c.includes(svColor));
                        }

                        if (sizeMatch && colorMatch) {
                          row = r;
                          matchType = 'heuristic';
                        }
                      });
                    }
                  }

                  if (row) {
                    const stockCell = row.querySelector('.shopify-stock-cell');
                    const colorCell = row.querySelector('.color-col');
                    const hamurBarcode = row.getAttribute('data-barcode');

                    // LIVE COLOR POPULATION: If table says "-", try to use Shopify color
                    if (colorCell && (!colorCell.textContent || colorCell.textContent.trim() === '-')) {
                      const svColor = (getOpt(sv, ['Color', 'Renk', 'Option1', 'Option2', 'Renk/Desen']) || '').toLowerCase();
                      if (svColor) colorCell.innerHTML = `<span style="text-transform: capitalize;">${svColor}</span>`;
                    }

                    if (stockCell) {
                      const qty = parseInt(sv.inventory) || 0;
                      let diagnosticInfo = '';

                      // Data Scientist Alert: Barcode mismatch
                      if (matchType === 'heuristic' && sv.barcode && hamurBarcode && sv.barcode !== hamurBarcode) {
                        diagnosticInfo = `
                          <span title="Veri Uyumsuzluğu: Panel Barkodu (${hamurBarcode}) ile Shopify Barkodu (${sv.barcode}) uyuşmuyor. Eşleşme Beden/Renk üzerinden yapıldı." 
                                style="cursor: help; color: #f59e0b; margin-left: 4px; font-size: 12px;">
                            ⚠️
                          </span>`;
                      }

                      stockCell.innerHTML = `
                        <div style="display: flex; align-items: center; justify-content: flex-start; gap: 4px;">
                          <span class="${qty > 0 ? 'text-green' : 'text-red'}" style="font-weight: 700;">
                            ${qty} Adet
                          </span>
                          ${qty > 0 ? '<span style="display:inline-block; width:6px; height:6px; background:var(--success); border-radius:50%; box-shadow: 0 0 5px var(--success); animation: pulse 2s infinite;"></span>' : ''}
                          ${diagnosticInfo}
                        </div>
                      `;
                    }
                  }
                });
              }
            }
          }
        }

        // FALLBACK: Görsel yoksa VEYA mevcut görsel bozuksa (placeholder varsa) Shopify'dan gelen görseli kullan
        const currentCard = document.querySelector(`#shopify-badge-${code}`)?.parentElement;
        const imageContainer = currentCard?.querySelector('.product-image-container');

        if (imageContainer && data.images && data.images.length > 0) {
          const hasPlaceholder = imageContainer.querySelector('.product-image-placeholder');
          const hasNoImages = !product.images || product.images.length === 0;

          if (hasPlaceholder || hasNoImages) {
            const shopifyImgUrl = data.images[0];
            imageContainer.innerHTML = `
              <img src="${shopifyImgUrl}" alt="${escapeHtml(product.name)}" class="product-image" loading="lazy" 
                   title="Shopify'dan yüklendi"
                   onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'product-image-placeholder\\'><svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'currentColor\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'1\\' d=\\'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z\\' /></svg><span>Görsel Yok</span></div>';">
            `;
            // Cache'e de ekleyelim
            product.images = data.images;
          }
        }
      } else {
        actionContainer.innerHTML = `
          <button class="btn-premium btn-shopify" disabled style="opacity: 0.5; cursor: not-allowed;" title="Ürün Shopify'da bulunamadı">
             🔍 Sitede Yok
          </button>
        `;
        badgeContainer.innerHTML = `
          <div class="badge" style="border-color: var(--error); color: var(--error); background: rgba(239, 68, 68, 0.1);">
            <span class="status-dot status-error"></span> Sitede Yok
          </div>
        `;
      }
    } catch (error) {
      console.error('Shopify fetch error:', error);
      actionContainer.innerHTML = `<button class="btn-premium btn-shopify" disabled>Hata</button>`;
    }
  }
}

// Toast Notification System
window.showToast = function (message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };

  toast.innerHTML = `
    <span>${icons[type] || 'ℹ️'}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Auto remove
  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 300);
  }, 3000);
};

// Global scope AI function
window.generateAIText = async function (productCode) {
  const product = window.pageProducts[productCode];
  if (!product) {
    showToast('Hata: Ürün verisi bulunamadı.', 'error');
    return;
  }

  const name = product.name || product.title;
  const brand = product.brand || product.options?.Marka || '-';
  const color = product.options?.['Ana Renk'] || product.color || '-';

  const storePriceNum = getParsedPrice(product.selling_price);
  const shopifyPriceNum = getParsedPrice(product.shopifyPrice);
  const price = (shopifyPriceNum > 0 && shopifyPriceNum < storePriceNum) ? `${shopifyPriceNum} TL` : `${storePriceNum} TL`;

  const category = (product.categories && product.categories[0]) || product.options?.['Ürün Grubu'] || '-';
  const variants = product.metas || [];

  // URL Creation (Async)
  const productUrl = await fetchProductUrl(productCode, name);

  // Stok Durumunu Analiz Et
  let stockStatus = "Tükendi";
  let availableSizes = [];

  if (variants.length > 0) {
    // Quantity kontrolü: Sayısal değere çevir ve 0'dan büyük mü bak
    availableSizes = variants.filter(v => (parseInt(v.quantity) || 0) > 0).map(v => v.value || v.size || v.name);
    if (availableSizes.length > 0) {
      stockStatus = `Stokta Var (${availableSizes.join(', ')})`;
    }
  } else if (product.stockInfo && (product.stockInfo.quantity > 0)) {
    stockStatus = "Stokta Var"; // Varyantsız ama global stok var
  }

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
        product: { name, brand, color, price, category, stockStatus, sizes: availableSizes.join(', '), url: productUrl }
      })
    });

    const data = await response.json();
    document.body.removeChild(overlay);

    if (!response.ok) throw new Error(data.error || 'AI hatası');
    showAIResult(data.text);

  } catch (error) {
    if (document.getElementById(loadingId)) document.body.removeChild(document.getElementById(loadingId));
    showToast('Hata: ' + error.message, 'error');
  }
}

function showAIResult(text) {
  const modalId = 'ai-result-modal';
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

// Combined AI Generator
window.generateCombinedAIText = async function () {
  const codes = window.currentResultCodes || [];
  if (codes.length === 0) return;

  const productsToProcess = codes.map(code => window.pageProducts[code]).filter(Boolean);

  if (productsToProcess.length === 0) {
    showToast('Ürün verisi bulunamadı', 'error');
    return;
  }

  // Prepare data for AI
  const preparedProducts = await Promise.all(productsToProcess.map(async (product) => {
    const name = product.name || product.title;
    const brand = product.brand || product.options?.Marka || '-';
    const color = product.options?.['Ana Renk'] || product.color || '-';
    const storePriceNum = getParsedPrice(product.selling_price);
    const shopifyPriceNum = getParsedPrice(product.shopifyPrice);
    const price = (shopifyPriceNum > 0 && shopifyPriceNum < storePriceNum) ? `${shopifyPriceNum} TL` : `${storePriceNum} TL`;
    const category = (product.categories && product.categories[0]) || product.options?.['Ürün Grubu'] || '-';
    const variants = product.metas || [];

    // URL Creation
    const url = await fetchProductUrl(product.code, name);

    // Stock Status
    let stockStatus = "Tükendi";
    let availableSizes = [];
    if (variants.length > 0) {
      availableSizes = variants.filter(v => (parseInt(v.quantity) || 0) > 0).map(v => v.value || v.size || v.name);
      if (availableSizes.length > 0) stockStatus = `Stokta Var (${availableSizes.join(', ')})`;
    } else if (product.stockInfo && (product.stockInfo.quantity > 0)) {
      stockStatus = "Stokta Var";
    }

    return { name, brand, color, price, category, stockStatus, sizes: availableSizes.join(', '), url };
  }));

  const loadingId = 'ai-loading-' + Date.now();
  const overlay = document.createElement('div');
  overlay.id = loadingId;
  overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; display: flex; justify-content: center; align-items: center; flex-direction: column; color: white;';
  overlay.innerHTML = `
        <div style="font-size: 40px; margin-bottom: 20px;">✨</div>
        <h3>Toplu Metin Hazırlanıyor...</h3>
        <p>${preparedProducts.length} ürün analiz ediliyor.</p>
    `;
  document.body.appendChild(overlay);

  try {
    const response = await fetch(`${API_BASE}/api/generate-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: preparedProducts })
    });

    const data = await response.json();
    document.body.removeChild(overlay);

    if (!response.ok) throw new Error(data.error || 'AI hatası');
    showAIResult(data.text);

  } catch (error) {
    if (document.getElementById(loadingId)) document.body.removeChild(document.getElementById(loadingId));
    showToast('Hata: ' + error.message, 'error');
  }
}


function createStockTable(variants, stockInfo) {
  if (variants && variants.length > 0) {
    return `
    <div class="stock-section">
      <h4 class="stock-title">Beden & Stok Bilgisi</h4>
      <table class="stock-table">
        <thead>
          <tr>
            <th>Beden</th>
            <th class="color-col">Renk</th>
            <th>Barkod</th>
            <th>Mağaza Stok</th>
            <th>Shopify Stok</th>
          </tr>
        </thead>
        <tbody>
          ${variants.map(v => `
            <tr data-barcode="${escapeHtml(v.barcode)}">
              <td>${escapeHtml(v.value || v.size || v.name || '-')}</td>
              <td class="color-col" style="font-size: 0.85em; opacity: 0.8;">${escapeHtml(v.color || '-')}</td>
              <td>${escapeHtml(v.barcode || '-')}</td>
              <td class="${(parseInt(v.quantity) || 0) > 0 ? 'text-green' : 'text-red'}">
                ${v.quantity !== undefined ? v.quantity : '-'} 
              </td>
              <td class="shopify-stock-cell">-</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
  }
  return '<div class="no-stock-info">Detaylı stok bilgisi yok</div>';
}

// Utility: Parse Price to Number
function getParsedPrice(p) {
  if (!p) return 0;
  if (typeof p === 'number') return p;
  const num = parseFloat(String(p).replace(/[^\d.,]/g, '').replace(',', '.'));
  return isNaN(num) ? 0 : num;
}

// Utility: Slugify for Shopify URL
function createSlug(text) {
  if (!text) return '';
  const map = {
    'ç': 'c', 'ğ': 'g', 'ı': 'i', 'İ': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
    'Ç': 'c', 'Ğ': 'g', 'I': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
  };

  return text.split('').map(char => map[char] || char)
    .join('').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove invalid chars
    .trim()
    .replace(/\s+/g, '-'); // Replace spaces with -
}

// Utility: Get Product URL from Backend (Shopify API)
async function fetchProductUrl(productCode, productName) {
  try {
    const response = await fetch(`${API_BASE}/api/shopify-product?code=${encodeURIComponent(productCode)}`);
    const data = await response.json();
    if (data.found && data.url) {
      return data.url;
    }
  } catch (e) {
    console.error('Link fetch error:', e);
  }

  // Fallback to slugify if API fails
  const slug = createSlug(productName);
  return `https://ugurlar.com/products/${slug}`;
}

// Global scope copy function - REFACTOR: Uses Global Cache
window.copyProductInfo = async function (productCode) {
  const product = window.pageProducts[productCode];
  if (!product) {
    alert('Hata: Ürün verisi bulunamadı.');
    return;
  }

  const name = product.name || product.title;
  const brand = product.brand || product.options?.Marka || '-';
  const storePriceNum = getParsedPrice(product.selling_price);
  const shopifyPriceNum = getParsedPrice(product.shopifyPrice);
  const finalPrice = (shopifyPriceNum > 0 && shopifyPriceNum < storePriceNum) ? shopifyPriceNum : storePriceNum;
  const price = finalPrice ? finalPrice + ' TL' : '-';
  const variants = product.metas || [];

  // URL Creation (Async)
  const productUrl = await fetchProductUrl(productCode, name);

  let stockText = "";
  if (variants.length > 0) {
    stockText = "\n\nStok Durumu:\n";
    variants.forEach(v => {
      const qty = parseInt(v.quantity) || 0;
      stockText += `${v.value || v.size || v.name}: ${qty > 0 ? qty + ' Adet' : 'Tükendi'}\n`;
    });
  }

  const text = `Merhaba,\n\nİlgilendiğiniz ürün bilgileri aşağıdadır:\n\nÜrün: ${name}\nKod: ${productCode}\nMarka: ${brand}\nRenk: ${color}\nFiyat: ${price}${stockText}\n\nÜrünü incelemek ve satın almak için: ${productUrl}\n\nSipariş oluşturmak için WhatsApp hattımızdan bize ulaşabilirsiniz. 👇`;

  navigator.clipboard.writeText(text).then(() => {
    alert('Bilgi metni kopyalandı! ✅');
  }).catch(err => console.error('Kopyalama hatası:', err));
}

function getStockInfo(product, stockData) {
  if (!stockData || !Array.isArray(stockData)) return {};
  const found = stockData.find(s =>
    s.barcode === product.barcode ||
    s.product_id === product.id ||
    s.sku === product.code
  );
  return found || {};
}

function getStockBadge(quantity) {
  const qty = parseInt(quantity) || 0;
  if (qty <= 0) return '<span class="stock-badge out-of-stock">Stokta Yok</span>';
  if (qty <= 5) return '<span class="stock-badge low-stock">Az Stok</span>';
  return '<span class="stock-badge in-stock">Stokta</span>';
}

// UI State Functions
function showLoading() {
  hideAll();
  productList.innerHTML = '';
  resultsSection.classList.remove('hidden');

  // Create Skeleton Placeholders
  for (let i = 0; i < 2; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = 'product-card';
    skeleton.innerHTML = `
      <div class="product-header" style="height: 270px; border-bottom: none;">
        <div class="product-header-content">
          <div class="product-image-container skeleton"></div>
          <div class="product-title-group" style="flex: 1;">
            <div class="skeleton" style="height: 32px; width: 70%; margin-bottom: 12px;"></div>
            <div class="skeleton" style="height: 24px; width: 40%; margin-bottom: 30px;"></div>
            <div class="skeleton" style="height: 48px; width: 100%;"></div>
          </div>
        </div>
      </div>
      <div class="product-body" style="padding-top: 0;">
        <div class="info-grid">
          ${Array(4).fill('<div class="info-item"><div class="skeleton" style="height: 50px;"></div></div>').join('')}
        </div>
        <div class="skeleton" style="height: 140px; margin-top: 1.5rem; border-radius: 12px;"></div>
        <div class="action-buttons">
          <div class="skeleton" style="height: 54px; grid-column: span 2; border-radius: 12px;"></div>
          <div class="skeleton" style="height: 54px; grid-column: span 2; border-radius: 12px;"></div>
        </div>
      </div>
    `;
    productList.appendChild(skeleton);
  }
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
  // Do NOT hide recentProductsSection here by default, let individual functions manage it
}

// Recent Products Logic
async function fetchRecentProducts() {
  try {
    const response = await fetch(`${API_BASE}/api/products?limit=10`);
    if (!response.ok) throw new Error('Failed to fetch recent products');

    const data = await response.json();
    const products = data.data || [];

    if (products.length > 0) {
      const stockData = await fetchStock();
      renderRecentProducts(products, stockData);
    }
  } catch (error) {
    console.error('Recent products fetch error:', error);
  }
}

function renderRecentProducts(products, stockData) {
  const container = sidebarContent;
  container.innerHTML = '';

  if (!products || products.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding:1rem;">Henüz güncelleme yok</div>';
    return;
  }

  products.forEach((product) => {
    // Global Cache
    const productId = product.code || 'unknown_' + Math.random().toString(36).substr(2, 9);
    if (!product.code) product.code = productId;

    // Merge Stock
    product.stockInfo = getStockInfo(product, stockData);
    window.pageProducts[productId] = product;

    // Create compact card
    const cardHtml = createCompactProductCard(product);
    container.insertAdjacentHTML('beforeend', cardHtml);
  });
}

function createCompactProductCard(product) {
  const code = product.code;
  const imageUrl = (product.images && product.images.length > 0) ? product.images[0] : null;
  const price = product.selling_price ? `${product.selling_price} TL` : '-';

  // Stock Status Badge
  let stockBadge = '<span style="color:var(--error); font-size: 0.7em;">Tükendi</span>';
  const variants = product.metas || [];
  let totalStock = 0;

  if (variants.length > 0) {
    totalStock = variants.reduce((acc, v) => acc + (parseInt(v.quantity) || 0), 0);
  } else if (product.stockInfo && product.stockInfo.quantity) {
    totalStock = parseInt(product.stockInfo.quantity);
  }

  if (totalStock > 0) {
    stockBadge = `<span style="color:var(--success); font-size: 0.7em;">${totalStock} Adet</span>`;
  }

  return `
    <div class="sidebar-item" onclick="handleSearchFromSidebar('${escapeHtml(code)}')">
      <div class="sidebar-item-img">
         ${imageUrl
      ? `<img src="${imageUrl}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'small-placeholder\\'><svg xmlns=\\'http://www.w3.org/2000/svg\\' fill=\\'none\\' viewBox=\\'0 0 24 24\\' stroke=\\'currentColor\\'><path stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\' stroke-width=\\'1\\' d=\\'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z\\' /></svg></div>';">`
      : `<div class="small-placeholder">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
               </div>`
    }
      </div>
      <div class="sidebar-item-info">
        <div class="sidebar-item-title">${escapeHtml(product.name)}</div>
        <div class="sidebar-item-meta">
           <span style="font-family:monospace;">${escapeHtml(code)}</span>
           ${stockBadge}
        </div>
        <div class="sidebar-item-price">${price}</div>
      </div>
    </div>
  `;
}

function handleSearchFromSidebar(code) {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = code;
    const form = document.getElementById('searchForm');
    if (form) form.dispatchEvent(new Event('submit'));

    // Close sidebar on mobile
    if (window.innerWidth < 768) {
      const sidebar = document.getElementById('historySidebar');
      if (sidebar) sidebar.classList.remove('open');
    }
  }
}

// System Status Logic
document.addEventListener('DOMContentLoaded', () => {
  const btnStatus = document.getElementById('btn-system-status');
  if (btnStatus) {
    btnStatus.addEventListener('click', showSystemStatus);
  }

  // Load recent products
  fetchRecentProducts();
});

async function showSystemStatus() {
  const modalId = 'status-modal';
  const existing = document.getElementById(modalId);
  if (existing) document.body.removeChild(existing);

  const modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 2000; display: flex; justify-content: center; align-items: center;';

  modal.innerHTML = `
    <div style="background: #1e1e1e; padding: 25px; border-radius: 12px; width: 90%; max-width: 600px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #333;">
        <h3 style="color: #fff; margin-bottom: 15px;">📡 Sistem Güncelleme Geçmişi</h3>
        <div id="status-content" style="color: #bbb;">Yükleniyor...</div>
        <button onclick="document.body.removeChild(document.getElementById('${modalId}'))" style="margin-top: 15px; width: 100%; padding: 10px; background: #333; color: white; border: none; border-radius: 6px; cursor: pointer;">Kapat</button>
    </div>
  `;
  document.body.appendChild(modal);

  try {
    const response = await fetch(`${API_BASE}/api/system-status`);
    const logs = await response.json();
    const contentDiv = document.getElementById('status-content');

    if (logs && logs.length > 0) {
      contentDiv.innerHTML = `
        <table class="history-table">
            <thead>
                <tr>
                    <th>Zaman</th>
                    <th>İşlem</th>
                    <th>Değişen Ürünler</th>
                </tr>
            </thead>
            <tbody>
                ${logs.map(log => {
        const date = new Date(log.processed_at).toLocaleString('tr-TR');
        const products = log.changed_products ? log.changed_products.join(', ') : '-';
        return `
                    <tr>
                        <td>${date}</td>
                        <td><span class="status-badge success">${log.item_count} Ürün Güncellendi</span></td>
                        <td style="font-family: monospace; font-size: 0.8em; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${products}">${products}</td>
                    </tr>
                  `;
      }).join('')}
            </tbody>
        </table>
      `;
    } else {
      contentDiv.innerHTML = '<p>Henüz kayıtlı bir güncelleme yok.</p>';
    }

  } catch (error) {
    document.getElementById('status-content').innerHTML = `<p style="color: #ef4444;">Veri alınamadı: ${error.message}</p>`;
  }
}

// Utility Functions
function escapeHtml(text) {
  if (!text) return '-';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Utility: Copy Code
window.copyToClipboard = function (text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Kopyalandı! ✅', 'success');
  }).catch(err => {
    console.error('Copy failed', err);
    showToast('Kopyalama başarısız oldu.', 'error');
  });
}

// Initialize
console.log('🚀 Hamurlabs Product Panel loaded with Global Cache');
