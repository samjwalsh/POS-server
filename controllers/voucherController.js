const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const express = require('express');

const ch = require('chalk');

const { logger } = require('../utils');

const {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} = require('obscenity');

const suid = require('short-unique-id');

const auth = require('./authController');
const app = express.Router();

const Voucher = require('../models/vouchers/voucherSchema');

// (async () => {
//   await Voucher.deleteMany({});
// })();

app.get('/api/createVoucher', auth, async (req, res) => {
  const startTime = new Date();
  const shop = req.body.shop;
  const till = req.body.till;

  const value = req.body.value;
  let quantity = req.body.quantity;

  if (quantity < 1 || quantity === undefined) quantity = 1;
  if (quantity > 20) {
    res.status(500).send();
    return;
  }

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
      code = new suid({ dictionary: 'alpha_upper', length: 5 }).rnd();
      const matchingVouchers = await Voucher.find({ code });
      if (matchingVouchers.length === 0) isUnique = true;

      if (!matcher.hasMatch(code)) isNotObscene = true;
    }

    // Now we have our voucher code and we can create the voucher in the DB

    const voucher = {
      dateCreated: new Date().toISOString().split('T')[0],
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

  const shopStr = ch.underline.magenta(shop.concat(' ').concat(till));

  const duration = ch.dim(
    (new Date() - startTime).toString().padStart(3, '0') + 'ms'
  );

  logger(
    shop,
    till,
    'Create Vouchers',
    Date.now() - startTime,
    `${createdVouchers.length} @ ${ch.green(
      '€' + createdVouchers[0].value.toFixed(2)
    )}`,
    ` ${createdVouchers.map((voucher) => voucher.code).join('\n ')}`
  );

  res.status(200).json(createdVouchers);
});

app.get('/api/redeemVoucher', auth, async (req, res) => {
  const startTime = new Date();
  const shop = req.body.shop;
  const till = req.body.till;

  const code = req.body.code.toUpperCase();

  const matchingVoucher = await Voucher.findOneAndUpdate(
    { code },
    {
      redeemed: true,
      dateRedeemed: new Date().toISOString().split('T')[0],
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

  let outputString = '';
  if (!matchingVoucher) {
    outputString = `${code} not found`;
  } else if (matchingVoucher.redeemed) {
    outputString = `${code} already redeemed`;
  } else {
    outputString = `${code} - €${matchingVoucher.value.toFixed(2)}`;
  }

  logger(shop, till, 'Redeem Voucher', Date.now() - startTime, ``, outputString);

  res.status(200).json({ success: true, value: matchingVoucher.value });
});

app.get('/api/checkVoucher', auth, async (req, res) => {
  const startTime = new Date();

  const shop = req.body.shop;
  const till = req.body.till;

  const code = req.body.code.toUpperCase();

  const matchingVoucher = await Voucher.findOne({ code });

  let outputString = '';
  if (!matchingVoucher) {
    outputString = `${code} not found`;
  } else {
    outputString = `${code} - €${matchingVoucher.value.toFixed(2)} ${
      matchingVoucher.redeemed ? 'Redeemed' : 'Not Redeemed'
    }`;
  }

  logger(shop, till, 'Check Voucher', Date.now() - startTime, ``, outputString);


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
