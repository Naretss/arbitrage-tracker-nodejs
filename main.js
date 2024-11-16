const axios = require('axios');
require('dotenv').config();

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const LINE_NOTIFY_TOKEN = process.env.LINE_NOTIFY_TOKEN;
const PERCENT_TRACKER = parseInt(process.env.PERCENT);
const BLACKLIST = process.env.BLACKLIST ? process.env.BLACKLIST.split(",") : [];
const EVERY_MINUTE = parseInt(process.env.EVERYMINUTE) * 60000;

async function fetchPrices() {
  try {
    console.log("Fetching prices from Bitkub...");
    // ดึงข้อมูลจาก Bitkub
    const bitkubRes = await axios.get('https://api.bitkub.com/api/market/ticker');
    const bitkubData = bitkubRes.data;
    console.log("Bitkub data fetched successfully.");

    // ตรวจสอบว่ามีข้อมูล THB_USDT อยู่ใน Bitkub Data หรือไม่
    if (!bitkubData["THB_USDT"]) {
      console.error("THB_USDT data not found in Bitkub response");
      return;
    }

    console.log("Fetching prices from Binance...");
    // ดึงข้อมูลจาก Binance
    const binanceRes = await axios.get('https://api.binance.com/api/v3/ticker/price');
    const binancePrices = binanceRes.data.reduce((acc, item) => {
      acc[item.symbol] = parseFloat(item.price);
      return acc;
    }, {});
    console.log("Binance data fetched successfully.");

    // ตรวจสอบความแตกต่างของราคาจาก Bitkub และ Binance
    let notificationMessages = [];
    console.log("Checking for arbitrage opportunities...");
    Object.keys(bitkubData).forEach((bitkubSymbol) => {
      const coin = bitkubSymbol.split('_')[1];
      const binanceSymbol = `${coin}USDT`;

      // ตรวจสอบว่าค่าไม่อยู่ใน Blacklist และ Binance มีข้อมูลของเหรียญนี้
      if (!BLACKLIST.includes(binanceSymbol) && binancePrices[binanceSymbol]) {
        const bitkubPrice = (bitkubData[bitkubSymbol].highestBid / bitkubData["THB_USDT"].last).toFixed(5);
        const binancePrice = binancePrices[binanceSymbol];
        const percentDiff = Math.abs(((bitkubPrice - binancePrice) / binancePrice) * 100).toFixed(5);

        if (percentDiff > PERCENT_TRACKER) {
          console.log(`Arbitrage opportunity found for ${bitkubSymbol}: ${percentDiff}% difference`);
          notificationMessages.push({
            symbol: bitkubSymbol,
            bitkubPrice,
            binancePrice,
            percentDiff,
          });
        }
      }
    });

    // ส่งการแจ้งเตือนผ่าน Telegram และ LINE Notify
    if (notificationMessages.length > 0) {
      notificationMessages.forEach((notification) => {
        const message = `
Arbitrage Opportunity Detected!
Symbol: ${notification.symbol}
Bitkub Price (USD): ${notification.bitkubPrice} USD
Binance Price (USD): ${notification.binancePrice} USD
Price Difference: ${notification.percentDiff}%
        `;
        console.log("Sending notifications...");
        sendTelegramNotification(message);
        sendLineNotification(message);
      });
    } else {
      console.log("No arbitrage opportunities found at this time.");
    }

  } catch (error) {
    console.error("Error fetching prices: ", error);
  }
}

// ฟังก์ชันสำหรับส่งข้อความไปยัง Telegram
async function sendTelegramNotification(message) {
  try {
    const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await axios.post(telegramUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
    });
    console.log("Telegram notification sent successfully.");
  } catch (error) {
    console.error("Error sending Telegram message: ", error);
  }
}

// ฟังก์ชันสำหรับส่งข้อความไปยัง LINE Notify
async function sendLineNotification(message) {
  try {
    const lineUrl = 'https://notify-api.line.me/api/notify';
    const options = {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${LINE_NOTIFY_TOKEN}`,
      },
    };
    const params = new URLSearchParams();
    params.append('message', message);

    await axios.post(lineUrl, params, options);
    console.log("LINE Notify message sent successfully.");
  } catch (error) {
    console.error("Error sending LINE Notify message: ", error);
  }
}

// ตั้งเวลาให้ทำงานอัตโนมัติทุกๆ everyMinute ที่กำหนด
setInterval(fetchPrices, EVERY_MINUTE);
console.log("Start program..");
fetchPrices(); // เรียกใช้ทันทีเพื่อดึงข้อมูลครั้งแรก

module.exports = (req, res) => {
  res.status(200).send("Arbitrage Tracker Running.");
};
