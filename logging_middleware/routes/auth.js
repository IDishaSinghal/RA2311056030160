const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Log } = require("../logger");
require("dotenv").config();

const router = express.Router();

// Simple User Model
const User = mongoose.model("User", new mongoose.Schema({
  username: String,
  password: String
}));

// REGISTER
router.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashed });

    await Log("backend", "info", "handler", `User registered: ${username}`);

    res.json({ message: "Registered!", user });
  } catch (err) {
    await Log("backend", "error", "handler", `Register failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// LOGIN
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      await Log("backend", "warning", "handler", `Login failed - user not found: ${username}`);
      return res.status(404).json({ error: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      await Log("backend", "warning", "handler", `Login failed - wrong password: ${username}`);
      return res.status(401).json({ error: "Wrong password" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    // Save token to .env so logger can use it
    process.env.AUTH_TOKEN = token;

    await Log("backend", "info", "handler", `User logged in: ${username}`);

    res.json({ message: "Logged in!", token });
  } catch (err) {
    await Log("backend", "error", "handler", `Login error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;