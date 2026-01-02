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

  const formattedProducts = products.map(p => ({
    code: p.code || p.sku || 'unknown-' + Math.random(),
    name: p.name || p.title || '-',
    barcode: p.barcode || (p.metas && p.metas[0] ? p.metas[0].barcode : null),
    brand: p.brand || p.options?.Marka || null,
    price: p.selling_price ? String(p.selling_price) : null,
    stock_status: p.is_stock ? 'Var' : 'Yok',
    category: (p.categories && p.categories[0]) || null,
    data: p
  }));

  const uniqueProducts = Array.from(new Map(formattedProducts.map(item => [item.code, item])).values());

  try {
    await supabaseAPI.post('/products', uniqueProducts);
    console.log(`☁️ ${uniqueProducts.length} ürün Supabase'e gönderildi.`);
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
      is_stock: item.stock_status === 'Var'
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

// 4. AI Metin Üretimi
app.post('/api/generate-text', async (req, res) => {
  try {
    const { product } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'API Key eksik' });

    const prompt = `
      Sen profesyonel bir sosyal medya satış danışmanısın. Aşağıdaki ürün bilgileriyle, müşteriye Instagram DM üzerinden gönderilecek, 
      samimi, emojili, heyecan verici ve ikna edici bir satış metni hazırla.
      
      Ürün Bilgileri:
      Adı: ${product.name}
      Marka: ${product.brand}
      Renk: ${product.color}
      Fiyat: ${product.price}
      Stok Durumu: ${product.stockStatus}
      Kategori: ${product.category}
      
      Kurallar:
      1. Samimi bir dil kullan ("Merhaba canım", "Harika bir seçim" vb.).
      2. Ürünün özelliklerini (marka, renk) öne çıkar.
      3. Fiyat avantajını vurgula.
      4. Emojiler kullan (✨, 👗, 🔥 vb.).
      5. "Sipariş oluşturmak için bilgilerini alabilir miyim?" ile bitir.
      6. Kısa tut.
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const response = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Metin üretilemedi');

    res.json({ text });

  } catch (error) {
    console.error('AI Error:', error.message);
    res.status(500).json({ error: 'AI Hatası' });
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
      res.json({ status: 'updated', count: updates.length });
    } else {
      console.log('💤 Değişiklik yok.');
      res.json({ status: 'no_changes' });
    }

  } catch (error) {
    console.error('Cron Hatası:', error.message);
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
