import React, { useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";

// --- Icons (Added explicit width/height) ---
const UserIcon = () => (
  <svg
    width="20"
    height="20"
    xmlns="http://www.w3.org/2000/svg"
    className="text-gray-400"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
      clipRule="evenodd"
    />
  </svg>
);
const LockIcon = () => (
  <svg
    width="20"
    height="20"
    xmlns="http://www.w3.org/2000/svg"
    className="text-gray-400"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
      clipRule="evenodd"
    />
  </svg>
);
const TelegramIcon = () => (
  <svg
    width="20"
    height="20"
    xmlns="http://www.w3.org/2000/svg"
    className="text-gray-400"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.061 3.345-.48.327-.913.489-1.302.481-.428-.009-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.324-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

export default function App() {
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
    chatId: "",
  });
  const [testNow, setTestNow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [regHours, setRegHours] = useState(2.5);
  const [serverMessage, setServerMessage] = useState("");
  const [error, setError] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setServerMessage("");

    try {
      const res = await axios.post(
        "https://greyhr-backend.onrender.com/api/register",
        { ...credentials, testNow, regHours },
      );
      if (res.data.success) {
        setServerMessage(res.data.message);
        setRegistered(true);
      }
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setError(err.response.data.error);
      } else {
        setError("Registration failed. Please try again.");
      }
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-black flex items-center justify-center p-4 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-gray-800/50 backdrop-blur-xl p-8 rounded-3xl shadow-2xl shadow-blue-950/30 w-full max-w-md border border-gray-700/50"
      >
        {!registered ? (
          <form onSubmit={handleRegister} className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                greyHR Automation
              </h1>
              <p className="text-sm text-gray-400 mt-2">
                Register once. Get automatic Telegram alerts daily.
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm text-center"
              >
                {error}
              </motion.div>
            )}

            {/* Inputs */}
            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-blue-400 transition-colors">
                  <UserIcon />
                </div>
                <input
                  type="text"
                  placeholder="greyHR Username"
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-900/50 rounded-xl border border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-200 placeholder-gray-500"
                  onChange={(e) =>
                    setCredentials({ ...credentials, username: e.target.value })
                  }
                />
              </div>

              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-blue-400 transition-colors">
                  <LockIcon />
                </div>
                <input
                  type="password"
                  placeholder="greyHR Password"
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-900/50 rounded-xl border border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-200 placeholder-gray-500"
                  onChange={(e) =>
                    setCredentials({ ...credentials, password: e.target.value })
                  }
                />
              </div>

              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 group-focus-within:text-blue-400 transition-colors">
                  <TelegramIcon />
                </div>
                <input
                  type="text"
                  placeholder="Telegram Chat ID"
                  required
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-900/50 rounded-xl border border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-200 placeholder-gray-500"
                  onChange={(e) =>
                    setCredentials({ ...credentials, chatId: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Custom Checkbox */}
            <div
              onClick={() => setTestNow(!testNow)}
              className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${testNow ? "bg-blue-500/10 border-blue-500/50" : "bg-gray-900/30 border-gray-700 hover:border-gray-600"}`}
            >
              <div
                className={`w-5 h-5 rounded-md flex items-center justify-center border ${testNow ? "bg-blue-500 border-blue-500" : "border-gray-500"}`}
              >
                {testNow && (
                  <svg
                    width="14"
                    height="14"
                    xmlns="http://www.w3.org/2000/svg"
                    className="text-white"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <span className="text-sm text-gray-300">
                I am in the office right now{" "}
                <span className="text-gray-500">
                  (Verify & get Out-Time instantly)
                </span>
              </span>
            </div>

            <div className="relative group">
              <label className="text-sm text-gray-400 ml-1 mb-1 block">
                Your Regularization Deduction Hours
              </label>
              <select
                className="w-full px-4 py-3.5 bg-gray-900/50 rounded-xl border border-gray-700 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-200"
                value={regHours}
                onChange={(e) => setRegHours(parseFloat(e.target.value))}
              >
                <option value="2.5">2.5 Hours (7 hrs required)</option>
                <option value="2">2 Hours (7.5 hrs required)</option>
                <option value="1.5">1.5 Hours (8 hrs required)</option>
              </select>
            </div>
            {/* Submit Button */}
            <motion.button
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
              type="submit"
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 p-3.5 rounded-xl font-semibold text-white hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-900/40 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg
                    width="20"
                    height="20"
                    className="animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Opening browser & scraping...
                </>
              ) : (
                "Register for Daily Alerts"
              )}
            </motion.button>
          </form>
        ) : (
          <div className="text-center py-4">
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/30"
            >
              <svg
                width="40"
                height="40"
                xmlns="http://www.w3.org/2000/svg"
                className="text-green-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold text-white mb-2"
            >
              Registration Complete!
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-sm text-gray-400 mb-6 px-4"
            >
              {serverMessage}
              <br />
              <br />
              {new Date().getHours() < 14 ? (
                <span>
                  You will receive your first batch of notifications{" "}
                  <strong className="text-blue-400">today at 2:00 PM</strong>,
                  10 mins before, and 2 mins before your out-time.
                </span>
              ) : (
                <span>
                  You will receive your first batch of notifications{" "}
                  <strong className="text-blue-400">tomorrow at 2:00 PM</strong>
                  , 10 mins before, and 2 mins before your out-time.
                </span>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 text-sm text-gray-500"
            >
              🔒 Your credentials are encrypted. <br />
              You can safely close this page.
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
