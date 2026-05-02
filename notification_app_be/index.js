require("dotenv").config();
const { Log } = require("../logging_middleware/logger");

const TOKEN = process.env.AUTH_TOKEN;

const TYPE_WEIGHT = {
  "Placement": 3,
  "Result": 2,
  "Event": 1
};

function getPriorityScore(notification) {
  const weight = TYPE_WEIGHT[notification.Type] || 0;
  const ageMs = Date.now() - new Date(notification.Timestamp).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const recency = 1 / (ageHours + 1);
  return weight + recency;
}

async function main() {
  try {
    await Log("backend", "info", "handler", "Fetching notifications from API");

    const res = await fetch("http://20.207.122.201/evaluation-service/notifications", {
      headers: {
        "Authorization": `Bearer ${TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    const data = await res.json();
    const notifications = data.notifications;

    await Log("backend", "info", "handler", `Fetched ${notifications.length} notifications`);

    // Score and sort
    const scored = notifications.map(n => ({
      ...n,
      score: getPriorityScore(n)
    }));

    scored.sort((a, b) => b.score - a.score);

    const top10 = scored.slice(0, 10);

    await Log("backend", "info", "handler", "Top 10 priority notifications selected");

    console.log("\n=== TOP 10 PRIORITY NOTIFICATIONS ===\n");
    top10.forEach((n, i) => {
      console.log(`${i + 1}. [${n.Type}] ${n.Message}`);
      console.log(`   Score: ${n.score.toFixed(4)} | Time: ${n.Timestamp}\n`);
    });

  } catch (err) {
    await Log("backend", "error", "handler", `Notification priority failed: ${err.message}`);
    console.error("Error:", err.message);
  }
}

main();