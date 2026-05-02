require("dotenv").config();

async function Log(stack, level, pkg, message) {
  try {
    await fetch("http://20.207.122.201/evaluation-service/logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.AUTH_TOKEN}`
      },
      body: JSON.stringify({
        stack,
        level,
        package: pkg,
        message
      })
    });
  } catch (err) {
    console.error("Log failed:", err.message);
  }
}

module.exports = { Log };