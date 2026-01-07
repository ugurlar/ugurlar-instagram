const axios = require('axios');
require('dotenv').config();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function testPrice(sku) {
    console.log(`🔍 Shopify'da SKU: ${sku} için fiyat aranıyor...`);

    const query = `
    query($query: String!) {
      products(first: 5, query: $query) {
        edges {
          node {
            id
            title
            handle
            variants(first: 10) {
              edges {
                node {
                  id
                  sku
                  price
                  compareAtPrice
                }
              }
            }
          }
        }
      }
    }
  `;

    try {
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

        console.log('--- RAW RESPONSE (truncated) ---');
        console.log(JSON.stringify(response.data, null, 2).slice(0, 1000));

        const edges = response.data?.data?.products?.edges;
        if (!edges || edges.length === 0) {
            console.log("❌ Ürün bulunamadı.");
            return;
        }

        edges.forEach(({ node: p }) => {
            console.log(`\n📦 Ürün: ${p.title} (${p.handle})`);
            p.variants.edges.forEach(({ node: v }) => {
                console.log(`  🔹 Varyant SKU: ${v.sku}`);
                console.log(`     Fiyat: ${v.price}`);
                console.log(`     İndirimli Fiyat: ${v.compareAtPrice}`);
            });
        });

    } catch (error) {
        console.error('❌ Shopify Error:', error.response?.data || error.message);
    }
}

const sku = process.argv[2] || 'B00041';
testPrice(sku);
