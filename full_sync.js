const axios = require('axios');
require('dotenv').config();

// CONFIGURATION
const HAMURLAB_API_BASE_URI = process.env.HAMURLAB_API_BASE_URI;
const HAMURLAB_API_USERNAME = process.env.HAMURLAB_API_USERNAME;
const HAMURLAB_API_PASSWORD = process.env.HAMURLAB_API_PASSWORD;

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const authString = Buffer.from(`${HAMURLAB_API_USERNAME}:${HAMURLAB_API_PASSWORD}`).toString('base64');

// Axios instance for Supabase API
const supabaseAPI = axios.create({
    baseURL: `${SUPABASE_URL}/rest/v1`,
    headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }
});

const userAgents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

function getRandomUserAgent() {
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

async function makeStealthRequest(endpoint, params = {}) {
    return axios.get(`${HAMURLAB_API_BASE_URI}${endpoint}`, {
        params,
        headers: {
            'Authorization': `Basic ${authString}`,
            'User-Agent': getRandomUserAgent(),
            'Accept': 'application/json'
        }
    });
}

const globalMergedMap = new Map();

function processAndMergeBatch(products) {
    products.forEach(p => {
        const code = p.code || p.sku || 'unknown-' + Math.random();

        if (!globalMergedMap.has(code)) {
            globalMergedMap.set(code, {
                code: code,
                name: p.name || p.title || '-',
                barcode: p.barcode || (p.metas && p.metas[0] ? p.metas[0].barcode : null),
                brand: p.brand || p.options?.Marka || null,
                price: p.selling_price ? String(p.selling_price) : null,
                stock_status: p.is_stock ? 'Var' : 'Yok',
                category: (p.categories && p.categories[0]) || null,
                data: JSON.parse(JSON.stringify(p))
            });
        } else {
            const existing = globalMergedMap.get(code);

            const existingMetas = existing.data.metas || [];
            const newMetas = p.metas || [];
            const metaMap = new Map();
            [...existingMetas, ...newMetas].forEach(m => metaMap.set(m.id || m.barcode || Math.random(), m));
            existing.data.metas = Array.from(metaMap.values());

            const existingImages = existing.data.images || [];
            const newImages = p.images || [];
            existing.data.images = [...new Set([...existingImages, ...newImages])];

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

            if (p.is_stock) {
                existing.stock_status = 'Var';
                existing.data.is_stock = true;
            }
        }
    });
}

async function uploadToSupabase(products) {
    if (products.length === 0) return;
    try {
        await supabaseAPI.post('/products', products);
        console.log(`☁️  ${products.length} ürün Supabase'e güncellendi.`);
    } catch (err) {
        console.error('Supabase Error:', err.response?.data || err.message);
    }
}

async function startFullSync() {
    console.log("🚀 CORRECTED FULL SYNC Başlatılıyor (Global Aggregation)...");
    let offset = 0;
    const limit = 100;
    let hasMore = true;
    let totalFetched = 0;

    while (hasMore) {
        try {
            console.log(`📡 Veri çekiliyor (Offset: ${offset})...`);
            const response = await makeStealthRequest('/product/list/', { limit, offset });
            const products = response.data.results || response.data.data || [];

            if (products.length > 0) {
                processAndMergeBatch(products);
                totalFetched += products.length;
                console.log(`✅ ${totalFetched} kayıt hafızada birleştirildi.`);
                offset += limit;
                await new Promise(r => setTimeout(r, 100));
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error(`❌ Hata (Offset: ${offset}):`, error.message);
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    const finalProducts = Array.from(globalMergedMap.values());
    console.log(`\n📦 Bağımsız Ürün Sayısı: ${finalProducts.length}`);
    console.log(`📤 Supabase'e yükleniyor (batchler halinde)...`);

    const uploadBatchSize = 500;
    for (let i = 0; i < finalProducts.length; i += uploadBatchSize) {
        const batch = finalProducts.slice(i, i + uploadBatchSize);
        await uploadToSupabase(batch);
    }

    console.log(`🎉 TÜM İŞLEM TAMAMLANDI. Toplam: ${finalProducts.length} birleşmiş ürün.`);
}

startFullSync();
