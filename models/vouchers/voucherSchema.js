const mongoose = require('mongoose');

const Schema = mongoose.Schema;

let voucherSchema = new Schema(
  {
    date: {
        type: String
    },
    value : {
        type: Number
    },
    code: {
        type: String,
        unique: true,
    },
    redeemed: {
        type: Boolean,
    },
    shop: {
        type: String
    },
    till : {
        type: Number
    }
  },
  { collection: 'vouchers' }
);

module.exports = mongoose.model('vouchers', voucherSchema);
