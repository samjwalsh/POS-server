const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const auth = (req, res, next) => {
  if (req.body.key !== process.env.SYNC_KEY)
    return res.status(403).send('Forbidden');
  next();
};

module.exports = auth;
