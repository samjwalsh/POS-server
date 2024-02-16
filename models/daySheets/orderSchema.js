const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const itemSchema = require('../todaysorders/itemSchema');

let orderSchema = new Schema({
  id: {
    type: String,
    unique: true,
  },
  time: {
    type: Date,
  },
  shop: {
    type: String,
  },
  till: {
    type: Number,
  },
  deleted: {
    type: Boolean,
  },
  subtotal: {
    type: Number,
  },
  paymentMethod: {
    type: String,
  },
  items: {
    type: [itemSchema],
  },
});

module.exports = orderSchema;
