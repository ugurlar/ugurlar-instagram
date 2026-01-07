const axios = require('axios');
require('dotenv').config();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function checkShopifyProduct(handle) {
    const query = `
    query($handle: String!) {
      product(handle: $handle) {
        title
        variants(first: 50) {
          edges {
            node {
              title
              sku
              barcode
              inventoryQuantity
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
                variables: { handle }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_TOKEN,
                    'Content-Type': 'application/json',
                },
            }
        );

        const v = response.data?.data?.product;
        if (!v) {
            console.log("Product not found");
            return;
        }
        console.log(`Product: ${v.title}`);
        v.variants.edges.forEach(({ node: v }) => {
            console.log(`  - ${v.title} | SKU: ${v.sku} | Barcode: ${v.barcode} | Stock: ${v.inventoryQuantity}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

const handle = process.argv[2] || 'faik-sonmez-kadin-kaban-2b00041';
checkShopifyProduct(handle);
