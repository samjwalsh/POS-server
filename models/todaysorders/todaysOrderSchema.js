const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const itemSchema = require('./itemSchema');

let order = new Schema(
  {
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
    eod: {
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
  },
  { collection: 'todaysorders' }
);

module.exports = mongoose.model('todaysorders', order);
