const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const orderSchema = require('./orderSchema');

let endOfDaySchema = new Schema({
  shop: {
    type: String,
  },
  orders: {
    type: [orderSchema],
  }
});

module.exports = endOfDaySchema;
