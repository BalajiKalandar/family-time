const express = require("express");
const { chromium } = require("playwright");
const cors = require("cors");
const cron = require("node-cron");
const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config();

// --- TELEGRAM BOT SETUP ---
const TelegramBotModule = require("node-telegram-bot-api");
const TelegramBot = TelegramBotModule.default || TelegramBotModule;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
let bot;
if (telegramToken) {
  bot = new TelegramBot(telegramToken, { polling: true });
  bot.on("polling_error", (error) =>
    console.error("Telegram Polling Error:", error.message),
  );
  console.log("✅ Telegram Bot initialized.");
}

function sendTelegramMessage(chatId, message) {
  if (!bot) return;
  bot
    .sendMessage(chatId, message)
    .catch((err) => console.error("Telegram Error:", err.message));
}

// --- DATABASE & ENCRYPTION SETUP ---
const MONGO_URI = process.env.MONGODB_URI;
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, "utf8"); // Must be 32 chars
const ALGORITHM = "aes-256-cbc";

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(text) {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift(), "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Connect to MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error(err));

// User Schema
const userSchema = new mongoose.Schema({
  greythrUsername: String,
  greyhrPassword: String, // Stored encrypted!
  telegramChatId: String,
});
const User = mongoose.model("User", userSchema);

// --- IN-MEMORY SCHEDULES FOR THE DAY ---
let todaysSchedules = [];

// --- PLAYWRIGHT SCRAPING LOGIC ---
const GREYTHR_URL =
  "https://ceinsys-tech.greythr.com/v3/portal/ess/attendance/attendance-info";

async function scrapeAttendance(username, password) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    console.log(`[${username}] Logging into greyHR...`);
    await page.goto("https://ceinsys-tech.greythr.com/");
    await page.fill("#username", username);
    await page.fill("#password", password);
    await page.click(
      "xpath=/html/body/app-root/uas-portal/div/div/main/div/section/div[1]/o-auth/section/div/app-login/section/div/div/div/form/div[4]/button",
    );

    await page.waitForTimeout(7000);
    await page.goto(GREYTHR_URL);
    await page.waitForTimeout(5000);

    const inTimeXPath =
      "xpath=/html/body/app/ng-component/div/div/div[2]/div/gt-attendance-info-calendar/div[1]/div[2]/div[2]/div/div[5]/accordion/accordion-group/div/div[2]/div/table[1]/tbody/tr/td[1]/p[1]";
    const inTime = await page.textContent(inTimeXPath).catch(() => null);
    const attendanceStatus = "Normal"; // Default for now

    if (!inTime) {
      await page.screenshot({ path: `error-${username}.png` });
      throw new Error("Could not find In-Time.");
    }

    await browser.close();
    return { inTime: inTime.trim(), attendanceStatus };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

function calculateOutTime(inTime, status) {
  let inDate = new Date();
  let [time, modifier] = inTime.split(" ");
  let [hours, minutes] = time.split(":");
  if (modifier === "PM" && hours !== "12") hours = parseInt(hours) + 12;
  if (modifier === "AM" && hours === "12") hours = "0";

  inDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  let requiredHours = 9.5;
  if (status.includes("Comp-off")) requiredHours = 8.5;
  if (status.includes("Regularization")) requiredHours = 7.0;

  let outDate = new Date(inDate.getTime() + requiredHours * 60 * 60 * 1000);
  return outDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- EXPRESS API ---
const app = express();
app.use(cors());
app.use(express.json());

// 1. Registration Endpoint (User uses this once)
app.post("/api/register", async (req, res) => {
  const { username, password, chatId, testNow } = req.body;
  if (!username || !password || !chatId)
    return res.status(400).json({ error: "Missing fields" });

  try {
    // 2. Check if user already exists
    const existingUser = await User.findOne({ greythrUsername: username });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User already exists with this Employee ID." });
    }

    // Encrypt and save new user
    const encryptedPassword = encrypt(password);
    const newUser = new User({
      greythrUsername: username,
      greyhrPassword: encryptedPassword,
      telegramChatId: chatId,
    });
    await newUser.save();

    // 1. If user said "Yes, I'm in the office", test the pipeline immediately
    if (testNow) {
      try {
        const { inTime, attendanceStatus } = await scrapeAttendance(
          username,
          password,
        );
        const outTime = calculateOutTime(inTime, attendanceStatus);

        // Send confirmation Telegram message
        sendTelegramMessage(
          chatId,
          `✅ Credentials Verified! You are currently in office.\nIn-Time: ${inTime}\nOut-Time: ${outTime}`,
        );

        return res.json({
          success: true,
          message: "Registered and tested successfully! Check your Telegram.",
        });
      } catch (scrapeErr) {
        return res.json({
          success: true,
          message:
            "Registered, but couldn't scrape right now. Are you in office?",
        });
      }
    }

    res.json({
      success: true,
      message: "Registered successfully! You can close this app forever.",
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// --- CRON JOBS ---

// 2. The 2:00 PM Batch Scrape
cron.schedule("0 14 * * *", async () => {
  console.log("⏰ 2:00 PM: Starting batch scrape...");
  const users = await User.find({});
  todaysSchedules = []; // Reset daily schedules

  for (const user of users) {
    try {
      const decryptedPassword = decrypt(user.greyhrPassword);
      const { inTime, attendanceStatus } = await scrapeAttendance(
        user.greythrUsername,
        decryptedPassword,
      );
      const outTime = calculateOutTime(inTime, attendanceStatus);

      // Calculate Out-Time in milliseconds for the minute-by-minute checker
      let outDate = new Date();
      let [time, modifier] = outTime.split(" ");
      let [hours, minutes] = time.split(":");
      if (modifier === "PM" && hours !== "12") hours = parseInt(hours) + 12;
      if (modifier === "AM" && hours === "12") hours = "0";
      outDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      todaysSchedules.push({
        chatId: user.telegramChatId,
        outTime: outTime,
        outTimeMs: outDate.getTime(),
        sent10MinWarning: false,
        sent2MinWarning: false,
      });

      // Send 2:00 PM Message
      sendTelegramMessage(
        user.telegramChatId,
        `✅ Your Out-Time today is ${outTime}.`,
      );
    } catch (error) {
      console.error(`Failed for user ${user.greythrUsername}:`, error.message);
      sendTelegramMessage(
        user.telegramChatId,
        "⚠️ Failed to scrape your attendance today. Please check manually.",
      );
    }
  }
  console.log("✅ Batch scrape complete.");
});

// 3. The Every-Minute Checker (For 10-min warning)

cron.schedule("* * * * *", () => {
  const nowMs = Date.now();
  const TEN_MINS_MS = 10 * 60 * 1000;
  const TWO_MINS_MS = 2 * 60 * 1000; // Added 2 mins

  todaysSchedules.forEach((schedule, index) => {
    const diff = schedule.outTimeMs - nowMs;

    // 10 mins before
    if (diff <= TEN_MINS_MS && diff > 0 && !schedule.sent10MinWarning) {
      sendTelegramMessage(
        schedule.chatId,
        `⏰ 10 Minutes Left! Your out-time is ${schedule.outTime}. Wrap up your work.`,
      );
      schedule.sent10MinWarning = true;
    }

    // 3. 2 mins before
    if (diff <= TWO_MINS_MS && diff > 0 && !schedule.sent2MinWarning) {
      sendTelegramMessage(
        schedule.chatId,
        `🚨 2 Minutes Left! Get ready to log out. Out-time is ${schedule.outTime}.`,
      );
      schedule.sent2MinWarning = true;
    }

    // Clean up
    if (diff < -60000) {
      todaysSchedules.splice(index, 1);
    }
  });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
