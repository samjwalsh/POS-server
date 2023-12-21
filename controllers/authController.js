const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const auth = (req, res, next) => {
  if (req.body.key !== process.env.SYNC_KEY) {
    console.log('Blocked unauthorised access');
    return res.status(403).send('Forbidden');
  }
  next();
};

module.exports = auth;
