const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');

const token = "7950928247:AAFAzEZLoOC6eUuXsmq1iUaHT3evoF4EIXU";
const chatId = "@Rk1Trader"; 
const bot = new TelegramBot(token, { polling: true });

// স্টিকার আইডিগুলো এখানে সেট করুন
const winStickerId = "CAACAgUAAxkBAAEQPxhpaN8xti9Ug8pzCuTOIKSMudQ2OAAC4xkAAi_xcVX60TxI2of6nDgE"; 
const seasonStartStickerId = "CAACAgUAAxkBAAEQQPppakFbk3fqeWzooRLIx3RKgAHIrwACUhYAAlEJ-VVZvLkjcrQPSTgE"; // এখানে স্টিকার আইডি দিন
const seasonEndStickerId = "CAACAgUAAxkBAAEQQPxpakFtr-vvDe05t6M7KXqUvc6xEQACIhYAAi3U8FUVaqmrOChRqDgE";     // এখানে স্টিকার আইডি দিন

http.createServer((req, res) => {
  res.write('Bot is Running');
  res.end();
}).listen(process.env.PORT || 3000);

const HISTORY_API = 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json';
const chartData = { "0/1":"BIG", "1/1":"SMALL", "2/1":"BIG", "3/1":"BIG", "4/1":"BIG", "5/1":"BIG", "6/1":"SMALL", "7/1":"BIG", "8/1":"SMALL", "9/1":"SMALL", "0/2":"SMALL", "1/2":"SMALL", "2/2":"BIG", "3/2":"BIG", "4/2":"BIG", "5/2":"SMALL", "6/2":"SMALL", "7/2":"BIG", "8/2":"BIG", "9/2":"SMALL", "0/3":"BIG", "1/3":"SMALL", "2/3":"BIG", "3/3":"BIG", "4/3":"BIG", "5/3":"SMALL", "6/3":"BIG", "7/3":"SMALL", "8/3":"BIG", "9/3":"BIG", "0/4":"SMALL", "1/4":"BIG", "2/4":"SMALL", "3/4":"SMALL", "4/4":"SMALL", "5/4":"BIG", "6/4":"SMALL", "7/4":"SMALL", "8/4":"BIG", "9/4":"BIG", "0/5":"SMALL", "1/5":"SMALL", "2/5":"BIG", "3/5":"SMALL", "4/5":"BIG", "5/5":"SMALL", "6/5":"BIG", "7/5":"BIG", "8/5":"BIG", "9/5":"BIG", "0/6":"BIG", "1/6":"BIG", "2/6":"SMALL", "3/6":"SMALL", "4/6":"SMALL", "5/6":"SMALL", "6/6":"BIG", "7/6":"BIG", "8/6":"SMALL", "9/6":"BIG", "0/7":"SMALL", "1/7":"BIG", "2/7":"BIG", "3/7":"BIG", "4/7":"BIG", "5/7":"SMALL", "6/7":"SMALL", "7/7":"BIG", "8/7":"BIG", "9/7":"SMALL", "0/8":"SMALL", "1/8":"SMALL", "2/8":"SMALL", "3/8":"SMALL", "4/8":"SMALL", "5/8":"BIG", "6/8":"SMALL", "7/8":"SMALL", "8/8":"BIG", "9/8":"BIG", "0/9":"BIG", "1/9":"SMALL", "2/9":"SMALL", "3/9":"SMALL", "4/9":"SMALL", "5/9":"BIG", "6/9":"SMALL", "7/9":"SMALL", "8/9":"SMALL", "9/9":"SMALL", "0/0":"BIG", "1/0":"BIG", "2/0":"SMALL", "3/0":"BIG", "4/0":"BIG", "5/0":"SMALL", "6/0":"BIG", "7/0":"BIG", "8/0":"SMALL", "9/0":"SMALL" };

let isRunning = false;
let sessionResults = [];
let totalWinCount = 0;
let totalLossCount = 0;
let currentStep = 1;
let lastAnalyzedPeriod = "";
let inTrendMode = false;

function generatePeriod() {
    const now = new Date();
    const datePrefix = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const totalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    return datePrefix + "1000" + String(10001 + totalMinutes);
}

