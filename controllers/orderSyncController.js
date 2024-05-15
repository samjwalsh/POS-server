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

// function quicksort(array) {
//   if (array.length <= 1) {
//     return array;
//   }

//   var pivot = array[0];

//   var left = [];
//   var right = [];

//   for (var i = 1; i < array.length; i++) {
//     array[i] < pivot ? left.push(array[i]) : right.push(array[i]);
//   }

//   return quicksort(left).concat(pivot, quicksort(right));
// };


app.get('/api/syncOrders', auth, async (req, res) => {
  const startTime = new Date();

  const timer = new Timer();
  timer.time('Request Started')

  const shop = req.body.shop;
  const till = req.body.till;

  const clientOrders = [];
  const allClientOrders = req.body.orders;

  const dbOrders = await todaysorders.find({ shop }).exec();

  const ordersToAddInDB = [];
  const orderIdsToDeleteInDb = [];
  const ordersToEodInDB = [];

  const ordersToAddInClient = [];
  const orderIdsToDeleteInClient = [];
  const orderIdsToEodFullyInClient = [];

  timer.time('Initialise Variables (DB Access)');

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
  }
  // Convert set to array because mongoose doesnt like sets
  datesOfAllClientOrders = [...datesOfAllClientOrders];
  timer.time('Collect dates of all client orders');

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
          orderIdsToEodFullyInClient.push(clientOrder.id);
          // Remove the order from future calculations
          clientOrders.splice(clientOrderIndex, 1);
          break;
        }
      }
    }
  }

  timer.time('Finding orders which should be EODed on client');



  const clientSorted = insertionSort(clientOrders);
  // timer.time('Sorted client orders');
  const dbSorted = insertionSort(dbOrders);
  // timer.time('Sorted db orders');
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
      ordersToAddInClient.push(dbOrder);
      dbIndex++;
    } else {
      // Here the orders are matching, but it means we have to do our standard checks for deletions or EODs
      // console.log('Orders Match')
      if (clientOrder.deleted && !dbOrder.deleted)
        orderIdsToDeleteInDb.push(dbOrder.id);
      else if (!clientOrder.deleted && dbOrder.deleted)
        orderIdsToDeleteInClient.push(clientOrder.id);

      if (clientOrder.eod && !dbOrder.eod) ordersToEodInDD.push(dbOrder);

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
  }
  timer.time('Added orders missing in DB (DB Access)');

  if (orderIdsToDeleteInDb.length !== 0) {
    try {
      await todaysorders
        .updateMany({ id: { $in: orderIdsToDeleteInDb } }, { deleted: true })
        .exec();
    } catch (e) {
      console.log(e);
    }
  }
  timer.time('Marked orders in DB as deleted (DB Access)');

  if (ordersToEodInDB.length !== 0) {
    try {
      await todaysorders
        .updateMany({ id: { $in: ordersToEodInDB } }, { eod: true })
        .exec();
    } catch (e) {
      console.log(e);
    }
  }
  timer.time('Marked orders in DB as EOD (DB Access)');

  // Now we have to do the whole thing where if the client has asked to eod some orders we will do it for them
  // create an array of orders to EOD, should have been done up above
  // Each time we successfully eod an order we should put its id into another array and delete all of the todaysorders which match
  // Grab a list of all the orders in the daysheet, 

  console.log(
    `Sync Orders(${(new Date() - startTime)
      .toString()
      .padStart(3, '0')}ms)[${shop}-${till}]: ${ordersToAddInDB.length}-${
      orderIdsToDeleteInDb.length
    }-${ordersToEodInDB.length} ${ordersToAddInClient.length}-${
      orderIdsToDeleteInClient.length
    }-${orderIdsToEodFullyInClient.length}`
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

module.exports = app;
