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
// })();

app.get('/api/createVoucher', auth, async (req, res) => {
  const shop = req.body.shop;
  const till = req.body.till;

  console.log(`Create Voucher Request`);

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
      code = new suid({ dictionary: 'alphanum_upper', length: 5 }).rnd();
      const matchingVouchers = await Voucher.find({ code });
      if (matchingVouchers.length === 0) isUnique = true;

      if (!matcher.hasMatch(code)) isNotObscene = true;
    }

    // Now we have our voucher code and we can create the voucher in the DB

    const voucher = {
      dateCreated: new Date().toLocaleDateString('en-ie'),
      value,
      code,
      redeemed: false,
      shopCreated: shop,
      tillCreated: till,
    };

    createdVouchers.push(voucher);
    quantity--;
  }

  await Voucher.insertMany(createdVouchers);

  res.status(200).json(createdVouchers);
});

app.get('/api/redeemVoucher', auth, async (req, res) => {
  const shop = req.body.shop;
  const till = req.body.till;

  console.log(`Redeem Voucher Request`);

  const code = req.body.code.toLowerCase();

  const matchingVoucher = await Voucher.findOneAndUpdate(
    { code },
    {
      redeemed: true,
      dateRedeemed: new Date().toLocaleDateString('en-ie'),
      shopRedeemed: shop,
      tillRedeemed: till,
    }
  );

  if (matchingVoucher === null) {
    res.status(200).json({ success: false });
    return;
  }
  if (matchingVoucher.redeemed) {
    res
      .status(200)
      .json({ success: false, dateRedeemed: matchingVoucher.dateRedeemed });
    return;
  }

  res.status(200).json({ success: true, value: matchingVoucher.value });
});

app.get('/api/checkVoucher', auth, async (req, res) => {
  const shop = req.body.shop;
  const till = req.body.till;

  console.log(`Check Voucher Request`);

  const code = req.body.code.toUpperCase();

  const matchingVoucher = await Voucher.findOne({ code });

  if (matchingVoucher === null) {
    res.status(200).json({ success: true, exists: false });
    return;
  }
  if (matchingVoucher) {
    res
      .status(200)
      .json({ success: true, exists: true, voucher: matchingVoucher });
    return;
  }
});

module.exports = app;
