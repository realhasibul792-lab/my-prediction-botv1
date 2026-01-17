const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const http = require('http');
const schedule = require('node-schedule');

const token = "7950928247:AAFAzEZLoOC6eUuXsmq1iUaHT3evoF4EIXU";
const chatId = "@Rk1Trader"; 
const bot = new TelegramBot(token, { polling: true });

// স্টিকার আইডি
const winStickerId = "CAACAgUAAxkBAAEQPxhpaN8xti9Ug8pzCuTOIKSMudQ2OAAC4xkAAi_xcVX60TxI2of6nDgE"; 
const sessionStartStickerId = "CAACAgUAAxkBAAEQQPppakFbk3fqeWzooRLIx3RKgAHIrwACUhYAAlEJ-VVZvLkjcrQPSTgE"; 
const sessionEndStickerId = "CAACAgUAAxkBAAEQQPxpakFtr-vvDe05t6M7KXqUvc6xEQACIhYAAi3U8FUVaqmrOChRqDgE";     

let isRunning = false;
let sessionResults = [];
let totalWinCount = 0;
let totalLossCount = 0;
let lastAnalyzedPeriod = "";
let sessionWinLimit = 15;
let lastResultStatus = "";

const HISTORY_API = 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json';
const chartData = { "0/1":"BIG", "1/1":"SMALL", "2/1":"BIG", "3/1":"BIG", "4/1":"BIG", "5/1":"BIG", "6/1":"SMALL", "7/1":"BIG", "8/1":"SMALL", "9/1":"SMALL", "0/2":"SMALL", "1/2":"SMALL", "2/2":"BIG", "3/2":"BIG", "4/2":"BIG", "5/2":"SMALL", "6/2":"SMALL", "7/2":"BIG", "8/2":"BIG", "9/2":"SMALL", "0/3":"BIG", "1/3":"SMALL", "2/3":"BIG", "3/3":"BIG", "4/3":"BIG", "5/3":"SMALL", "6/3":"BIG", "7/3":"SMALL", "8/3":"BIG", "9/3":"BIG", "0/4":"SMALL", "1/4":"BIG", "2/4":"SMALL", "3/4":"SMALL", "4/4":"SMALL", "5/4":"BIG", "6/4":"SMALL", "7/4":"SMALL", "8/4":"BIG", "9/4":"BIG", "0/5":"SMALL", "1/5":"SMALL", "2/5":"BIG", "3/5":"SMALL", "4/5":"BIG", "5/5":"SMALL", "6/5":"BIG", "7/5":"BIG", "8/5":"BIG", "9/5":"BIG", "0/6":"BIG", "1/6":"BIG", "2/6":"SMALL", "3/6":"SMALL", "4/6":"SMALL", "5/6":"SMALL", "6/6":"BIG", "7/6":"BIG", "8/6":"SMALL", "9/6":"BIG", "0/7":"SMALL", "1/7":"BIG", "2/7":"BIG", "3/7":"BIG", "4/7":"BIG", "5/7":"SMALL", "6/7":"SMALL", "7/7":"BIG", "8/7":"BIG", "9/7":"SMALL", "0/8":"SMALL", "1/8":"SMALL", "2/8":"SMALL", "3/8":"SMALL", "4/8":"SMALL", "5/8":"BIG", "6/8":"SMALL", "7/8":"SMALL", "8/8":"BIG", "9/8":"BIG", "0/9":"BIG", "1/9":"SMALL", "2/9":"SMALL", "3/9":"SMALL", "4/9":"SMALL", "5/9":"BIG", "6/9":"SMALL", "7/9":"SMALL", "8/9":"SMALL", "9/9":"SMALL", "0/0":"BIG", "1/0":"BIG", "2/0":"SMALL", "3/0":"BIG", "4/0":"BIG", "5/0":"SMALL", "6/0":"BIG", "7/0":"BIG", "8/0":"SMALL", "9/0":"SMALL" };

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Active'); });
server.listen(process.env.PORT || 3000);

// --- পিরিয়ড জেনারেশন সংশোধন ---
// গেমের পরবর্তী পিরিয়ড আগে থেকেই ক্যালকুলেট করার জন্য
function getNextPeriod() {
    const now = new Date();
    const datePrefix = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const totalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    // পরবর্তী পিরিয়ড হবে বর্তমান মিনিট + ১
    return datePrefix + "1000" + String(10001 + totalMinutes + 1);
}

async function startPrediction(targetId) {
    if (isRunning) return;
    isRunning = true;
    totalWinCount = 0; totalLossCount = 0; sessionResults = [];
    lastResultStatus = "";
    await bot.sendSticker(chatId, sessionStartStickerId);
    bot.sendMessage(chatId, "🚀 *Season Started! Target: 15 Wins*", {parse_mode: 'Markdown'});
}

