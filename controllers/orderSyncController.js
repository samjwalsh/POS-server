const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');
const mongoose = require('mongoose');

const auth = require('./authController');

const app = express.Router();

const server = process.env.DB_ADDRESS;
const user = process.env.DB_USER;
const pass = process.env.DB_PASS;
const database = process.env.DB_NAME;
const dbPort = process.env.DB_PORT;
const todaysorders = require('../models/todaysorders/todaysOrderSchema');
const Day = require('../models/daySheets/daySchema');

const connection = mongoose.connection;

connection.once('open', function () {
  console.log('MongoDB connection established successfully');
});

app.get('/api/syncOrders', auth, async (req, res) => {
  const startTime = new Date();

  const clientOrders = req.body.orders;
  const shop = req.body.shop;
  const till = req.body.till;

  const dbOrders = await todaysorders.find({ shop }).exec();

  const ordersToAddInDB = [];
  const orderIdsToDeleteInDb = [];
  const orderIdsToEodInDb = [];

  const ordersToAddInClient = [];
  const orderIdsToDeleteInClient = [];
  const orderIdsToEodFullyInClient = [];

  // check if any of the orders sent by the client are supposed to be EODed, and if they are mark them as EOD in todaysorders so that they will then be eoded again and the correct IDs will be sent back to the client
  let datesOfAllClientOrders = [];
  for (const order of clientOrders)
    datesOfAllClientOrders.push(
      new Date(order.time).toLocaleDateString('en-ie')
    );

  datesOfAllClientOrders = [...new Set(datesOfAllClientOrders)];

  const daySheets = await Day.find({ date: { $in: datesOfAllClientOrders } });
  let allEODedOrders = [];

  for (const daySheet of daySheets) {
    for (const EodSheet of daySheet.shops) {
      if (EodSheet.shop === shop) {
        allEODedOrders = allEODedOrders.concat(EodSheet.orders);
      }
    }
  }

  for (const EODedOrder of allEODedOrders) {
    for (const clientOrder of clientOrders) {
      if (EODedOrder.id === clientOrder.id) {
        clientOrder.eod = true;
      }
    }
  }

  // Find orders which are missing in DB or need to be deleted in client or DB
  for (const clientOrder of clientOrders) {
    let orderFoundInDb = false;
    for (const dbOrder of dbOrders) {
      if (clientOrder.id == dbOrder.id) {
        // This means the DB has the order
        orderFoundInDb = true;
        // But now check if it is fully up to date with the client
        // Check if it is deleted on client but not DB
        if (clientOrder.deleted && !dbOrder.deleted) {
          orderIdsToDeleteInDb.push(dbOrder.id);
        } else if (!clientOrder.deleted && dbOrder.deleted) {
          // Check if it is deleted on DB but not client
          orderIdsToDeleteInClient.push(dbOrder.id);
        }

        if (clientOrder.eod && !dbOrder.eod) {
          orderIdsToEodInDb.push(dbOrder.id);
        }

        break;
      }
    }
    // Given the order is missing, check if should be added to todays orders and if it should be EODed after
    if (!orderFoundInDb) {
      ordersToAddInDB.push(clientOrder);
    }
  }

  // Now find orders which are missing in client
  for (const dbOrder of dbOrders) {
    let orderFoundInClient = false;
    for (const clientOrder of clientOrders)
      if (clientOrder.id === dbOrder.id) {
        orderFoundInClient = true;
        break;
      }
    if (!orderFoundInClient) {
      ordersToAddInClient.push(dbOrder);
    }
  }

  try {
    // Add any orders that were missing
    await todaysorders.insertMany(ordersToAddInDB);
  } catch (e) {
    console.log(e);
  }

  try {
    // Delete any orders that should havebeen deleted
    await todaysorders
      .updateMany({ id: { $in: orderIdsToDeleteInDb } }, { deleted: true })
      .exec();
  } catch (e) {
    console.log(e);
  }

  try {
    // EOD any orders that should have been EODed
    await todaysorders
      .updateMany({ id: { $in: orderIdsToEodInDb } }, { eod: true })
      .exec();
  } catch (e) {
    console.log(e);
  }

  // first create an array of all of the orders that we are supposed to EOD
  const ordersToEodInDb = await todaysorders.find({ shop, eod: true }).exec();

  // Then create an array of all the unique dates contained within the orders
  let dates = [];
  for (const order of ordersToEodInDb)
    dates.push(new Date(order.time).toLocaleDateString('en-ie'));

  dates = [...new Set(dates)];
  // put each order into its appropriate day sheet
  for (const date of dates) {
    if ((await Day.findOne({ date }).exec()) == null) {
      //create the day sheet
      const daySheet = new Day();
      daySheet.date = date;
      daySheet.shops = [];
      await daySheet.save();
    }

    const daySheet = await Day.findOne({ date }).exec();

    const orders = [];
    for (const order of ordersToEodInDb) {
      if (new Date(order.time).toLocaleDateString('en-ie') === date) {
        orders.push({
          id: order.id,
          time: order.time,
          shop: order.shop,
          till: order.till,
          deleted: order.deleted,
          subtotal: order.subtotal,
          paymentMethod: order.paymentMethod,
          items: order.items,
        });
      }
    }
    // Now we have an array of orders that can go into the current daySheet

    // Look for an already created EOD sheet
    let endOfDaySheetIndex = -1;
    for (const [index, endOfDaySheet] of daySheet.shops.entries()) {
      if (endOfDaySheet.shop === shop) endOfDaySheetIndex = index;
    }
    if (endOfDaySheetIndex < 0) {
      daySheet.shops.push({
        shop,
        orders,
      });
    } else {
      // We need to check that these orders aren't already in the EOD sheet
      for (const orderToEod of orders) {
        let unique = true;
        for (const order of daySheet.shops[endOfDaySheetIndex].orders) {
          if (order.id === orderToEod.id) {
            unique = false;
            // If we know the order isn't unique, we might need to set its deleted flag
            if (orderToEod.deleted && !order.deleted) {
              order.deleted = true;
            }
            break;
          }
        }
        if (unique) {
          daySheet.shops[endOfDaySheetIndex].orders.push(orderToEod);
        }
      }
    }
    await daySheet.save();
    for (const order of orders) {
      orderIdsToEodFullyInClient.push(order.id);
    }
  }

  await todaysorders
    .deleteMany({ id: { $in: orderIdsToEodFullyInClient } })
    .exec();

  console.log(
    `Sync Orders(${new Date() - startTime}ms)[${shop}-${till}]: ${
      ordersToAddInDB.length
    }-${orderIdsToDeleteInDb.length}-${ordersToEodInDb.length} ${
      ordersToAddInClient.length
    }-${orderIdsToDeleteInClient.length}-${orderIdsToEodFullyInClient.length}`
  );

  res.status(200).json({
    missingOrders: ordersToAddInClient,
    deletedOrderIds: orderIdsToDeleteInClient,
    completedEodIds: orderIdsToEodFullyInClient,
    ordersMissingInDb: ordersToAddInDB.length,
    ordersDeletedInDb: orderIdsToDeleteInDb.length,
    eodsCompletedInDb: ordersToEodInDb.length,
  });
});


module.exports = app;
