const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');
const mongoose = require('mongoose');
const ch = require('chalk');
const auth = require('./authController');

const { cF, logger, Timer } = require('../utils');

const app = express.Router();

const todaysorders = require('../models/todaysorders/todaysOrderSchema');
const Day = require('../models/daySheets/daySchema');

const connection = mongoose.connection;

connection.once('open', function () {
  console.log('MongoDB connection established successfully');
});
let doingEOD = false;
app.get('/api/syncOrders', auth, async (req, res) => {
  const startTime = new Date();

  const timer = new Timer();
  timer.time('Request Started');

  const shop = req.body.shop;
  const till = req.body.till;
  let x = 0;

  const clientOrders = [];
  const allClientOrders = req.body.orders;

  const dbOrders = await todaysorders.find({ shop }).exec();

  const ordersToAddInDB = [];
  const orderIdsToDeleteInDb = [];
  const orderIdsToEodInDb = [];

  const ordersToAddInClient = [];
  const orderIdsToDeleteInClient = [];
  let orderIdsToEodFullyInClient = new Set();

  timer.time('Initialised Variables (DB Access)');

  let datesOfAllClientOrders = new Set();
  // Remove any orders which do not belong to the shop
  let clientOrderIndex = 0;
  let clientOrdersLength = allClientOrders.length;
  while (clientOrderIndex < clientOrdersLength) {
    const order = allClientOrders[clientOrderIndex];
    clientOrderIndex++;

    // Skip the order if its shop doesn't match the shop sent by the till
    if (order.shop !== shop) continue;
    // Add the client order to a new array now that we know it matches the shop
    clientOrders.push(order);
    // Create a set of all the dates of all the client orders, so that we can find all the required EODed orders
    datesOfAllClientOrders.add(
      new Date(order.time).toISOString().split('T')[0]
    );
    if (!order.deleted) x += order.subtotal;
  }
  // Convert set to array because mongoose doesnt like sets
  datesOfAllClientOrders = [...datesOfAllClientOrders];
  timer.time('Created set of dates and recorded X-Total');

  if (datesOfAllClientOrders.length !== 0) {
    const days = await Day.find({ date: { $in: datesOfAllClientOrders } });
    timer.time('Retrieve the relevant day sheets (DB Access)');

    // Run through each daysheet to extract the orders which match the shop which have already been end of dayed

    // TODO could be better to first sort the orders into arrays of each date, so that we are not comparing orders that we know aren't going to be in a certain eod sheet

    let dayIndex = 0;
    const daysLength = days.length;
    while (dayIndex < daysLength) {
      const day = days[dayIndex];
      dayIndex++;

      let shopIndex = 0;
      const noShops = day.shops.length;
      while (shopIndex < noShops) {
        const EODSheet = day.shops[shopIndex];
        shopIndex++;
        if (EODSheet.shop !== shop) continue;
        // If we find an order here it means that it has been EODed in the db but not the client, so we should find it in the client and tell them to EOD it fully
        let EODOrderIndex = 0;
        const EODOrdersLength = EODSheet.orders.length;
        while (EODOrderIndex < EODOrdersLength) {
          const EODOrder = EODSheet.orders[EODOrderIndex];
          EODOrderIndex++;

          let clientOrderIndex = 0;
          const clientOrdersLength = clientOrders.length;
          while (clientOrderIndex < clientOrdersLength) {
            const clientOrder = clientOrders[clientOrderIndex];
            clientOrderIndex++;

            if (EODOrder.id !== clientOrder.id) continue;
            // Here we have found an order that the client sent which is in an existing EOD sheet, so we neet to instruct the client to delete it
            orderIdsToEodFullyInClient.add(clientOrder.id);
            // console.log(
            //   'telling client to eod order which was found in a daysheet'
            // );
            // Remove the order from future calculations
            clientOrders.splice(clientOrderIndex, 1);
            break;
          }
        }
      }
    }
    timer.time('Found orders which should be EODed on client');
  }

  const clientSorted = insertionSort(clientOrders);
  timer.time('Sorted client orders');
  const dbSorted = insertionSort(dbOrders);
  timer.time('Sorted DB orders');
  //TODO

  let clientIndex = 0;
  clientOrdersLength = clientSorted.length;
  let dbIndex = 0;
  const dbOrdersLength = dbSorted.length;
  let continues = true;
  while (continues) {
    let comparison;
    let clientOrder;
    let dbOrder;

    const endOfDB = dbIndex === dbOrdersLength;
    const endOfClient = clientIndex === clientOrdersLength;
    if (endOfClient && endOfDB) break;
    if (endOfClient) {
      // DB has more orders to give to client
      dbOrder = dbSorted[dbIndex];
      comparison = -1;
    } else if (endOfDB) {
      // Client has more orders to give to DB
      clientOrder = clientSorted[clientIndex];
      comparison = 1;
    } else {
      clientOrder = clientSorted[clientIndex];
      dbOrder = dbSorted[dbIndex];
      comparison = compare(clientOrder, dbOrder);
    }

    if (comparison === 1) {
      // console.log('DB missing order');
      // Here the client order is older than the db order, so it must mean that the db is missing this order?
      ordersToAddInDB.push(clientOrder);
      clientIndex++;
    } else if (comparison === -1) {
      // console.log('Client missing order');
      // Here the db order is older than the client order, so it must mean that the client is missing this order?
      if (!dbOrder.eod) ordersToAddInClient.push(dbOrder);
      dbIndex++;
    } else {
      // Here the orders are matching, but it means we have to do our standard checks for deletions or EODs
      // console.log('Orders Match')
      if (clientOrder.deleted && !dbOrder.deleted)
        orderIdsToDeleteInDb.push(dbOrder.id);
      else if (!clientOrder.deleted && dbOrder.deleted)
        orderIdsToDeleteInClient.push(clientOrder.id);

      if (clientOrder.eod && !dbOrder.eod) orderIdsToEodInDb.push(dbOrder.id);

      if (clientIndex < clientOrdersLength) clientIndex++;
      if (dbIndex < dbOrdersLength) dbIndex++;
    }
  }

  timer.time('Compared orders');

  // // And EOD any orders in the DB which were done in the client
  // // TODO what if instead of this we just used the list of eodable orders above and went to the db with that.
  // // It would stop every request to the server from other clients causing it to attempt to eod again
  // // but what if it goes wrong, we rely on the client who sent the eod request to send more eod requests?
  // // Is the only situation this wouldnt work when the client who initially sent the eod request goes offline AND if the server crashes and is unable to complete the initial request?
  // // Maybe instead consider a boolean which is set to true if there is an eod already happening? But what if two different shops want to eod at the same time

  // So then we can actually add it
  if (ordersToAddInDB.length !== 0) {
    try {
      await todaysorders.insertMany(ordersToAddInDB, { ordered: false });
    } catch (e) {
      console.log(e);
    }
    timer.time('Added orders missing in DB (DB Access)');
  }

  if (orderIdsToDeleteInDb.length !== 0) {
    try {
      await todaysorders
        .updateMany({ id: { $in: orderIdsToDeleteInDb } }, { deleted: true })
        .exec();
    } catch (e) {
      console.log(e);
    }
    timer.time('Marked orders in DB as deleted (DB Access)');
  }

  let ordersToEodInDB = [];
  if (orderIdsToEodInDb.length !== 0) {
    try {
      // EOD any orders that should have been EODed
      await todaysorders
        .updateMany({ id: { $in: orderIdsToEodInDb } }, { eod: true })
        .exec();
    } catch (e) {
      console.log(e);
    }
    timer.time('Marked orders in DB as EOD (DB Access)');
  }
  ordersToEodInDB = await todaysorders.find({ shop, eod: true }).exec();
  timer.time('Checked if need to EOD orders (DB Access)');

  if (ordersToEodInDB.length !== 0 && doingEOD === false) {
    doingEOD = true;
    // Collect the dates of all the orders we have to EOD
    const orders = {};

    let orderIndex = 0;
    const ordersLength = ordersToEodInDB.length;
    while (orderIndex < ordersLength) {
      const order = ordersToEodInDB[orderIndex];
      orderIndex++;

      delete order._id;
      const date = new Date(order.time).toISOString().split('T')[0];
      if (!Array.isArray(orders[date])) orders[date] = [order];
      else orders[date].push(order);
    }
    timer.time('Sorted orders into buckets based on date');

    // Create all of the daysheets neccessary
    let dateIndex = 0;
    const datesLength = Object.keys(orders).length;
    while (dateIndex < datesLength) {
      const date = Object.keys(orders)[dateIndex];
      dateIndex++;

      let daySheet = await Day.findOne({ date });

      if (!daySheet) {
        daySheet = new Day();
        daySheet.date = date;
        daySheet.shops = [];
        try {
          await daySheet.save();
          timer.time('Created day sheet (DB Access)');
        } catch (e) {
          console.log(e);
        }
      }

      // orders[date] contains an array of all the orders
      // We should first grab a list of all the orders already in the daysheet so that we can skip them

      // Look for an existing EODsheet, if there isnt one we can just feck all of the orders in to the one we make now
      const shopIndex = daySheet.shops.findIndex(
        (EodSheet) => EodSheet.shop === shop
      );

      if (shopIndex < 0) {
        // Create a new EODsheet and put all the orders in now;
        try {
          daySheet.shops.push({ shop, orders: orders[date] });
          await daySheet.save();
          orders[date].forEach((order) =>
            orderIdsToEodFullyInClient.add(order.id)
          );

          timer.time('Created filled EOD sheet (DB Access)');
          // console.log('***********filled eod sheet');
        } catch (e) {
          // console.log('2');
          console.log(e);
        }
      } else {
        // There already exists an EOD sheet
        // Create array of order IDs that have already been EODed
        let alreadyEODed = daySheet.shops[shopIndex].orders.map(
          (order) => order.id
        );

        let orderIndex = 0;
        const ordersLength = orders[date].length;
        while (orderIndex < ordersLength) {
          const order = orders[date][orderIndex];
          orderIndex++;

          if (orderIndex % 25 === 0) {
            daySheet = await Day.findOne({ date });
            alreadyEODed = daySheet.shops[shopIndex].orders.map(
              (order) => order.id
            );
          }

          // Check if order was already EODed
          if (alreadyEODed.includes(order.id)) {
            orderIdsToEodFullyInClient.add(order.id);
            // console.log(
            //   'while eoding orders found same order in eod sheet already'
            // );
            // console.log('skipped order')
            continue;
          }

          // Check again if the order was eoded right now
          const eodIndex = daySheet.shops[shopIndex].orders.findIndex(
            (EODedOrder) => order.id == EODedOrder.id
          );
          if (eodIndex < 0) {
            try {
              // daySheet = await Day.findOne({ date });
              await Day.findOneAndUpdate(
                { date },
                { $addToSet: { 'shops.$[e1].orders': order } },
                { arrayFilters: [{ 'e1.shop': shop }] }
              );
              // daySheet.shops[shopIndex].orders.addToSet(order);
              // await daySheet.save();
              orderIdsToEodFullyInClient.add(order.id);
              // console.log('*********added order manually');
            } catch (e) {
              console.log(e);
            }
          }
        }
      }
    }
    doingEOD = false;
    timer.time('Completed EOD');
  }

  orderIdsToEodFullyInClient = [...orderIdsToEodFullyInClient];
  if (orderIdsToEodFullyInClient.length !== 0) {
    try {
      await todaysorders
        .deleteMany(
          { id: { $in: orderIdsToEodFullyInClient } },
          { ordered: false }
        )
        .exec();
    } catch (e) {
      console.log(e);
    }
    timer.time('Deleting EODed orders in todays orders (DB Access)');
  }

  // Now we have to do the whole thing where if the client has asked to eod some orders we will do it for them
  // create an array of orders to EOD, should have been done up above
  // Each time we successfully eod an order we should put its id into another array and delete all of the todaysorders which match
  // Grab a list of all the orders in the daysheet,

  const totalUpdates =
    ordersToAddInDB.length +
    orderIdsToDeleteInDb.length +
    ordersToEodInDB.length +
    ordersToAddInClient.length +
    orderIdsToDeleteInClient.length +
    orderIdsToEodFullyInClient.length;

  const addDB =
    ordersToAddInDB.length > 0
      ? ch.green.bold(ordersToAddInDB.length)
      : ch.dim(0);
  const delDB =
    orderIdsToDeleteInDb.length > 0
      ? ch.red.bold(orderIdsToDeleteInDb.length)
      : ch.dim(0);
  const eodDB =
    ordersToEodInDB.length > 0
      ? ch.yellow.bold(ordersToEodInDB.length)
      : ch.dim(0);
  const addCl =
    ordersToAddInClient.length > 0
      ? ch.green.bold(ordersToAddInClient.length)
      : ch.dim(0);
  const delCl =
    orderIdsToDeleteInClient.length > 0
      ? ch.red.bold(orderIdsToDeleteInClient.length)
      : ch.dim(0);
  const eodCl =
    orderIdsToEodFullyInClient.length > 0
      ? ch.yellow.bold(orderIdsToEodFullyInClient.length)
      : ch.dim(0);

  const orders = req.body.orders.length;

  const xStr = `${ch.green(cF(x))}`;

  timer.time('Done');

  const lifetime = timer.end();
  logger(
    shop,
    till,
    'Sync',
    lifetime,
    `[${orders}] ${xStr}`,
    totalUpdates > 0
      ? ` S|${addDB} ${delDB} ${eodDB}\n C|${addCl} ${delCl} ${eodCl}`
      : false
  );

  res.status(200).json({
    missingOrders: ordersToAddInClient,
    deletedOrderIds: orderIdsToDeleteInClient,
    completedEodIds: orderIdsToEodFullyInClient,
    ordersMissingInDb: ordersToAddInDB.length,
    ordersDeletedInDb: orderIdsToDeleteInDb.length,
    eodsCompletedInDb: ordersToEodInDB.length,
  });
});

const compare = (order1, order2) => {
  if (order1.id === order2.id) return 0;
  if (order1.id < order2.id) return 1;
  else return -1;
};

const insertionSort = (inputArr) => {
  for (let i = 1; i < inputArr.length; i++) {
    let key = inputArr[i];
    let id = key.id;
    let j = i - 1;
    while (j >= 0 && inputArr[j].id > id) {
      inputArr[j + 1] = inputArr[j];
      j = j - 1;
    }
    inputArr[j + 1] = key;
  }
  return inputArr;
};

module.exports = app;
