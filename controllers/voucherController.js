const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');
const mongoose = require('mongoose');

const {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} = require('obscenity');
const suid = require('short-unique-id');

const auth = require('./authController');
const app = express.Router();

const connection = mongoose.connection;

const Voucher = require('../models/vouchers/voucherSchema');

// (async () => {
//   await Voucher.deleteMany({});
// })()

app.get('/api/createVoucher', auth, async (req, res) => {
  const shop = req.body.shop;
  const till = req.body.till;
  const value = req.body.value;
  let quantity = req.body.quantity;

  if (quantity < 1 || quantity === undefined) quantity = 1;

  const createdVouchers = [];

  while (quantity > 0) {
    const matcher = new RegExpMatcher({
      ...englishDataset.build(),
      ...englishRecommendedTransformers,
    });

    let isUnique = false;
    let isNotObscene = false;
    let code;

    while (!isUnique || !isNotObscene) {
      isUnique = false;
      isNotObscene = false;
      code = new suid({ dictionary: 'alphanum_lower', length: 5 }).rnd();
      const matchingVouchers = await Voucher.find({ code });
      if (matchingVouchers.length === 0) isUnique = true;

      if (!matcher.hasMatch(code)) isNotObscene = true;
    }

    // Now we have our voucher code and we can create the voucher in the DB

    const voucher = {
      date: new Date().toLocaleDateString('en-ie'),
      value,
      code,
      redeemed: false,
      shop,
      till,
    };

    createdVouchers.push(voucher);
    quantity--;
  }

  await Voucher.insertMany(createdVouchers);

  res.status(200).json(createdVouchers);
});

module.exports = app;
