const mongoose = require('mongoose');

const Schema = mongoose.Schema;

let addonsSchema = new Schema({
  name: {
    type: String,
  },
});

let itemSchema = new Schema({
  name: {
    type: String,
  },
  price: {
    type: Number,
  },
  quantity: {
    type: Number,
  },
  addons: {
    type: [addonsSchema],
  },
});

let order = new Schema(
  {
    time: {
      type: Number,
    },
    paymentMethod: {
      type: String,
    },
    subtotal: {
      type: Number,
    },
    items: {
      type: [itemSchema],
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
  },
  { collection: 'todaysOrders' }
);

module.exports = mongoose.model('todaysOrders', order);
