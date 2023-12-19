const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');
const app = express();
const port = process.env.PORT;

app.use(express.json({ limit: '50mb' }));

app.get('/api/connectionTest', (req, res) => {
  res.send(`${process.env.NAME} online`);
});

app.use(require('./controllers/orderSyncController'))

app.listen(port, () => {
  console.log(`POS-server listening on port ${port}`);
});

