const express = require('express');
const mongoose = require('mongoose');

const app = express.Router();

const Log = require('../models/logs/logSchema');

app.get('/api/sendLog', async (req, res) => {
  const { shop, till, note, objsOfInterest, errMsg } = req.body;

  const log = new Log();
  log.time = new Date();
  log.shop = shop;
  log.till = till;
  log.note = note;
  log.objsOfInterest = objsOfInterest;
  log.errMsg = errMsg;
  log.save();

  res
  .status(200)
  .json({ success: true});
});

module.exports = app;
