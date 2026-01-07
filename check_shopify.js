const axios = require('axios');
require('dotenv').config();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function checkShopify(sku) {
  console.log(`Shopify'da SKU: ${sku} aranıyor...`);

  const query = `
    query($query: String!) {
      products(first: 5, query: $query) {
        edges {
          node {
            id
            title
            handle
            options {
              name
              values
            }
            variants(first: 50) {
              edges {
                node {
                  id
                  sku
                  title
                  selectedOptions {
                    name
                    value
                  }
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

    const products = response.data.data.products.edges;
    if (products.length === 0) {
      console.log("Shopify'da ürün bulunamadı.");
      return;
    }

    products.forEach(({ node: p }) => {
      console.log(`\n--- Shopify Ürünü: ${p.title} ---`);
      console.log(`ID: ${p.id}`);
      console.log(`Handle: ${p.handle}`);

      console.log("\nSeçenekler:");
      p.options.forEach(opt => {
        console.log(` - ${opt.name}: ${opt.values.join(', ')}`);
      });

      console.log("\nVaryantlar:");
      p.variants.edges.forEach(({ node: v }) => {
        console.log(` - [${v.sku}] ${v.title}`);
      });
    });

  } catch (error) {
    console.error('Shopify Error:', error.response?.data || error.message);
  }
}

const sku = process.argv[2] || 'B00041';
checkShopify(sku);
