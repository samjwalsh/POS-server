const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const app = express();
const port = process.env.PORT;

app.get('/', (req, res) => {
  res.send('process.env.NAME');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
