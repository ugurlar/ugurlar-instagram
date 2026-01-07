const axios = require('axios');
require('dotenv').config();

const API_BASE_URI = process.env.HAMURLAB_API_BASE_URI;
const API_USERNAME = process.env.HAMURLAB_API_USERNAME;
const API_PASSWORD = process.env.HAMURLAB_API_PASSWORD;

const authString = Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64');

async function checkHamurlabs() {
    const targetCode = process.argv[2] || 'B00041';
    console.log(`Hamurlabs'ten ham veri çekiliyor (${targetCode})...`);

    const paramsToTry = [
        { q: targetCode },
        { search: targetCode },
        { code: targetCode },
        { product_code: targetCode },
        { barcode: targetCode }
    ];

    for (const params of paramsToTry) {
        console.log(`\n🔎 Parametreler deneniyor: ${JSON.stringify(params)}`);
        try {
            const response = await axios.get(`${API_BASE_URI}/product/list/`, {
                params: { ...params, limit: 10 },
                headers: {
                    'Authorization': `Basic ${authString}`,
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)',
                    'Accept': 'application/json'
                }
            });

            const results = response.data.results || response.data.data || [];
            console.log(`✅ Sonuç Sayısı: ${results.length}`);

            if (results.length > 0) {
                results.forEach((p, idx) => {
                    console.log(`   [${idx + 1}] Kod: ${p.code} | Renk: ${p.options?.['Ana Renk'] || '-'} | Varyant: ${p.metas?.length}`);
                });
            }
        } catch (error) {
            console.error('❌ Hata:', error.response ? error.response.status : error.message);
        }
    }
}

checkHamurlabs();
