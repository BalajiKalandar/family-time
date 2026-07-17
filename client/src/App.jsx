import React, { useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";

export default function App() {
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
    chatId: "",
  });
  const [testNow, setTestNow] = useState(false); // Checkbox state
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [serverMessage, setServerMessage] = useState("");
  const [error, setError] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setServerMessage("");

    try {
      // Send testNow state to backend
      const res = await axios.post(
        "https://greyhr-backend.onrender.com/api/register",
        {
          ...credentials,
          testNow,
        },
      );

      if (res.data.success) {
        setServerMessage(res.data.message);
        setRegistered(true);
      }
    } catch (err) {
      // 2. Handle "User already exists" error
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
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700"
      >
        {!registered ? (
          <form onSubmit={handleRegister} className="space-y-4">
            <h1 className="text-2xl font-bold text-center text-blue-400">
              greyHR Auto-Register
            </h1>
            <p className="text-xs text-gray-400 text-center -mt-2">
              Enter details once. You'll get Telegram alerts automatically every
              day.
            </p>

            {error && (
              <div className="bg-red-500/20 text-red-400 p-3 rounded text-sm text-center">
                {error}
              </div>
            )}

            <input
              type="text"
              placeholder="greyHR Username"
              required
              className="w-full p-3 bg-gray-700 rounded outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) =>
                setCredentials({ ...credentials, username: e.target.value })
              }
            />
            <input
              type="password"
              placeholder="greyHR Password"
              required
              className="w-full p-3 bg-gray-700 rounded outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) =>
                setCredentials({ ...credentials, password: e.target.value })
              }
            />
            <input
              type="text"
              placeholder="Telegram Chat ID"
              required
              className="w-full p-3 bg-gray-700 rounded outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) =>
                setCredentials({ ...credentials, chatId: e.target.value })
              }
            />

            {/* 1. Checkbox for testing pipeline */}
            <div className="flex items-center bg-gray-700 p-3 rounded">
              <input
                type="checkbox"
                id="testNow"
                className="w-4 h-4 mr-3 accent-blue-500"
                checked={testNow}
                onChange={(e) => setTestNow(e.target.checked)}
              />
              <label
                htmlFor="testNow"
                className="text-sm text-gray-300 cursor-pointer"
              >
                I am in the office right now (Verify credentials & get Out-Time
                instantly)
              </label>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full bg-blue-600 p-3 rounded font-bold hover:bg-blue-700 transition-colors"
              disabled={loading}
            >
              {loading ? "Encrypting & Saving..." : "Register for Daily Alerts"}
            </motion.button>
          </form>
        ) : (
          <div className="text-center space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="text-6xl mb-4"
            >
              ✅
            </motion.div>
            <h2 className="text-xl text-green-400">Registration Complete!</h2>
            <div className="text-sm text-gray-400 mt-4">
              {serverMessage}
              <br />
              <br />
              Starting tomorrow, you will receive automatic Telegram
              notifications at 2:00 PM, 10 mins before, and 2 mins before your
              out-time.
              <br />
              <br />
              <strong>You can safely close this page.</strong>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
