const axios = require('axios');
require('dotenv').config();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function getShopifyProductHandle(sku) {
  const query = `
    query($query: String!) {
      products(first: 5, query: $query) {
        edges {
          node {
            id
            handle
            title
            variants(first: 50) {
              edges {
                node {
                  id
                  sku
                  barcode
                  inventoryQuantity
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

    const products = response.data?.data?.products?.edges || [];
    if (products.length === 0) {
      console.log("No products found for", sku);
      return;
    }

    products.forEach(({ node: p }) => {
      console.log(`\nProduct: ${p.title} (Handle: ${p.handle})`);
      p.variants.edges.forEach(({ node: v }) => {
        const opts = v.selectedOptions.map(o => `${o.name}: ${o.value}`).join(', ');
        console.log(`  - Variant: SKU=${v.sku}, Barcode=${v.barcode}, Stock=${v.inventoryQuantity} | ${opts}`);
      });
    });

  } catch (error) {
    console.error('Error:', error.message);
  }
}

const sku = process.argv[2] || 'B00041';
getShopifyProductHandle(sku);
