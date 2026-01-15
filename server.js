const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');
const cron = require('node-cron');
const { startFullSync } = require('./full_sync');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ugurlar2026';

// Security Configuration
// Generate a slightly more secure static token (Salted Hash)
const crypto = require('crypto');
const AUTH_TOKEN = crypto.createHash('sha256').update(ADMIN_PASSWORD + (process.env.SUPABASE_KEY || 'static_salt')).digest('hex');

// Simple In-Memory Rate Limiter
const loginAttempts = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Cache (expire in 10 minutes)
const shopifyCache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Global State for Automation
let lastSyncInfo = { status: 'idle', count: 0, timestamp: 'Henüz yapılmadı' };

// SECURITY: Rate Limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50000, // Increased for massive stock audit (36k+ products)
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla istek, lütfen biraz bekleyin.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Strict for authentication
  message: { error: 'Çok fazla giriş denemesi. Lütfen 15 dakika bekleyin.' }
});

// Apply rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth/login', loginLimiter);

// Basic Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// AUTH MIDDLEWARE
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${AUTH_TOKEN}`) {
    next();
  } else {
    res.status(401).json({ error: 'Yetkisiz erişim. Lütfen giriş yapın.' });
  }
};

// LOGIN ENDPOINT
app.post('/api/auth/login', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();

  // Rate Limiting Check
  const attempts = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  if (attempts.count >= MAX_ATTEMPTS && (now - attempts.lastAttempt) < RATE_LIMIT_WINDOW) {
    const waitTime = Math.ceil((RATE_LIMIT_WINDOW - (now - attempts.lastAttempt)) / 60000);
    return res.status(429).json({ error: `Çok fazla hatalı deneme. Lütfen ${waitTime} dakika bekleyin.` });
  }

  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    loginAttempts.delete(ip); // Reset on success
    res.json({ success: true, token: AUTH_TOKEN });
  } else {
    // Record failed attempt
    attempts.count++;
    attempts.lastAttempt = now;
    loginAttempts.set(ip, attempts);

    res.status(401).json({ success: false, error: 'Hatalı şifre' });
  }
});

// ==========================================
// AUTOMATED DATA SYNC (CRON)
// ==========================================
// Runs every night at 03:00
cron.schedule('0 3 * * *', async () => {
  console.log('⏰ [CRON] Daily Full Sync started...');
  lastSyncInfo.status = 'running';
  try {
    const result = await startFullSync();
    lastSyncInfo = { status: 'success', ...result };
    console.log(`✅ [CRON] Sync complete: ${result.count} products.`);
  } catch (err) {
    lastSyncInfo.status = 'failed';
    console.error('❌ [CRON] Sync failed:', err.message);
  }
});

// Manual Sync Status Endpoint
app.get('/api/admin/sync-status', authenticate, (req, res) => {
  res.json(lastSyncInfo);
});

// Manual Sync Trigger (Optional but helpful)
app.post('/api/admin/trigger-sync', authenticate, async (req, res) => {
  if (lastSyncInfo.status === 'running') return res.status(429).json({ error: 'Sync zaten çalışıyor.' });

  // Run in background to avoid timeout
  lastSyncInfo.status = 'running';
  startFullSync()
    .then(result => { lastSyncInfo = { status: 'success', ...result }; })
    .catch(err => { lastSyncInfo.status = 'failed'; console.error(err); });

  res.json({ message: 'Senkronizasyon arka planda başlatıldı.' });
});

// ==========================================
// CONFIGURATION
// ==========================================
const API_BASE_URI = process.env.HAMURLAB_API_BASE_URI;
const API_USERNAME = process.env.HAMURLAB_API_USERNAME;
const API_PASSWORD = process.env.HAMURLAB_API_PASSWORD;

const authString = Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64');

const userAgents = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (iPad; CPU OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1'
];

function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

// Axios instance for Supabase API
const supabaseAPI = axios.create({
  baseURL: `${process.env.SUPABASE_URL}/rest/v1`,
  headers: {
    'apikey': process.env.SUPABASE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
  }
});

// ==========================================
// CORE FUNCTIONS
// ==========================================

// Global Logging Helper
async function logSystemEvent(severity, message, context = {}) {
  try {
    await supabaseAPI.post('/system_logs', {
      severity,
      message,
      context,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error(`🔴 Logging Failed [${severity}]:`, err.message);
  }
}

// Mismatch Diagnostic Helper
async function logMismatch(hamurCode, shopifyHandle, reason) {
  try {
    await supabaseAPI.post('/mismatch_diagnostics', {
      hamur_code: hamurCode,
      shopify_handle: shopifyHandle,
      reason,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('🔴 Mismatch Logging Failed:', err.message);
  }
}

async function makeStealthRequest(endpoint, params = {}) {
  const fakeDomain = 'https://monalure.hamurlabs.io';
  return axios.get(`${API_BASE_URI}${endpoint}`, {
    params,
    headers: {
      'Authorization': `Basic ${authString}`,
      'Content-Type': 'application/json',
      'User-Agent': getRandomUserAgent(),
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': `${fakeDomain}/`,
      'Origin': fakeDomain,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Connection': 'keep-alive'
    }
  });
}

async function syncToSupabase(products) {
  if (!products || products.length === 0) return;

  // 1. Get all codes in this batch
  const codes = [...new Set(products.map(p => p.code).filter(Boolean))];

  // 2. Fetch existing products from Supabase for these codes
  let existingMap = new Map();
  if (codes.length > 0) {
    try {
      // Chunk codes to avoid long URL (max 50 codes per query)
      const chunkSize = 50;
      for (let i = 0; i < codes.length; i += chunkSize) {
        const chunk = codes.slice(i, i + chunkSize);
        const codeFilter = chunk.join(',');
        const response = await supabaseAPI.get('/products', {
          params: {
            code: `in.(${codeFilter})`,
            select: '*'
          }
        });
        response.data.forEach(item => existingMap.set(item.code, item));
      }
    } catch (err) {
      console.warn('⚠️ Mevcut ürünler çekilemedi, üzerine yazılacak:', err.message);
    }
  }

  // 3. Process and Merge
  const mergedMap = new Map();

  products.forEach(p => {
    const code = p.code || p.sku || 'unknown-' + Math.random();

    // Start with existing data from Supabase or new object
    if (!mergedMap.has(code)) {
      const existingInDb = existingMap.get(code);

      if (existingInDb) {
        // Clone DB record to start with
        mergedMap.set(code, JSON.parse(JSON.stringify(existingInDb)));
      } else {
        // Create new record structure
        mergedMap.set(code, {
          code: code,
          name: p.name || p.title || '-',
          barcode: p.barcode || (p.metas && p.metas[0] ? p.metas[0].barcode : null),
          brand: p.brand || p.options?.Marka || null,
          price: p.selling_price ? String(p.selling_price) : null,
          stock_status: p.is_stock ? 'Var' : 'Yok',
          category: (p.categories && p.categories[0]) || null,
          data: JSON.parse(JSON.stringify(p))
        });
        // Skip further merging for the first occurrence in THIS batch if it's brand new
        return;
      }
    }

    // Perform Merge
    const existing = mergedMap.get(code);

    // Merge Metas (Variants) - Attach color to each meta for clarity
    const existingMetas = existing.data.metas || [];
    const newMetas = (p.metas || []).map(m => ({ ...m, color: p.options?.['Ana Renk'] || p.color }));
    const metaMap = new Map();

    // Use ID or Barcode as key, ensuring we don't lose color info
    [...existingMetas, ...newMetas].forEach(m => {
      const key = m.id || m.barcode || Math.random();
      metaMap.set(key, m);
    });
    existing.data.metas = Array.from(metaMap.values());

    // Merge Images
    const existingImages = existing.data.images || [];
    const newImages = p.images || [];
    existing.data.images = [...new Set([...existingImages, ...newImages])];

    // Merge Options (Colors etc)
    if (p.options) {
      if (!existing.data.options) existing.data.options = {};
      for (const [key, val] of Object.entries(p.options)) {
        const existingVal = existing.data.options[key];
        if (existingVal && val && existingVal !== val && !existingVal.includes(val)) {
          existing.data.options[key] = existingVal + ", " + val;
        } else if (!existingVal && val) {
          existing.data.options[key] = val;
        }
      }
    }

    // Update Overall Fields
    if (p.is_stock) {
      existing.stock_status = 'Var';
      existing.data.is_stock = true;
    }
    // Update name if changed (or keep combined if needed, but usually Hamurlabs names reflect the generic title)
    // existing.name = p.name || existing.name; 
  });

  const uniqueProducts = Array.from(mergedMap.values());

  try {
    await supabaseAPI.post('/products', uniqueProducts);
    console.log(`☁️ ${uniqueProducts.length} ürün Supabase'e (zenginleştirilerek) gönderildi.`);
  } catch (err) {
    console.error('Supabase Sync Hatası:', err.response?.data || err.message);
  }
}

