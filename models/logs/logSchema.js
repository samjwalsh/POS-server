const mongoose = require('mongoose');

const Schema = mongoose.Schema;

let logSchema = new Schema(
  {
    time: {
      type: Date,
    },
    shop: {
      type: String,
    },
    till: {
      type: Number,
    },
    note: {
      type: String,
    },
    objsOfInterest: {
      type: Array,
    },
    errMsg: {
      type: String,
    },
  },
  { collection: 'logs' }
);

module.exports = mongoose.model('logs', logSchema);
