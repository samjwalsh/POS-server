const mongoose = require('mongoose');

const Schema = mongoose.Schema;

let voucherSchema = new Schema(
  {
    dateCreated: {
        type: String
    },
    shopCreated: {
        type: String
    },
    tillCreated: {
        type: Number
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
    dateRedeemed: {
        type: String
    },
    shopRedeemed: {
        type: String
    },
    tillRedeemed: {
        type: Number
    },
  },
  { collection: 'vouchers' }
);

module.exports = mongoose.model('vouchers', voucherSchema);
