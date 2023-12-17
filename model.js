const mongoose = require('mongoose');

const Schema = mongoose.Schema;

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
    type: [String],
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
  { collection: 'todaysorders' }
);

module.exports = mongoose.model('todaysorders', order);