function formatDateForAPI(date) {
  const pad = (n) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Ürün Listesi (Supabase'den)
app.get('/api/products', authenticate, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    // Direkt Supabase'den çek - Exact count ekleyerek toplam sayıyı öğreniyoruz
    const response = await supabaseAPI.get('/products', {
      params: {
        select: '*',
        limit: limit,
        offset: offset,
        order: 'updated_at.desc'
      },
      headers: {
        'Prefer': 'count=exact' // Toplam sayıyı header'da almak için
      }
    });

    // Content-Range header'ından toplam sayıyı çek (Örn: 0-99/36979)
    const contentRange = response.headers['content-range'];
    const totalCount = contentRange ? parseInt(contentRange.split('/')[1]) : response.data.length;

    // Frontend'in beklediği format
    const results = response.data.map(item => item.data || item);

    res.json({
      total_count: totalCount,
      count: results.length,
      limit,
      offset,
      data: results
    });

  } catch (error) {
    console.error('Error fetching products:', error.message);
    res.status(500).json({ error: 'Veri çekilemedi' });
  }
});

// 2. Arama (Supabase Full Text Search)
app.get('/api/products/search', authenticate, async (req, res) => {
  try {
    const { code } = req.query;
    const query = (code || '').trim();

    if (!query) return res.json({ data: [] });

    // Supabase filtre sorgusu
    const partial = encodeURIComponent(`%${query}%`);
    const queryString = `select=*&or=(code.ilike.${partial},name.ilike.${partial},barcode.ilike.${partial},brand.ilike.${partial})&limit=50`;

    const response = await axios.get(`${process.env.SUPABASE_URL}/rest/v1/products?${queryString}`, {
      headers: {
        'apikey': process.env.SUPABASE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_KEY}`
      }
    });

    const results = response.data.map(item => item.data || {
      code: item.code,
      name: item.name,
      selling_price: item.price,
      options: { Marka: item.brand, 'Ana Renk': '-', 'Sezon/Yil': '-', 'Ürün Grubu': item.category },
      is_stock: item.stock_status === 'Var',
      variants: item.variants || [] // Varsa varyantları da al
    });

    // AKILLI SIRALAMA (Smart Ranking)
    // 1. Stokta Olanlar En Üstte
    // 2. Sezonu Yeni Olanlar (2025 > 2024)
    // 3. Kodu Arananla Tam Eşleşenler
    results.sort((a, b) => {
      // 1. Stok Kontrolü
      const stockA = a.is_stock ? 1 : 0;
      const stockB = b.is_stock ? 1 : 0;
      if (stockA !== stockB) return stockB - stockA; // Stokta olanlar önce

      // 2. Sezon Kontrolü (String'den Yıl Çıkarma)
      const getYear = (seasonStr) => {
        if (!seasonStr) return 0;
        const match = seasonStr.match(/(\d{4})/);
        return match ? parseInt(match[1]) : 0;
      };
      const seasonA = getYear(a.options?.['Sezon/Yil']);
      const seasonB = getYear(b.options?.['Sezon/Yil']);
      if (seasonA !== seasonB) return seasonB - seasonA; // Yeni yıl önce

      // 3. Kod Tam Eşleşme (Bonus)
      if (a.code === query && b.code !== query) return -1;
      if (b.code === query && a.code !== query) return 1;

      return 0;
    });

    res.json({
      total_count: results.length,
      data: results,
      source: 'supabase'
    });

  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ error: 'Arama hatası' });
  }
});

// 3. Stok Kontrol (Canlı - Hamurlabs API)
app.get('/api/stock', authenticate, async (req, res) => {
  try {
    const { barcode } = req.query;
    const params = barcode ? { barcode } : {};
    const response = await makeStealthRequest('/report/meta/quantities/', params);
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching stock:', error.message);
    res.status(500).json({ error: 'Stok hatası' });
  }
});

// ==========================================
// SHOPIFY INTEGRATION
// ==========================================
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN; // e.g., 'ugurlar.myshopify.com'
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function getShopifyProductHandle(sku) {
  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
    console.warn('⚠️ Shopify Credentials eksik.');
    return null;
  }

  // Temiz SKU (B00041 vs 2B00041 durumları için)
  const cleanSku = sku.replace(/^2/, ''); // Başındaki 2'yi atıp dene

  // Check Cache First
  const cachedData = shopifyCache.get(sku);
  if (cachedData) {
    console.log(`⚡ Shopify Cache Hit: ${sku}`);
    return cachedData;
  }

  const query = `
    query($query: String!) {
      products(first: 5, query: $query) {
        edges {
          node {
            id
            handle
            onlineStoreUrl
            title
            variants(first: 50) {
              edges {
                node {
                  id
                  sku
                  price
                  compareAtPrice
                  inventoryQuantity
                  barcode
                  selectedOptions {
                    name
                    value
                  }
                }
              }
            }
            images(first: 5) {
              edges {
                node {
                  url
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    return await executeShopifyQuery(query, { query: sku }, sku, cleanSku);
  } catch (error) {
    console.error(`❌ Shopify API Hatası (${sku}):`, error.response?.data || error.message);
    return null;
  }
}

async function executeShopifyQuery(query, variables, sku, cleanSku, retryCount = 0) {
  try {
    const response = await axios.post(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`,
      { query, variables },
      { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } }
    );

    if (response.data && response.data.errors) {
      const isRateLimit = response.data.errors.some(e => e.extensions?.code === 'THROTTLED' || e.message?.includes('Throttled'));
      if (isRateLimit && retryCount < 3) {
        console.log(`⏳ Shopify Rate Limit (Throttled). Retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        return executeShopifyQuery(query, variables, sku, cleanSku, retryCount + 1);
      }
    }

    const products = response.data?.data?.products?.edges || [];
    if (products.length === 0) {
      // Eğer ana SKU ile bulunamadıysa cleanSku ile tekrar dene
      if (cleanSku !== sku) {
        return getShopifyProductHandle(cleanSku);
      }
      return null;
    }

    // BEST MATCH LOGIC
    let bestMatch = null;

    // 1. TAM SKU EŞLEŞMESİ (Variant SKU === sku)
    for (const edge of products) {
      const node = edge.node;
      const variants = node.variants?.edges || [];
      const exactMatch = variants.find(v => v.node.sku === sku);
      if (exactMatch) {
        console.log(`✅ Tam SKU eşleşmesi bulundu: ${node.handle} (Variant: ${exactMatch.node.sku})`);
        bestMatch = { ...node, selectedVariant: exactMatch.node };
        break;
      }
    }

    // 2. KISMİ SKU EŞLEŞMESİ (B00041 içermesi)
    if (!bestMatch) {
      for (const edge of products) {
        const node = edge.node;
        const variants = node.variants?.edges || [];
        const partialMatch = variants.find(v => v.node.sku && v.node.sku.includes(sku));
        if (partialMatch) {
          console.log(`🟡 Kısmi SKU eşleşmesi bulundu: ${node.handle} (Variant: ${partialMatch.node.sku})`);
          bestMatch = { ...node, selectedVariant: partialMatch.node };
          break;
        }
      }
    }

    // 3. HANDLE/TITLE İÇİNDE GEÇMESİ
    if (!bestMatch) {
      bestMatch = products[0].node;
      console.log(`ℹ️ Varsayılan eşleşme (ilk sonuç): ${bestMatch.handle}`);
    }

    if (bestMatch) {
      shopifyCache.set(sku, bestMatch);
    } else {
      await logMismatch(sku, 'Not Found', 'SKU not found in Shopify search results');
    }

    return bestMatch;
  } catch (error) {
    console.error('❌ Shopify API Hatası:', error.response?.data || error.message);
    return null;
  }
}

// 3.5 Shopify Product Link Endpoint
app.get('/api/shopify-product', authenticate, async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Urun kodu gerekli' });

  const shopifyData = await getShopifyProductHandle(code);

  if (shopifyData) {
    const url = shopifyData.onlineStoreUrl || `https://ugurlar.com/products/${shopifyData.handle}`;

    const images = [];
    if (shopifyData.images && shopifyData.images.edges) {
      shopifyData.images.edges.forEach(edge => {
        if (!images.includes(edge.node.url)) images.push(edge.node.url);
      });
    }

    // Use selectedVariant if available, otherwise fallback to first variant
    let variant = shopifyData.selectedVariant;
    if (!variant) {
      const variantEdges = shopifyData.variants?.edges || [];
      variant = variantEdges[0]?.node;
    }

    const price = variant?.price;
    const compareAtPrice = variant?.compareAtPrice;
    const currency = 'TL';

    // Map all variants for stock comparison
    const variants = (shopifyData.variants?.edges || []).map(edge => ({
      sku: edge.node.sku,
      barcode: edge.node.barcode,
      inventory: edge.node.inventoryQuantity,
      options: edge.node.selectedOptions.reduce((acc, opt) => {
        acc[opt.name] = opt.value;
        return acc;
      }, {})
    }));

    console.log(`💰 Fiyat ve Varyant Bilgisi (${code}): Price=${price}, Variants=${variants.length}`);

    res.json({ url, handle: shopifyData.handle, images, price, compareAtPrice, currency, variants, found: true });
  } else {
    res.json({ found: false, error: 'Shopify\'da bulunamadi' });
  }
});

// 4. AI Metin Üretimi (Gelişmiş Fallback Mekanizması)
app.post('/api/generate-text', authenticate, async (req, res) => {
  try {
    const { product, products } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'API Key eksik' });

    // Handle single or multiple products
    const productList = products || (product ? [product] : []);

    if (productList.length === 0) {
      return res.status(400).json({ error: 'Ürün bilgisi gerekli' });
    }

    let productDetails = '';
    productList.forEach((p, index) => {
      productDetails += `
    --- Ürün ${index + 1} ---
    - Ürün Adı: ${p.name}
    - Marka: ${p.brand}
    - Renk: ${p.color}
    - Fiyat: ${p.price}
    - Stok Durumu: ${p.stockStatus}
    - Mevcut Bedenler: ${p.sizes || '-'}
    - Kategori: ${p.category}
    - Ürün Linki: ${p.url}
        `;
    });

    const prompt = `
      Sen profesyonel bir butik/mağaza satış danışmanısın. Müşteriye Instagram DM üzerinden gönderilecek bir yanıt hazırlıyorsun.
      Müşteri ${productList.length > 1 ? 'birden fazla ürün' : 'bir ürün'} hakkında bilgi istedi.
      
      Ürün Bilgileri:
      ${productDetails}
      
      KURALLAR (KESİNLİKLE UY):
      1. MAKSİMUM 600 KARAKTER kullan. (Çok önemli, Instagram mesaj sınırını aşma).
      2. MARKDOWN YILDIZ (*) ASLA KULLANMA. Kalın yazmak için önemli yerleri BÜYÜK HARFLE yaz veya emoji ile vurgula.
      3. Tonun samimi ve enerjik olsun ("Selamlar", "Harika seçim" vb.)
      4. "Tükendi" deme, "Stoklar güncelleniyor" veya "Alternatiflerimize göz at" de.
      5. Her ürünün linkini mesajın en sonuna ekle:
         "👇 Ürünleri İncele:
         [Ürün Adı]: [Link]"
      6. Paragraf yazma, kısa ve net cümleler kur.
      7. Fiyat bilgisini net ver.
    `;

    // Denenecek modeller listesi (Biri çalışmazsa diğerine geç)
    const models = [
      'gemini-2.5-flash',
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-pro',
      'gemini-1.0-pro'
    ];

    let lastError = null;
    let successText = null;

    for (const model of models) {
      try {
        console.log(`🤖 Model deneniyor: ${model} `);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await axios.post(url, {
          contents: [{ parts: [{ text: prompt }] }]
        });

        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          successText = response.data.candidates[0].content.parts[0].text;
          console.log(`✅ Başarılı Model: ${model}`);
          break; // Döngüyü kır, sonucu bulduk
        }
      } catch (err) {
        console.error(`❌ ${model} başarısız:`, err.message);
        lastError = err;
        // Devam et, sıradaki modeli dene
      }
    }

    if (successText) {
      res.json({ text: successText });
    } else {
      throw lastError || new Error('Hiçbir AI modeli yanıt vermedi.');
    }

  } catch (error) {
    console.error('AI Error:', error.response?.data || error.message);
    const detailedError = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: `AI Hatası: ${detailedError}` });
  }
});

// 5. CRON JOB (Vercel için)
// Bu endpoint Vercel Cron tarafından 5-10 dakikada bir tetiklenecek
app.get('/api/cron', async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 10 * 60 * 1000); // 10 dk öncesine bak (garanti olsun)
    const dateStr = formatDateForAPI(fiveMinutesAgo);

    console.log(`⏰ Cron Çalıştı: ${dateStr} sonrası değişiklikler...`);

    const response = await makeStealthRequest('/product/list/', {
      updated_at_start: dateStr,
      limit: 100
    });

    const updates = response.data.results || response.data.data || [];

    if (updates.length > 0) {
      await syncToSupabase(updates);
      console.log(`✅ ${updates.length} ürün güncellendi.`);

      // Log to Supabase
      try {
        await supabaseAPI.post('/sync_history', {
          item_count: updates.length,
          changed_products: updates.map(p => p.code).slice(0, 50) // Max 50 item code
        });
      } catch (logErr) {
        console.error('Loglama hatası:', logErr.message);
      }

      res.json({ status: 'updated', count: updates.length });
    } else {
      console.log('💤 Değişiklik yok.');

      // Opsiyonel: Boş çalıştırmaları da loglayabiliriz ama tabloyu şişirmemek için sadece değişenleri logluyorum
      // İsterseniz burayı açabilirsiniz

      res.json({ status: 'no_changes' });
    }

  } catch (error) {
    console.error('Cron Hatası:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 6. Admin Diagnostic Endpoints
app.get('/api/admin/diagnostics', authenticate, async (req, res) => {
  try {
    // Defensive fetching: return empty array if table doesn't exist or request fails
    const fetchTable = async (table, params) => {
      try {
        const resp = await supabaseAPI.get(table, { params });
        return resp.data || [];
      } catch (err) {
        console.error(`⚠️ Admin Diagnostic fetch failed for ${table}:`, err.message);
        return [];
      }
    };

    const [mismatches, logs, overrides] = await Promise.all([
      fetchTable('/mismatch_diagnostics', { order: 'timestamp.desc', limit: 50 }),
      fetchTable('/system_logs', { order: 'timestamp.desc', limit: 50 }),
      fetchTable('/matching_overrides', { order: 'created_at.desc' })
    ]);

    res.json({
      success: true,
      mismatches,
      logs,
      overrides
    });
  } catch (error) {
    console.error('🔴 Admin Diagnostic Critical Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/match-override', authenticate, async (req, res) => {
  try {
    const { hamur_code, shopify_handle } = req.body;
    if (!hamur_code || !shopify_handle) return res.status(400).json({ error: 'Hamur kodu ve Shopify handle gerekli' });

    // Upsert override
    const { data, error } = await supabaseAPI.post('/matching_overrides', {
      hamur_code,
      shopify_handle,
      created_at: new Date().toISOString()
    }, {
      headers: { 'Prefer': 'resolution=merge-duplicates' }
    });

    // Clear cache for this SKU
    shopifyCache.del(`shopify_${hamur_code}`);

    res.json({ success: true, message: 'Eşleştirme başarıyla kaydedildi.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/delete-override', authenticate, async (req, res) => {
  try {
    const { hamur_code } = req.body;
    await supabaseAPI.delete('/matching_overrides', { params: { hamur_code: `eq.${hamur_code}` } });
    shopifyCache.del(`shopify_${hamur_code}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Sistem Durumu (Cron Geçmişi)
app.get('/api/system-status', authenticate, async (req, res) => {
  try {
    const response = await supabaseAPI.get('/sync_history', {
      params: {
        select: '*',
        order: 'processed_at.desc',
        limit: 10
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Status Error:', error.message);
    res.status(500).json({ error: 'Durum bilgisi alınamadı' });
  }
});

// 7. Manuel Senkronizasyon (Force Sync via Code)
app.get('/api/force-sync', authenticate, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Ürün kodu gerekli (code)' });

    console.log(`🚀 Force Sync Başlatıldı: ${code}`);

    // Hamurlabs'ten tüm kayıtları ara (search parametresiyle)
    const response = await makeStealthRequest('/product/list/', {
      code: code,
      limit: 50 // Garanti olsun
    });

    const products = response.data.results || response.data.data || [];

    if (products.length > 0) {
      // Bulunan tüm kayıtları sync ve merge işlemine sok
      await syncToSupabase(products);

      console.log(`✅ Force Sync Tamam: ${products.length} kayıt işlendi.`);
      res.json({ status: 'success', message: `${products.length} kayıt birleştirildi ve güncellendi.`, products: products.map(p => ({ code: p.code, name: p.options?.['Ana Renk'] })) });
    } else {
      console.log('⚠️ Force Sync: Kayıt bulunamadı.');
      res.json({ status: 'not_found', message: 'Hamurlabs tarafında bu kodla ürün bulunamadı.' });
    }

  } catch (error) {
    console.error('Force Sync Hatası:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server if not running on Vercel
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Serverless-Ready Server running on port ${PORT}`);
  });
}

module.exports = app;
