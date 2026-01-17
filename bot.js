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
let lastResultStatus = ""; 

const HISTORY_API = 'https://draw.ar-lottery01.com/WinGo/WinGo_1M/GetHistoryIssuePage.json';

// ১. পিরিয়ড ক্যালকুলেশন
function getNextPeriod() {
    const now = new Date();
    const datePrefix = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
    const totalMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    return datePrefix + "1000" + String(10001 + totalMinutes);
}

// ২. সেশন শুরু (সবার আগে স্টিকার)
async function startPrediction() {
    if (isRunning) return;
    isRunning = true;
    totalWinCount = 0; totalLossCount = 0; sessionResults = []; lastResultStatus = "";
    try {
        await bot.sendSticker(chatId, sessionStartStickerId);
        await bot.sendMessage(chatId, "🚀 *Season Started! Target: 15 Wins*", {parse_mode: 'Markdown'});
    } catch (e) { console.log("Start Error"); }
}

// ৩. সেশন শেষ (সবার শেষে স্টিকার এবং রিপোর্ট)
async function stopPrediction() {
    if (!isRunning) return;
    await sendReport(); // অটোমেটিক রিপোর্ট যাবে
    isRunning = false;
    try {
        setTimeout(async () => {
            await bot.sendSticker(chatId, sessionEndStickerId);
        }, 2000); 
    } catch (e) { console.log("End Error"); }
}

// ৪. রিপোর্ট ফরম্যাট (আপনার দেওয়া স্টাইল অনুযায়ী)
async function sendReport() {
    if (sessionResults.length === 0) return;
    let reportMsg = `🏆 SESSION SUMMARY REPORT 🏆\n\n----------------------------------------\n\n`;
    sessionResults.forEach((res, index) => {
        let statusEmoji = res.status === "WIN" ? "WIN ✅✅✅✅" : (res.status === "LOSS" ? "Loss 🚫🚫🚫🚫" : "Pending ⌛");
        reportMsg += `${index + 1}. PD: ${res.period.slice(-3)} | ${statusEmoji}\n\n`;
    });
    reportMsg += `-----------------------------------------\n\n✅ Total Wins: ${totalWinCount}\n\n🚫 Total Losses: ${totalLossCount}\n\n🎯 Powered by RK VIP System`;
    await bot.sendMessage(chatId, reportMsg);
}

// ৫. ট্রেন্ড অ্যানালাইজার লজিক
async function getTrendPrediction() {
    try {
        const resp = await axios.get(`${HISTORY_API}?pageSize=6&pageNo=1&type=1`);
        const list = resp.data.data.list;
        const results = list.slice(0, 5).map(item => parseInt(item.number) >= 5 ? "BIG" : "SMALL");
        
        // টানা ৫টি চেক
        const allSame = results.every(val => val === results[0]);
        if (allSame) {
            return results[0]; // ট্রেন্ড ফলো করবে
        }
        
        // সাধারণ লজিক (শেষের রেজাল্টের বিপরীত)
        return results[0] === "BIG" ? "SMALL" : "BIG";
    } catch (e) { return "BIG"; }
}

// ৬. রেজাল্ট চেক এবং প্রেডিকশন লুপ
async function checkAndPredict() {
    if (!isRunning) return;
    const seconds = new Date().getUTCSeconds();

    // রেজাল্ট চেক (৮-১৮ সেকেন্ডে)
    if (seconds >= 8 && seconds <= 18 && sessionResults.length > 0) {
        let lastEntry = sessionResults[sessionResults.length - 1];
        if (lastEntry.status === "Pending") {
            try {
                const resp = await axios.get(`${HISTORY_API}?pageSize=2&pageNo=1&type=1`);
                const match = resp.data.data.list.find(h => h.issueNumber === lastEntry.period);
                if (match) {
                    const actual = parseInt(match.number) >= 5 ? "BIG" : "SMALL";
                    if (lastEntry.prediction === actual) {
                        lastEntry.status = "WIN"; lastResultStatus = "WIN"; totalWinCount++;
                        await bot.sendMessage(chatId, `✅ WIN | PD: ${match.issueNumber.slice(-3)}`);
                        await bot.sendSticker(chatId, winStickerId);
                        if (totalWinCount >= 15) await stopPrediction();
                    } else {
                        lastEntry.status = "LOSS"; lastResultStatus = "LOSS"; totalLossCount++;
                        await bot.sendMessage(chatId, `🚫 LOSS | PD: ${match.issueNumber.slice(-3)}`);
                    }
                }
            } catch (e) { }
        }
    }

    // নতুন প্রেডিকশন (১-৫ সেকেন্ডে)
    const currentPD = getNextPeriod();
    if (currentPD !== lastAnalyzedPeriod && seconds >= 1 && seconds <= 5) {
        lastAnalyzedPeriod = currentPD;
        const prediction = await getTrendPrediction();
        sessionResults.push({ period: currentPD, prediction, status: "Pending" });
        bot.sendMessage(chatId, `🎖️ 𝐖𝐈𝐍𝐆𝐎 𝟏𝐌𝐈𝐍 🎖️\n\n🔰 🅿🅳: ${currentPD}\n\n🎯 𝐏𝐑𝐄𝐃: *${prediction}* 🎯`, {parse_mode: 'Markdown'});
    }
}

// ৭. কমান্ড হ্যান্ডলার
bot.onText(/\/prediction/, (msg) => startPrediction());
bot.onText(/\/close/, (msg) => stopPrediction());
bot.onText(/\/report/, (msg) => sendReport());

// ৮. অটোমেটিক সময়সূচী (১০টি সময়)
const sessionTimes = [
    '00 07 * * *', '30 07 * * *', '30 08 * * *', '30 15 * * *',
    '30 16 * * *', '00 17 * * *', '00 18 * * *', '30 18 * * *',
    '30 23 * * *', '30 12 * * *'
];
sessionTimes.forEach(time => schedule.scheduleJob(time, startPrediction));

setInterval(checkAndPredict, 1000);
http.createServer((req, res) => { res.writeHead(200); res.end('RK Bot Active'); }).listen(process.env.PORT || 3000);
