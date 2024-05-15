const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');
const mongoose = require('mongoose');

const auth = require('./authController');

const app = express.Router();

const todaysorders = require('../models/todaysorders/todaysOrderSchema');
const Day = require('../models/daySheets/daySchema');

const connection = mongoose.connection;

connection.once('open', function () {
  console.log('MongoDB connection established successfully');
});

const Timer = class {
  static quantity = 0;
  #number;
  #start;
  constructor() {
    Timer.quantity++;
    this.number = Timer.quantity;
    this.start = new Date();
  }
  time(message) {
    let now = new Date();
    console.log(
      `${this.number}:${(now - this.start)
        .toString()
        .padStart(5, ' ')} - ${message}`
    );
    this.start = now;
  }
};

app.get('/api/syncOrders', auth, async (req, res) => {
  const startTime = new Date();
  const timer = new Timer();
  timer.time('Request Started')

  const shop = req.body.shop;
  const till = req.body.till;

  const clientOrders = [];
  const allClientOrders = req.body.orders;
  for (const order of allClientOrders) {
    if (order.shop == shop) clientOrders.push(order);
  }
  const dbOrders = await todaysorders.find({ shop }).exec();

  const ordersToAddInDB = [];
  const orderIdsToDeleteInDb = [];
  const orderIdsToEodInDb = [];

  const ordersToAddInClient = [];
  const orderIdsToDeleteInClient = [];
  const orderIdsToEodFullyInClient = [];
  timer.time('Initialise Variables (DB Access)');

  // check if any of the orders sent by the client are supposed to be EODed, and if they are mark them as EOD in todaysorders so that they will then be eoded again and the correct IDs will be sent back to the client
  let datesOfAllClientOrders = [];
  for (const order of clientOrders)
    datesOfAllClientOrders.push(
      new Date(order.time).toISOString().split('T')[0]
    );

  datesOfAllClientOrders = [...new Set(datesOfAllClientOrders)];
  timer.time('Collect dates of all client orders');

  const daySheets = await Day.find({ date: { $in: datesOfAllClientOrders } });
  let allEODedOrders = [];
  timer.time('Retrieve the relevant day sheets (DB Access)');


  for (const daySheet of daySheets) {
    for (const EodSheet of daySheet.shops) {
      if (EodSheet.shop === shop) {
        allEODedOrders = allEODedOrders.concat(EodSheet.orders);
      }
    }
  }

  for (
    let EODedOrderIndex = 0;
    EODedOrderIndex < allEODedOrders.length;
    EODedOrderIndex++
  ) {
    const EODedOrder = allEODedOrders[EODedOrderIndex];

    for (
      let clientOrderIndex = clientOrders.length - 1;
      clientOrderIndex >= 0;
      clientOrderIndex--
    ) {
      const clientOrder = clientOrders[clientOrderIndex];

      if (EODedOrder.id === clientOrder.id) {
        orderIdsToEodFullyInClient.push(clientOrder.id);
        clientOrders.splice(clientOrderIndex, 1);
        break;
      }
    }
  }
  timer.time('Finding orders which should be EODed on client');


  // Find orders which are missing in DB or need to be deleted in client or DB
  for (
    let clientOrderIndex = 0;
    clientOrderIndex < clientOrders.length;
    clientOrderIndex++
  ) {
    const clientOrder = clientOrders[clientOrderIndex];

    let orderFoundInDb = false;

    for (let dbOrderIndex = 0; dbOrderIndex < dbOrders.length; dbOrderIndex++) {
      const dbOrder = dbOrders[dbOrderIndex];

      if (clientOrder.id === dbOrder.id) {
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
  for (let dbOrderIndex = 0; dbOrderIndex < dbOrders.length; dbOrderIndex++) {
    const dbOrder = dbOrders[dbOrderIndex];

    let orderFoundInClient = false;
    for (
      let clientOrderIndex = 0;
      clientOrderIndex < clientOrders.length;
      clientOrderIndex++
    ) {
      const clientOrder = clientOrders[clientOrderIndex];
      if (clientOrder.id === dbOrder.id) {
        orderFoundInClient = true;
        break;
      }
    }
    if (!orderFoundInClient) {
      ordersToAddInClient.push(dbOrder);
    }
  }

  timer.time('Compared orders');

  try {
    // Add any orders that were missing
    await todaysorders.insertMany(ordersToAddInDB, { ordered: false });
  } catch (e) {
    console.log(e);
  }
  timer.time('Added orders missing in DB (DB Access)');

  try {
    // Delete any orders that should havebeen deleted
    await todaysorders
      .updateMany({ id: { $in: orderIdsToDeleteInDb } }, { deleted: true })
      .exec();
  } catch (e) {
    console.log(e);
  }
  timer.time('Marked orders in DB as deleted (DB Access)');


  try {
    // EOD any orders that should have been EODed
    await todaysorders
      .updateMany({ id: { $in: orderIdsToEodInDb } }, { eod: true })
      .exec();
  } catch (e) {
    console.log(e);
  }
  timer.time('Marked orders in DB as EOD (DB Access)');

  // // Create an array of all the orders we are supposed to EOD
  const ordersToEodInDb = await todaysorders.find({ shop, eod: true }).exec();
  // const ordersToEodInDb = [];

  // Then create a set of all the unique dates contained within the orders
  let dates = [];
  for (let orderIndex = 0; orderIndex < ordersToEodInDb.length; orderIndex++) {
    const order = ordersToEodInDb[orderIndex];
    dates.push(new Date(order.time).toISOString().split('T')[0]);
  }

  dates = [...new Set(dates)];
  // Make sure all of the neccessary day sheets exist
  for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
    const date = dates[dateIndex];
    if ((await Day.findOne({ date }).exec()) == null) {
      // Create the day sheet given it doesnt exist
      const daySheet = new Day();
      daySheet.date = date;
      daySheet.shops = [];
      try {
        await daySheet.save();
      } catch (e) {
        console.log('!! Error creating daySheet !!');
        // console.log(e);
      }
    }

    // Create the array of orders matching the current date which we can put into the EODsheet.
    const orders = [];
    for (
      let orderIndex = 0;
      orderIndex < ordersToEodInDb.length;
      orderIndex++
    ) {
      const order = ordersToEodInDb[orderIndex];
      if (new Date(order.time).toISOString().split('T')[0] === date) {
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

    // Now make sure that the EOD sheet exists inside the daySheet for the given shop
    const daySheet = await Day.findOne({ date }).exec();
    let shopIndex = -1;
    // if (daySheet.shops = )
    for (const [index, endOfDaySheet] of daySheet.shops.entries()) {
      if (endOfDaySheet.shop == shop) shopIndex = index;
    }
    // If it doesn't exist create one and fuck all the orders in
    if (shopIndex < 0) {
      try {
        console.log('doing em all at once');
        daySheet.shops.push({ shop, orders });
        await daySheet.save();
      } catch (e) {
        console.log('!!Error creating EOD sheet filled with orders!!');
        // console.log(e);
      }
    } else {
      let currDaySheet = await Day.findOne({ date }).exec();
      const alreadyEodedOrders = currDaySheet.shops[shopIndex].orders;
      for (let orderIndex = orders.length - 1; orderIndex >= 0; orderIndex--) {
        const orderToEod = orders[orderIndex];
        const orderEoded = alreadyEodedOrders.filter((order) => {
          orderToEod.id === order.id;
        });
        if (orderEoded.length > 0) {
          orders.splice(orderIndex, 1);
          orderIdsToEodFullyInClient.push(orderToEod.id);
        }
      }

      // Otherwise go in and add each order manually
      for (let orderIndex = 0; orderIndex < orders.length; orderIndex++) {
        const orderToEod = orders[orderIndex];

        currDaySheet = await Day.findOne({ date }).exec();

        const orderExists = currDaySheet.shops[shopIndex].orders.findIndex(
          (order) => order.id == orderToEod.id
        );
        orderIdsToEodFullyInClient.push(orderToEod.id);
        try {
          if (orderExists < 0) {
            currDaySheet.shops[shopIndex].orders.nonAtomicPush(orderToEod);
            // currDaySheet.shops[shopIndex].orders.addToSet(orderToEod);
            // currDaySheet.shops[shopIndex].orders.push(orderToEod);
            await currDaySheet.save();
            console.log('added order manually');
          } else {
            console.log('skipped adding order');
          }
          // The code above is where all the performance loss is coming from
        } catch (e) {
          console.log(e);
          console.log('!! ERROR INSERTING ORDER INTO DAYSHEET !!');
        }
      }
    }
  }

  await todaysorders
    .deleteMany({ id: { $in: orderIdsToEodFullyInClient } }, { ordered: false })
    .exec();

  console.log(
    `Sync Orders(${(new Date() - startTime)
      .toString()
      .padStart(3, '0')}ms)[${shop}-${till}]: ${ordersToAddInDB.length}-${
      orderIdsToDeleteInDb.length
    }-${ordersToEodInDb.length} ${ordersToAddInClient.length}-${
      orderIdsToDeleteInClient.length
    }-${orderIdsToEodFullyInClient.length}`
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
