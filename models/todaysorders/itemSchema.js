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

module.exports = itemSchema;
