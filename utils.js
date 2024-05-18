const ch = require('chalk');
const dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });

const Euro = Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
});

const cF = (n) => {
  if (typeof n !== 'number') n = parseFloat(n);
  return Euro.format(n);
};

const logger = (shop, till, action, time, topRow, bottomRow) => {
  const shopStr = ch.underline.magenta(shop.concat(' ').concat(till));
  const duration = ch.dim(time.toString().padStart(3, '0') + 'ms');
  console.log(`${shopStr} ${ch.cyan(action)} ${duration} ${topRow}\n`);
  if (bottomRow) console.log(`${bottomRow}\n`);
};

const Timer = class {
  static quantity = 0;
  #number;
  #start;
  #lifetime;
  constructor() {
    this.lifetime = new Date();
    if (process.env.ENV !== 'DEV') return;
    Timer.quantity++;
    this.number = Timer.quantity;
    this.start = new Date();
  }
  time(message) {
    if (process.env.ENV !== 'DEV') return;
    let now = new Date();

    let number = this.number;
    switch (number % 6) {
      case 0: {
        number = ch.red(number);
        break;
      }
      case 1: {
        number = ch.green(number);
        break;
      }
      case 2: {
        number = ch.yellow(number);
        break;
      }
      case 3: {
        number = ch.blue(number);
        break;
      }
      case 4: {
        number = ch.magenta(number);
        break;
      }
      case 5: {
        number = ch.cyan(number);
      }
    }

    let time = (now - this.start).toString().padStart(5, ' ');

    switch (true) {
      // case (time < 5): {
      //   time = ch.cyan(time);
      // }
      case (time < 30): {
        time = ch.green(time);
      }
      case (time < 100): {
        time = ch.yellow(time);
      }
      default: {
        time = ch.red(time);
      }
    }

    console.log(`${number} ${time}| ${message}`);
    this.start = now;
  }

  end() {
    return Date.now() - this.lifetime;
  }
};

module.exports = { cF, logger, Timer };