async function stopPrediction(targetId) {
    if (!isRunning) return;
    isRunning = false;
    let reportMsg = `🏆 SESSION SUMMARY REPORT 🏆\n\n----------------------------------------\n`;
    sessionResults.forEach((res, index) => {
        let statusEmoji = res.status === "WIN" ? "WIN ✅✅✅✅" : "Loss 🚫🚫🚫🚫";
        reportMsg += `${index + 1}. PD: ${res.period.slice(-3)} | ${statusEmoji}\n\n`;
    });
    reportMsg += `-----------------------------------------\n✅ Total Wins: ${totalWinCount}\n🚫 Total Losses: ${totalLossCount}\n🎯 Powered by RK VIP System`;
    await bot.sendMessage(chatId, reportMsg);
    await bot.sendSticker(chatId, sessionEndStickerId);
}

async function checkAndPredict() {
    if (!isRunning) return;

    try {
        const now = new Date();
        const seconds = now.getUTCSeconds(); // ঘড়ির সেকেন্ড (০-৫৯)

        // ১. রেজাল্ট চেক: যখন নতুন পিরিয়ড শুরু হয় (ঘড়ির ৫-১০ সেকেন্ডে)
        if (seconds >= 5 && seconds <= 15 && sessionResults.length > 0) {
            let lastEntry = sessionResults[sessionResults.length - 1];
            if (lastEntry.status === "Pending") {
                const response = await axios.get(`${HISTORY_API}?pageSize=2&pageNo=1&type=1`);
                const match = response.data.data.list.find(h => h.issueNumber === lastEntry.period);
                
                if (match) {
                    const actual = parseInt(match.number) >= 5 ? "BIG" : "SMALL";
                    if (lastEntry.prediction === actual) {
                        lastEntry.status = "WIN";
                        lastResultStatus = "WIN";
                        totalWinCount++;
                        bot.sendMessage(chatId, `| PD: ${match.issueNumber.slice(-3)}|WIN✅✅✅✅`);
                        bot.sendSticker(chatId, winStickerId); 
                        if (totalWinCount >= sessionWinLimit) stopPrediction(chatId);
                    } else {
                        lastEntry.status = "LOSS";
                        lastResultStatus = "LOSS";
                        totalLossCount++;
                        bot.sendMessage(chatId, `| PD: ${match.issueNumber.slice(-3)}LOSS🚫🚫🚫🚫`);
                    }
                }
            }
        }

        // ২. প্রেডিকশন পাঠানো: টাইমার যখন ৪৫-৪০ সেকেন্ডে (অর্থাৎ ঘড়ির ১৫-২০ সেকেন্ডে)
        // ১ মিনিট মার্কেটে ঘড়ির ১৫-২০ সেকেন্ড মানেই কাউন্টডাউন ৪৫-৪০ সেকেন্ড বাকি
        const nextPeriod = getNextPeriod();
        if (nextPeriod !== lastAnalyzedPeriod && seconds >= 15 && seconds <= 20) {
            lastAnalyzedPeriod = nextPeriod;
            let prediction = "";

            if (lastResultStatus === "WIN" && sessionResults.length > 0) {
                prediction = sessionResults[sessionResults.length - 1].prediction;
            } else {
                const response = await axios.get(`${HISTORY_API}?pageSize=10&pageNo=1&type=1`);
                const apiList = response.data.data.list;
                const lastFive = apiList.slice(0, 5).map(item => parseInt(item.number) >= 5 ? "BIG" : "SMALL");

                if (lastFive.every(v => v === "BIG")) prediction = "BIG";
                else if (lastFive.every(v => v === "SMALL")) prediction = "SMALL";
                else {
                    const n1 = parseInt(apiList[0].number);
                    const n2 = parseInt(apiList[1].number);
                    prediction = chartData[`${n1}/${n2}`] || "BIG";
                }
            }

            sessionResults.push({ period: nextPeriod, prediction: prediction, status: "Pending" });
            let msg = `🎖️ 𝐖𝐈𝐍𝐆𝐎 𝟏𝐌𝐈𝐍 🎖️\n\n🔰 🅿🅳: ${nextPeriod}\n\n🎯 𝐏𝐑𝐄𝐃: *${prediction}* 🎯`;
            bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
        }
    } catch (e) { console.log("Loop Error"); }
}

bot.onText(/\/prediction/, (msg) => startPrediction(msg.chat.id));
bot.onText(/\/close/, (msg) => stopPrediction(msg.chat.id));

const times = [
    '00 07 * * *', '30 07 * * *', '30 08 * * *', '30 15 * * *',
    '30 16 * * *', '00 17 * * *', '00 18 * * *', '30 18 * * *',
    '30 23 * * *', '30 12 * * *'
];
times.forEach(t => schedule.scheduleJob(t, () => startPrediction(chatId)));

setInterval(checkAndPredict, 1000);
