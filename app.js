const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');
const mongoose = require('mongoose');

const server = process.env.DB_ADDRESS;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;
const database = process.env.DB_NAME;
const dbPort = process.env.DB_PORT;
const todaysorders = require('./model');
const uri = `mongodb://${user}:${pass}@${server}:${dbPort}/${database}?authSource=admin`;

const app = express();
const port = process.env.PORT;

app.use(express.json({limit: '50mb'}));


app.get('/api/connectionTest', (req, res) => {
  res.send(`${process.env.NAME} online`);
});

app.get('/api/syncOrders', async (req, res) => {
  if (req.body.key !== process.env.SYNC_KEY)
    return res.status(403).send('Forbidden');

  const clientOrders = req.body.orders;
  const shop = req.body.shop;
  const till = req.body.till;

  const dbOrders = await todaysorders.find({ shop }).exec();

  const ordersToDeleteOnDb = [];
  const ordersMissingFromDb = [];
  const ordersToDeleteOnClient = [];
  const ordersMissingFromClient = [];

  // check for deleted orders and orders missing from db
  clientOrders.forEach((clientOrder) => {
    let foundInDb = false;
    dbOrders.forEach((dbOrder) => {
      if (clientOrder.time === dbOrder.time) {
        // The order has been found
        if (clientOrder.deleted && !dbOrder.deleted) {
          ordersToDeleteOnDb.push(clientOrder);
        }
        foundInDb = true;
      }
    });
    if (!foundInDb) {
      ordersMissingFromDb.push(clientOrder);
    }
  });

  // update the relevant orders in the db
  await todaysorders.insertMany(ordersMissingFromDb);

  ordersToDeleteOnDb.forEach(async (deletedOrder) => {
    await todaysorders.findOneAndUpdate(
      { time: deletedOrder.time },
      { deleted: true }
    );
  });

  // check for orders missing from client and orders deleted on DB but not client
  dbOrders.forEach((dbOrder) => {
    let foundInClient = false;
    clientOrders.forEach((clientOrder) => {
      if (clientOrder.time === dbOrder.time) {
        // The order has been found
        if (!clientOrder.deleted && dbOrder.deleted) {
          ordersToDeleteOnClient.push(dbOrder);
        }
        foundInClient = true;
      }
    });
    if (!foundInClient) {
      ordersMissingFromClient.push(dbOrder);
    }
  });

  res.status(200).json({
    missingOrders: ordersMissingFromClient,
    deletedOrders: ordersToDeleteOnClient,
  });
});

app.listen(port, () => {
  console.log(`POS-server listening on port ${port}`);
});

mongoose.connect(uri);

const connection = mongoose.connection;

connection.once('open', function () {
  console.log('MongoDB connection established successfully');
});