async function sendSummary() {
    let reportMsg = `🏆 SESSION SUMMARY REPORT 🏆\n\n----------------------------------------\n`;
    sessionResults.forEach((res, index) => {
        let statusEmoji = res.status === "WIN" ? "WIN ✅✅✅✅" : "Loss 🚫🚫🚫🚫";
        if(res.status !== "Pending") {
            reportMsg += `${index + 1}. PD: ${res.period.slice(-3)} | ${statusEmoji}\n`;
        }
    });
    reportMsg += `-----------------------------------------\n`;
    reportMsg += `✅ Total Wins: ${totalWinCount}\n🚫 Total Losses: ${totalLossCount}\n🎯 Powered by RK VIP System`;
    
    await bot.sendMessage(chatId, reportMsg);
}

async function stopSession() {
    isRunning = false;
    await bot.sendSticker(chatId, seasonEndStickerId);
    await sendSummary();
}

async function checkAndPredict() {
    if (!isRunning) return;

    try {
        const response = await axios.get(`${HISTORY_API}?pageSize=10&pageNo=1&type=1`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const apiList = response.data.data.list;
        const currentPeriod = generatePeriod();

        // রেজাল্ট চেকিং লজিক
        if (sessionResults.length > 0) {
            let lastEntry = sessionResults[sessionResults.length - 1];
            if (lastEntry.status === "Pending") {
                const match = apiList.find(h => h.issueNumber === lastEntry.period);
                if (match) {
                    const actual = parseInt(match.number) >= 5 ? "BIG" : "SMALL";
                    if (lastEntry.prediction === actual) {
                        lastEntry.status = "WIN";
                        totalWinCount++;
                        currentStep = 1;
                        inTrendMode = false; // উইন হলে ট্রেন্ড মোড থেকে সাধারণ লজিক এ ফিরে যাবে
                        bot.sendMessage(chatId, `| PD: ${match.issueNumber.slice(-3)} WIN✅✅✅✅`);
                        bot.sendSticker(chatId, winStickerId); 
                    } else {
                        lastEntry.status = "LOSS";
                        totalLossCount++;
                        currentStep = currentStep < 10 ? currentStep + 1 : 1;
                    }

                    // ১৫টি উইন হলে অটো ক্লোজ
                    if (totalWinCount >= 15) {
                        stopSession();
                        return;
                    }
                }
            }
        }

        // প্রেডিকশন লজিক
        const seconds = new Date().getUTCSeconds();
        if (currentPeriod !== lastAnalyzedPeriod && seconds >= 10 && seconds <= 15) {
            lastAnalyzedPeriod = currentPeriod;
            
            // ট্রেন্ড এনালাইজার (টানা ৫টি চেক)
            const lastFive = apiList.slice(0, 5).map(item => parseInt(item.number) >= 5 ? "BIG" : "SMALL");
            const allBig = lastFive.every(v => v === "BIG");
            const allSmall = lastFive.every(v => v === "SMALL");

            let prediction = "";

            if (allBig) {
                prediction = "BIG";
                inTrendMode = true;
            } else if (allSmall) {
                prediction = "SMALL";
                inTrendMode = true;
            } else {
                // সাধারণ চার্ট লজিক
                const n1 = parseInt(apiList[0].number);
                const n2 = parseInt(apiList[1].number);
                prediction = chartData[`${n1}/${n2}`] || "BIG";
            }

            sessionResults.push({ period: currentPeriod, prediction: prediction, status: "Pending" });
            let msg = `🎖️ WINGO 1 MIN 🎖️\n\n🔰 PD: ${currentPeriod}\n🎯 PRED: *${prediction}* (S${currentStep})`;
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.log("Error:", error.message);
    }
}

bot.onText(/\/prediction/, async (msg) => {
    if (isRunning) return;
    isRunning = true;
    totalWinCount = 0;
    totalLossCount = 0;
    sessionResults = [];
    currentStep = 1;
    
    await bot.sendSticker(chatId, seasonStartStickerId);
    bot.sendMessage(msg.chat.id, "✅ Prediction Started!");
});

bot.onText(/\/report/, () => {
    sendSummary();
});

bot.onText(/\/close/, async (msg) => {
    if (!isRunning) return;
    await stopSession();
    bot.sendMessage(msg.chat.id, "❌ Stopped Manualy.");
});

setInterval(checkAndPredict, 3000);
