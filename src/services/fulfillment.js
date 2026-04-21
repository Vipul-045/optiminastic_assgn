const axios = require('axios');

async function callFulfillmentAPI(order) {
  const response = await axios.post('https://jsonplaceholder.typicode.com/posts', {
    userId: order.client_id,
    title:  `Order ${order.id} — $${order.amount}`,
  });

  // jsonplaceholder echoes back an id — we use that as the fulfillment ID
  return String(response.data.id);
}

module.exports = { callFulfillmentAPI };