const axios = require('axios');
require('dotenv').config();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function checkShopifyBarcode(barcode) {
    const query = `
    query($query: String!) {
      productVariants(first: 5, query: $query) {
        edges {
          node {
            id
            title
            sku
            barcode
            inventoryQuantity
            product {
              title
              handle
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
                variables: { query: `barcode:${barcode}` }
            },
            {
                headers: {
                    'X-Shopify-Access-Token': SHOPIFY_TOKEN,
                    'Content-Type': 'application/json',
                },
            }
        );

        const variants = response.data?.data?.productVariants?.edges || [];
        console.log(`Found ${variants.length} variants on Shopify for barcode ${barcode}`);

        variants.forEach(({ node: v }) => {
            console.log(`\nProduct: ${v.product.title}`);
            console.log(`Variant: ${v.title}`);
            console.log(`SKU: ${v.sku}`);
            console.log(`Inventory: ${v.inventoryQuantity}`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

const barcode = process.argv[2] || '4587100469600';
checkShopifyBarcode(barcode);
