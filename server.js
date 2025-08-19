// server.js
const express = require('express');
const bodyParser = require('body-parser');
const { loginToWebsite } = require('./browser');

const app = express();
const PORT = process.env.PORT || 3000;

const sleep = ms => new Promise(res => setTimeout(res, ms));

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Health check
app.get('/', (req, res) => {
  res.send('Puppeteer Automation Server is running! 🚀');
});

// POST endpoint for n8n
app.post('/login', async (req, res) => {
  const inputData = req.body;

  console.log('📩 Received login request:', inputData.site?.name || 'Unknown');
  console.log(inputData.name);

  // Validate required fields
  if (!inputData.name) {
    return res.status(200).json({
      success: false,
      message: 'Missing required fields: site, login, password',
    });
  }

  let attempt = 1;
  let done = false;
  let result;
  let retries = 10;

  while (!done) {
    // console.log('attempt: ', attempt);

    result = await loginToWebsite(inputData);
    if (result.success) {
      done = true;
    }
    attempt++;
    if (attempt >= retries) {
      done = true;
    }
    sleep(1500);
  }


  // Return result to n8n
  return res.status(200).json(result);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('👋 Shutting down gracefully...');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`📌 Send POST requests to http://localhost:${PORT}/login`);
  console.log(`💡 n8n should send one site at a time`);
});