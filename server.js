const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

    // Merge Metas (Variants)
    const existingMetas = existing.data.metas || [];
    const newMetas = p.metas || [];
    const metaMap = new Map();
    [...existingMetas, ...newMetas].forEach(m => metaMap.set(m.id || m.barcode || Math.random(), m));
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
app.get('/api/products', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    // Direkt Supabase'den çek
    const response = await supabaseAPI.get('/products', {
      params: {
        select: '*',
        limit: limit,
        order: 'updated_at.desc'
      }
    });

    // Frontend'in beklediği format
    const results = response.data.map(item => item.data || item); // item.data varsa onu, yoksa kendisini

    res.json({
      total_count: results.length,
      limit,
      data: results
    });

  } catch (error) {
    console.error('Error fetching products:', error.message);
    res.status(500).json({ error: 'Veri çekilemedi' });
  }
});

// 2. Arama (Supabase Full Text Search)
app.get('/api/products/search', async (req, res) => {
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
app.get('/api/stock', async (req, res) => {
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
  const cleanSku = sku.replace(/^2/, ''); // Başındaki 2'yi atıp dene (opsiyonel ama yaygın bir patern)

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
    console.log(`🔍 Shopify'da aranan SKU: ${sku} (veya ${cleanSku})`);
    const response = await axios.post(
      `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/graphql.json`,
      {
        query,
        variables: { query: sku }
      },
      {
        headers: {
          'X-Shopify-Access-Token': SHOPIFY_TOKEN,
          'Content-Type': 'application/json',
        },
      }
    );

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

    return bestMatch;
  } catch (error) {
    console.error('❌ Shopify API Hatası:', error.response?.data || error.message);
    return null;
  }
}

// 3.5 Shopify Product Link Endpoint
app.get('/api/shopify-product', async (req, res) => {
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

    console.log(`💰 Fiyat Bilgisi (${code}): Price=${price}, Compare=${compareAtPrice} (Variant SKU: ${variant?.sku})`);

    res.json({ url, handle: shopifyData.handle, images, price, compareAtPrice, currency, found: true });
  } else {
    res.json({ found: false, error: 'Shopify\'da bulunamadi' });
  }
});

// 4. AI Metin Üretimi (Gelişmiş Fallback Mekanizması)
app.post('/api/generate-text', async (req, res) => {
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

// 6. Sistem Durumu (Cron Geçmişi)
app.get('/api/system-status', async (req, res) => {
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
app.get('/api/force-sync', async (req, res) => {
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
