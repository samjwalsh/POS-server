const ch = require('chalk');

const Euro = Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
});

const cF = (n) => {
  if (typeof n !== 'number') n = parseFloat(n);
  return Euro.format(n);
};

const logger = (shop, till, action, startTime, topRow, bottomRow) => {
  const shopStr = ch.underline.magenta(shop.concat(' ').concat(till));
  const duration = ch.dim(
    (new Date() - startTime).toString().padStart(3, '0') + 'ms'
  );
  console.log(
    `${shopStr} ${ch.cyan(action)} ${duration} ${topRow}\n${bottomRow}\n`
  );
};

module.exports = { cF, logger };
