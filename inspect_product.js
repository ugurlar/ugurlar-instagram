const axios = require('axios');
require('dotenv').config();

const API_BASE_URI = process.env.HAMURLAB_API_BASE_URI;
const API_USERNAME = process.env.HAMURLAB_API_USERNAME;
const API_PASSWORD = process.env.HAMURLAB_API_PASSWORD;

const authString = Buffer.from(`${API_USERNAME}:${API_PASSWORD}`).toString('base64');

async function inspectProduct(code) {
    try {
        const response = await axios.get(`${API_BASE_URI}/product/list/`, {
            params: { code, limit: 10 },
            headers: {
                'Authorization': `Basic ${authString}`,
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'application/json'
            }
        });

        const results = response.data.results || response.data.data || [];
        console.log(`Found ${results.length} products for code ${code}`);

        results.forEach(p => {
            console.log(`\nProduct: ${p.name} (Code: ${p.code})`);
            console.log(`Color: ${p.options?.['Ana Renk']}`);
            console.log(`Is Stock: ${p.is_stock}`);
            console.log(`Variants:`);
            p.metas.forEach(m => {
                console.log(`  - ${JSON.stringify(m)}`);
            });
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

const code = process.argv[2] || 'B00041';
inspectProduct(code);
