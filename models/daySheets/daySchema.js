const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const endOfDaySchema = require('./endOfDaySchema');

let daySchema = new Schema(
  {
    date: {
      type: String,
      unique: true,
    },
    shops: {
      type: [endOfDaySchema],
    },
  },
  { collection: 'daysheets' }
);

module.exports = mongoose.model('daysheets', daySchema);
