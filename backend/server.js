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
  greyhrPassword: String,
  telegramChatId: String,
  regularizationHours: { type: Number, default: 0 },
  regularizationCount: { type: Number, default: 0 },
  cycleEndDate: { type: Date, default: null },
});
const User = mongoose.model("User", userSchema);

// Helper function to get the upcoming 14th of the month
function getUpcoming14th() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0 = Jan, 11 = Dec

  let cycleEnd;
  if (today.getDate() <= 14) {
    cycleEnd = new Date(currentYear, currentMonth, 14, 23, 59, 59);
  } else {
    cycleEnd = new Date(currentYear, currentMonth + 1, 14, 23, 59, 59);
  }
  return cycleEnd;
}

// --- IN-MEMORY SCHEDULES FOR THE DAY ---
let todaysSchedules = [];

// --- PLAYWRIGHT SCRAPING LOGIC ---
const GREYTHR_URL =
  "https://ceinsys-tech.greythr.com/v3/portal/ess/attendance/attendance-info";

async function scrapeAttendance(username, password) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    console.log(`[${username}] Logging into greyHR...`);
    await page.goto("https://ceinsys-tech.greythr.com/", {
      waitUntil: "domcontentloaded",
    });

    await page.fill("#username", username);
    await page.fill("#password", password);
    await page.click(
      "xpath=/html/body/app-root/uas-portal/div/div/main/div/section/div[1]/o-auth/section/div/app-login/section/div/div/div/form/div[4]/button",
    );

    // Wait for login to process
    await page.waitForTimeout(8000);

    console.log(`[${username}] Navigating directly to Attendance Info URL...`);
    await page.goto(GREYTHR_URL, { waitUntil: "domcontentloaded" });

    // Give the Angular SPA plenty of time to render backend data on slow cloud servers
    await page.waitForTimeout(8000);

    // Try to click Swipes just in case, but don't crash if it fails
    try {
      console.log(`[${username}] Trying to click Swipes...`);
      const swipeBtn = page.getByText(/Swipe/i).first();
      await swipeBtn.click({ timeout: 3000 });
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log("Swipes click skipped (will read hidden DOM instead).");
    }

    let inTime = null;

    // Regex to match "08:41:16 am" or "08:41 am"
    const timeRegexStr = "\\d{1,2}:\\d{2}(:\\d{2})?\\s*[ap]m";

    for (let i = 0; i < 4; i++) {
      console.log(`[${username}] Attempt ${i + 1} to find In-Time...`);
      try {
        // We use 'attached' instead of 'visible'!
        // This finds the time even if the accordion is collapsed and hiding it.
        const timeElement = page.locator(`text=/${timeRegexStr}/i`).first();
        await timeElement.waitFor({ state: "attached", timeout: 5000 });
        inTime = await timeElement.textContent({ timeout: 5000 });
      } catch (e) {
        // retry
      }

      if (inTime && inTime.match(/\d{1,2}:\d{2}/)) {
        console.log(
          `[${username}] Found In-Time successfully: ${inTime.trim()}`,
        );
        break; // Exit loop if found
      }
      await page.waitForTimeout(3000);
    }

    const attendanceStatus = "Normal";

    if (!inTime || !inTime.match(/\d{1,2}:\d{2}/)) {
      await page.screenshot({ path: `error-${username}.png` });
      throw new Error("Could not find In-Time in the DOM.");
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
  // Split by space: ["08:41:16", "am"]
  let [time, modifier] = inTime.split(" ");
  // Split by colon: ["08", "41", "16"]
  let timeParts = time.split(":");
  let hours = timeParts[0];
  let minutes = timeParts[1]; // We only need hours and minutes for calculation

  if (modifier.toUpperCase() === "PM" && hours !== "12")
    hours = parseInt(hours) + 12;
  if (modifier.toUpperCase() === "AM" && hours === "12") hours = "0";

  inDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

  let requiredHours = 9.5; // Default 9 hrs 30 mins
  if (status.includes("Comp-off")) requiredHours = 8.5;
  if (status.includes("Regularization")) requiredHours = 7.0;

  let outDate = new Date(inDate.getTime() + requiredHours * 60 * 60 * 1000);
  return outDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// --- EXPRESS API ---
const app = express();
app.use(cors());
app.use(express.json());

// 0. Homepage (For UptimeRobot)
app.get("/", (req, res) => {
  res.status(200).send("Backend is alive and running!");
});

// 1. Registration Endpoint
app.post("/api/register", async (req, res) => {
  const { username, password, chatId, testNow, regHours } = req.body;
  if (!username || !password || !chatId)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const existingUser = await User.findOne({ greythrUsername: username });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User already exists with this Employee ID." });
    }

    const encryptedPassword = encrypt(password);
    const newUser = new User({
      greythrUsername: username,
      greyhrPassword: encryptedPassword,
      telegramChatId: chatId,
      regularizationHours: regHours,
      regularizationCount: 0,
      cycleEndDate: getUpcoming14th(),
    });
    await newUser.save();

    if (testNow) {
      try {
        const { inTime, attendanceStatus } = await scrapeAttendance(
          username,
          password,
        );
        const outTime = calculateOutTime(inTime, attendanceStatus);
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

// --- TELEGRAM INTERACTIVE COMMANDS ---
bot.on("message", async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text ? msg.text.toLowerCase() : "";

  // Help command
  if (text === "/start" || text === "/help") {
    bot.sendMessage(
      chatId,
      "Hello! I am your greyHR assistant. Here are the commands you can use:\n\n" +
        "🟢 `/help` - Show this help message.\n" +
        "🟢 `/check` - Instantly check your standard Out-Time (9.5 hours) without waiting for 2:00 PM.\n" +
        "🟢 `/compoff` - Use this if you are working on a weekend/holiday. Calculates 8.5 hours.\n" +
        "🟢 `/regularize` - Apply a regularization for today. Calculates 9.5 hours minus your allowed deduction.\n" +
        "🟢 `/status` - Check your remaining regularization count for this cycle.",
      { parse_mode: "Markdown" },
    );
  }

  // Status command (Check count without scraping)
  if (text === "/status") {
    try {
      let user = await User.findOne({ telegramChatId: chatId });
      if (!user)
        return bot.sendMessage(
          chatId,
          "❌ You are not registered. Please register on the web app first.",
        );

      if (!user.cycleEndDate || new Date() > user.cycleEndDate) {
        user.regularizationCount = 0;
        user.cycleEndDate = getUpcoming14th();
        await user.save();
      }

      bot.sendMessage(
        chatId,
        `📊 *Regularization Status*\n\nUsed: ${user.regularizationCount}/5\nDeduction Hours: ${user.regularizationHours} hrs\nCycle Resets On: ${user.cycleEndDate.toDateString()}`,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      console.error("Status error:", err.message);
    }
  }
  // Check command (Instant standard 9.5h check)
  if (text === "/check" || text === "/outtime") {
    bot.sendMessage(
      chatId,
      "⏳ Checking your attendance right now... Scraping your In-Time... (Wait ~15s)",
    );

    try {
      const user = await User.findOne({ telegramChatId: chatId });
      if (!user) {
        return bot.sendMessage(
          chatId,
          "❌ You are not registered. Please register on the web app first.",
        );
      }

      // Scrape attendance
      const decryptedPassword = decrypt(user.greyhrPassword);
      const { inTime, attendanceStatus } = await scrapeAttendance(
        user.greythrUsername,
        decryptedPassword,
      );

      // Calculate standard Out-Time (9.5 hours)
      const outTime = calculateOutTime(inTime, attendanceStatus);

      // Parse outTime to Date object for scheduling
      let outDate = new Date();
      let [time, modifier] = outTime.split(" ");
      let [hours, minutes] = time.split(":");
      if (modifier === "PM" && hours !== "12") hours = parseInt(hours) + 12;
      if (modifier === "AM" && hours === "12") hours = "0";
      outDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      // Add/Update today's schedule so they still get the warnings!
      todaysSchedules = todaysSchedules.filter((s) => s.chatId !== chatId);
      todaysSchedules.push({
        chatId,
        outTime,
        outTimeMs: outDate.getTime(),
        sent10MinWarning: false,
        sent2MinWarning: false,
      });

      bot.sendMessage(
        chatId,
        `✅ *Standard Day Check*\nIn-Time: ${inTime}\nOut-Time: ${outTime}\n\nI have scheduled your 10-min and 2-min warnings for today.`,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      console.error("Check error:", err.message);
      bot.sendMessage(
        chatId,
        "❌ Failed to scrape. Make sure you have punched in on greyHR today.",
      );
    }
  }
  // Comp-off command
  if (text === "/compoff") {
    bot.sendMessage(
      chatId,
      "⏳ Processing your comp-off request. Scraping your In-Time... (Wait ~15s)",
    );

    try {
      const user = await User.findOne({ telegramChatId: chatId });
      if (!user) {
        return bot.sendMessage(
          chatId,
          "❌ You are not registered. Please register on the web app first.",
        );
      }

      const decryptedPassword = decrypt(user.greyhrPassword);
      const { inTime } = await scrapeAttendance(
        user.greythrUsername,
        decryptedPassword,
      );

      let inDate = new Date();
      let [time, modifier] = inTime.split(" ");
      let [hours, minutes] = time.split(":");
      if (modifier === "PM" && hours !== "12") hours = parseInt(hours) + 12;
      if (modifier === "AM" && hours === "12") hours = "0";
      inDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      let outDate = new Date(inDate.getTime() + 8.5 * 60 * 60 * 1000); // 8.5 hours
      const outTime = outDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      todaysSchedules = todaysSchedules.filter((s) => s.chatId !== chatId);
      todaysSchedules.push({
        chatId,
        outTime,
        outTimeMs: outDate.getTime(),
        sent10MinWarning: false,
        sent2MinWarning: false,
      });

      bot.sendMessage(
        chatId,
        `✅ *Comp-off Registered!*\nIn-Time: ${inTime}\nOut-Time: ${outTime}\n\nI will remind you 10 mins and 2 mins before your out-time.`,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      console.error("Compoff error:", err.message);
      bot.sendMessage(
        chatId,
        "❌ Failed to scrape. Make sure you have punched in on greyHR today.",
      );
    }
  }

  // Regularize command
  if (text === "/regularize") {
    try {
      let user = await User.findOne({ telegramChatId: chatId });
      if (!user) {
        return bot.sendMessage(
          chatId,
          "❌ You are not registered. Please register on the web app first.",
        );
      }

      // 1. Check and Reset Cycle (If past 14th)
      if (!user.cycleEndDate || new Date() > user.cycleEndDate) {
        user.regularizationCount = 0;
        user.cycleEndDate = getUpcoming14th();
      }

      // 2. Check if they have used their 5 limit
      if (user.regularizationCount >= 5) {
        return bot.sendMessage(
          chatId,
          `❌ You have already used your 5 regularization limit for this cycle (15th to 14th). Limit resets on ${user.cycleEndDate.toDateString()}.`,
        );
      }

      // Tell user their count before processing
      bot.sendMessage(
        chatId,
        `⏳ Processing your regularization request...\n\n*Current Status:* ${user.regularizationCount}/5 used.\nScraping your In-Time... (Wait ~15s)`,
        { parse_mode: "Markdown" },
      );

      // 3. Scrape attendance
      const decryptedPassword = decrypt(user.greyhrPassword);
      const { inTime } = await scrapeAttendance(
        user.greythrUsername,
        decryptedPassword,
      );

      // 4. Calculate Out-Time with deduction
      let inDate = new Date();
      let [time, modifier] = inTime.split(" ");
      let [hours, minutes] = time.split(":");
      if (modifier === "PM" && hours !== "12") hours = parseInt(hours) + 12;
      if (modifier === "AM" && hours === "12") hours = "0";
      inDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

      let requiredHours = 9.5 - user.regularizationHours;
      let outDate = new Date(inDate.getTime() + requiredHours * 60 * 60 * 1000);
      const outTime = outDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      // 5. Add to today's schedule
      todaysSchedules = todaysSchedules.filter((s) => s.chatId !== chatId);
      todaysSchedules.push({
        chatId,
        outTime,
        outTimeMs: outDate.getTime(),
        sent10MinWarning: false,
        sent2MinWarning: false,
      });

      // 6. Increment Count and Save to DB
      user.regularizationCount += 1;
      await user.save();

      bot.sendMessage(
        chatId,
        `✅ *Regularization Applied!*\nIn-Time: ${inTime}\nOut-Time: ${outTime}\n\nHours Deducted: ${user.regularizationHours} hrs\nRegularizations used this cycle: ${user.regularizationCount}/5\n\nI will remind you 10 mins and 2 mins before your out-time.`,
        { parse_mode: "Markdown" },
      );
    } catch (err) {
      console.error("Regularize error:", err.message);
      bot.sendMessage(
        chatId,
        "❌ Failed to scrape. Make sure you have punched in on greyHR today.",
      );
    }
  }
});

// --- CRON JOBS ---

// The 2:00 PM Batch Scrape (IST Timezone, Mon-Fri only)
cron.schedule(
  "0 14 * * 1-5",
  async () => {
    console.log("⏰ 2:00 PM IST: Starting batch scrape...");
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

        sendTelegramMessage(
          user.telegramChatId,
          `✅ Your Out-Time today is ${outTime}.`,
        );
      } catch (error) {
        console.error(
          `Failed for user ${user.greythrUsername}:`,
          error.message,
        );
        sendTelegramMessage(
          user.telegramChatId,
          "⚠️ Failed to scrape your attendance today. Please check manually.",
        );
      }
    }
    console.log("✅ Batch scrape complete.");
  },
  {
    timezone: "Asia/Kolkata",
  },
);

// 3. The Every-Minute Checker (For 10-min and 2-min warnings)
cron.schedule(
  "* * * * *",
  () => {
    const nowMs = Date.now();
    const TEN_MINS_MS = 10 * 60 * 1000;
    const TWO_MINS_MS = 2 * 60 * 1000;

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

      // 2 mins before
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
  },
  {
    timezone: "Asia/Kolkata",
  },
);

// --- START SERVER ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
