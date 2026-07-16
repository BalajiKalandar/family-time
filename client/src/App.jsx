import React, { useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";

export default function App() {
  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
    chatId: "",
  });
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Change localhost to your Render URL when deployed
      const res = await axios.post(
        "https://greyhr-backend.onrender.com/api/register",
        credentials,
      );
      if (res.data.success) {
        setRegistered(true);
      }
    } catch (err) {
      alert("Registration failed. Check console.");
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
              Your password has been encrypted and saved securely.
              <br />
              <br />
              Starting tomorrow, you will receive automatic Telegram
              notifications at 2:00 PM and 10 minutes before your out-time.
              <br />
              <br />
              <strong>You can safely close this page and never return.</strong>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
