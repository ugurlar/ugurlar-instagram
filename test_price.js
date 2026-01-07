const axios = require('axios');
require('dotenv').config();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function testPrice(sku) {
    const query = `
    query($query: String!) {
      products(first: 1, query: $query) {
        edges {
          node {
            id
            handle
            title
            variants(first: 1) {
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

        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error:', error.response?.data || error.message);
    }
}

const sku = process.argv[2] || 'B00041';
testPrice(sku);
