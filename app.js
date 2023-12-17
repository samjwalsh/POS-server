const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');
const mongoose = require('mongoose');

const server = process.env.DB_ADDRESS;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;
const database = process.env.DB_NAME;
const dbPort = process.env.DB_PORT;
const todaysOrders = require('./model');
const uri = `mongodb://${user}:${pass}@${server}:${dbPort}/${database}?authSource=admin`;

const app = express();
const port = process.env.PORT;

app.use(express.json());

app.get('/api/connectionTest', (req, res) => {
  res.send(`${process.env.NAME} online`);
});

app.get('/api/syncOrders', async (req, res) => {
  if (req.body.key !== process.env.SYNC_KEY)
    return res.status(403).send('Forbidden');

  const receivedOrders = req.body.orders;
  const shop = req.body.shop;
  const till = req.body.till;

  const dbOrders = await todaysOrders.find({shop}).exec();
  console.log(dbOrders);

  res.status(200).send('yesh');
});

app.listen(port, () => {
  console.log(`POS-server listening on port ${port}`);
});

mongoose.connect(uri);

const connection = mongoose.connection;

connection.once('open', function () {
  console.log('MongoDB connection established successfully');
});
