const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = process.env.PORT;

app.use(express.json({ limit: '50mb' }));

const server = process.env.DB_ADDRESS;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;
const database = process.env.DB_NAME;
const dbPort = process.env.DB_PORT;
const uri = `mongodb://${user}:${pass}@${server}:${dbPort}/${database}?authSource=admin`;

mongoose.connect(uri);

app.get('/api/connectionTest', (req, res) => {
  res.send(`${process.env.NAME} online`);
});

app.use(require('./controllers/orderSyncController'))

app.use(require('./controllers/voucherController'))

app.listen(port, () => {
  console.log(`POS-server listening on port ${port}`);
});

