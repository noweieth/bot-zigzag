const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// Token bot Telegram
const TELEGRAM_TOKEN = "7686827437:AAHKldhI4xU3IaTe0QsBRJD_F4mVChy9cH4"; // Thay bằng token của bạn
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Danh sách coin đang theo dõi
let watchlist = [];
let ichimokuStates = {};

// Hàm lấy dữ liệu nến từ Binance
async function getBinanceData(symbol) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=100`;
  try {
    const response = await axios.get(url);
    return response.data.map((candle) => ({
      openTime: candle[0],
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
    }));
  } catch (error) {
    console.error(`Lỗi khi lấy dữ liệu từ Binance: ${error.message}`);
    return null;
  }
}

// Hàm tính Tenkan-sen và Kijun-sen
function calculateIchimoku(data) {
  const ninePeriodHigh = Math.max(...data.slice(-9).map((d) => d.high));
  const ninePeriodLow = Math.min(...data.slice(-9).map((d) => d.low));
  const twentySixPeriodHigh = Math.max(...data.slice(-26).map((d) => d.high));
  const twentySixPeriodLow = Math.min(...data.slice(-26).map((d) => d.low));

  const tenkanSen = (ninePeriodHigh + ninePeriodLow) / 2;
  const kijunSen = (twentySixPeriodHigh + twentySixPeriodLow) / 2;

  return { tenkanSen, kijunSen };
}

function checkCrossover(prevState, currentState) {
  // Kiểm tra điều kiện giao cắt lên
  if (
    prevState.tenkanSen <= prevState.kijunSen &&
    currentState.tenkanSen > currentState.kijunSen
  ) {
    return "Bullish"; // Giao cắt lên
  }
  // Kiểm tra điều kiện giao cắt xuống
  if (
    prevState.tenkanSen >= prevState.kijunSen &&
    currentState.tenkanSen < currentState.kijunSen
  ) {
    return "Bearish"; // Giao cắt xuống
  }
  return null; // Không có giao cắt
}

// Hàm quét dữ liệu và thông báo
async function scanMarkets(chatId) {
  for (const symbol of watchlist) {
    const data = await getBinanceData(symbol);
    if (!data) continue;

    const currentIchimoku = calculateIchimoku(data);
    if (!ichimokuStates[symbol]) {
      // Nếu chưa có trạng thái trước đó, lưu trạng thái hiện tại
      ichimokuStates[symbol] = currentIchimoku;
      continue;
    }
    const prevIchimoku = ichimokuStates[symbol];
    const crossover = checkCrossover(prevIchimoku, currentIchimoku);
    console.log(`${symbol} - `, ichimokuStates[symbol]);
    if (crossover) {
      const lastClose = data[data.length - 1].close;
      const direction = crossover === "Bullish" ? "tăng" : "giảm";

      bot.sendMessage(
        chatId,
        `⚠️ Đã xảy ra giao cắt ${direction} giữa Tenkan-sen và Kijun-sen!\nCoin: ${symbol}\nGiá hiện tại: ${lastClose}`
      );
    }

    // Cập nhật trạng thái Ichimoku mới
    ichimokuStates[symbol] = currentIchimoku;
  }
}

// Xử lý lệnh từ người dùng
bot.onText(/\/add (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const symbol = match[1].toUpperCase();
  console.log(" chatId => ", chatId);

  if (!watchlist.includes(symbol)) {
    watchlist.push(symbol);
    bot.sendMessage(chatId, `✅ Add thành công: ${symbol}`);
  } else {
    bot.sendMessage(chatId, `ℹ️ Coin ${symbol} đã có trong danh sách.`);
  }
});

bot.onText(/\/remove (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const symbol = match[1].toUpperCase();

  if (watchlist.includes(symbol)) {
    watchlist = watchlist.filter((s) => s !== symbol);
    bot.sendMessage(chatId, `✅ Xóa thành công: ${symbol}`);
  } else {
    bot.sendMessage(chatId, `⚠️ Coin ${symbol} không có trong danh sách.`);
  }
});

// Chu kỳ quét mỗi 30 giây
setInterval(() => {
  if (watchlist.length > 0) {
    console.log("Quét danh sách coin:", watchlist);
    scanMarkets(-4606450756); // Gửi thông báo nếu có tín hiệu
  }
}, 10000);

watchlist.push("BTCUSDT");
watchlist.push("ETHUSDT");
watchlist.push("XRPUSDT");

console.log("Bot đang chạy...");
