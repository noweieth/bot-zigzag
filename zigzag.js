const axios = require("axios");
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");
const botTelegram = new TelegramBot(
  "6669365311:AAHMKw1tbNEB0UFjZ833Ra_6U04EQ_1TUBs",
  {
    // polling: true,
  }
);

const MY_ID_TELEGRAM = "881494218";

async function getETHData(interval) {
  const response = await axios.get("https://api.binance.com/api/v3/klines", {
    params: {
      symbol: "ETHUSDT",
      interval: interval,
      //   limit: 500,
    },
  });

  return response.data.map((entry) => {
    return {
      time: entry[0],
      open: parseFloat(entry[1]),
      high: parseFloat(entry[2]),
      low: parseFloat(entry[3]),
      close: parseFloat(entry[4]),
    };
  });
}

function highestbars(data, period, currentIndex) {
  const slicedData = data.slice(
    Math.max(currentIndex - period + 1, 0),
    currentIndex + 1
  );
  const maxHigh = Math.max(...slicedData.map((entry) => entry.high));
  return data[currentIndex].high === maxHigh ? data[currentIndex].high : null;
}

function lowestbars(data, period, currentIndex) {
  const slicedData = data.slice(
    Math.max(currentIndex - period + 1, 0),
    currentIndex + 1
  );

  const minLow = Math.min(...slicedData.map((entry) => entry.low));
  return data[currentIndex].low === minLow ? data[currentIndex].low : null;
}

function computeZigZag(data) {
  const prd2 = 16;
  const zigZag = [];
  let dir2 = 0;

  for (let i = data.length - 1; i >= 0; i--) {
    // Lưu ý thay đổi ở đây
    const ph2 = highestbars(data, prd2, i);
    const pl2 = lowestbars(data, prd2, i);

    if (ph2 && !pl2) {
      dir2 = 1;
    } else if (pl2 && !ph2) {
      dir2 = -1;
    }

    if (ph2 || pl2) {
      zigZag.unshift({
        // Sử dụng unshift thay vì push
        time: data[i].time,
        value: dir2 === 1 ? ph2 : pl2,
      });
    }
  }
  return zigZag;
}

var zigzagSave;
var zigzagFinal = [];
var timeout = 0;
var status = "UP";

async function sendMessage() {
  try {
    if (zigzagFinal.length == 0) {
      setTimeout(sendMessage, 1000);
      return;
    }
    let lastZigzag = zigzagFinal[zigzagFinal.length - 1];
    let previousZigzag = zigzagFinal[zigzagFinal.length - 2];
    if (!zigzagSave) {
      zigzagSave = lastZigzag;
    } else {
      let change =
        ((lastZigzag.value - previousZigzag.value) / previousZigzag.value) *
        100;
      let changeDirection = change > 0 ? "📈 Tăng" : "📉 Giảm";
      change = Math.abs(change).toFixed(2); // Giữ lại 2 số sau dấu phẩy
      if (
        (zigzagSave.time == lastZigzag.time &&
          zigzagSave.value != lastZigzag.value) ||
        (zigzagSave.time != lastZigzag.time &&
          zigzagSave.value != lastZigzag.value)
      ) {
        zigzagSave = lastZigzag;
        console.log(zigzagSave);
        if (timeout != 0) clearTimeout(timeout);
        timeout = setTimeout(async () => {
          await botTelegram.sendMessage(
            MY_ID_TELEGRAM,
            `💦${status}\n👉 Giá: ${zigzagSave.value}\n🔄 Phần trăm thay đổi: ${changeDirection} ${change}%`,
            {
              parse_mode: "HTML",
            }
          );
          clearTimeout(timeout);
          timeout = 0;
        }, 10 * 1000);
      }
    }
    setTimeout(sendMessage, 1000);
  } catch (e) {
    console.log(e);
    sendMessage();
  }
}

async function runBot() {
  try {
    const ethData15m = await getETHData("5m");
    const zigZag = computeZigZag(ethData15m);
    zigzagFinal = [];
    status = "UP";
    for (let i = 1; i < zigZag.length; i++) {
      if (zigZag[i - 1].value < zigZag[i].value && status == "DOWN") {
        zigzagFinal.push(zigZag[i - 1]);
        status = "UP";
      } else if (zigZag[i - 1].value >= zigZag[i].value && status == "UP") {
        zigzagFinal.push(zigZag[i - 1]);
        status = "DOWN";
      }
    }

    if (
      status == "DOWN" &&
      zigzagFinal[zigzagFinal.length - 1].value >
        zigZag[zigZag.length - 1].value
    ) {
      zigzagFinal.push(zigZag[zigZag.length - 1]);
    } else if (
      status == "UP" &&
      zigzagFinal[zigzagFinal.length - 1].value <
        zigZag[zigZag.length - 1].value
    ) {
      zigzagFinal.push(zigZag[zigZag.length - 1]);
    }
    try {
      await sendZigZagStatistics(zigzagFinal);
    } catch (e) {}
    setTimeout(runBot, 2 * 1000);
  } catch (e) {
    console.log(e);
    runBot();
  }
}

var message_statistic = 0;

async function sendZigZagStatistics(zigzagData) {
  let statisticsMessage = "Thống kê ZigZag 4 ngày qua:\n";
  let currentDate = new Date(zigzagData[0].time).toLocaleDateString();

  for (let i = 1; i < zigzagData.length; i++) {
    const prevPoint = zigzagData[i - 1];
    const currPoint = zigzagData[i];
    const percentageChange = (
      ((currPoint.value - prevPoint.value) / prevPoint.value) *
      100
    ).toFixed(2);
    const direction = percentageChange >= 0 ? "🟢" : "🔴";
    const pointDate = new Date(currPoint.time).toLocaleDateString();
    const pointTime = new Date(currPoint.time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (currentDate !== pointDate) {
      // Khi đến một ngày mới, thêm tiêu đề ngày mới
      statisticsMessage += `\n📅 ${pointDate}:\n`;
      currentDate = pointDate;
    }

    // Thêm thông tin về từng điểm ZigZag vào thông điệp
    statisticsMessage += `${direction} ${Math.abs(
      percentageChange
    )}% ⏰ ${pointTime}\n`;
  }

  if (message_statistic == 0) {
    // Đảm bảo thông điệp không quá dài để gửi trong một tin nhắn
    if (statisticsMessage.length >= 4096) {
      let messages = statisticsMessage.match(/(.|[\r\n]){1,4096}/g);
      for (let msg of messages) {
        await botTelegram.sendMessage(MY_ID_TELEGRAM, msg, {
          parse_mode: "Markdown",
        });
      }
    } else {
      await botTelegram
        .sendMessage(MY_ID_TELEGRAM, statisticsMessage, {
          parse_mode: "Markdown",
        })
        .then((msg) => {
          const { message_id } = msg;
          message_statistic = message_id;
        });
    }
  } else {
    // Đảm bảo thông điệp không quá dài để gửi trong một tin nhắn
    if (statisticsMessage.length >= 4096) {
      let messages = statisticsMessage.match(/(.|[\r\n]){1,4096}/g);
      for (let msg of messages) {
        await botTelegram.editMessageText(msg, {
          chat_id: MY_ID_TELEGRAM,
          message_id: message_statistic,
          parse_mode: "Markdown",
        });
      }
    } else {
      await botTelegram.editMessageText(statisticsMessage, {
        chat_id: MY_ID_TELEGRAM,
        message_id: message_statistic,
        parse_mode: "Markdown",
      });
    }
  }
}

(async function main() {
  runBot();
  sendMessage();
})();
