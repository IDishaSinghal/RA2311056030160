require("dotenv").config();
const { Log } = require("./logger");

const BASE_URL = "http://20.207.122.201/evaluation-service";
const TOKEN = process.env.AUTH_TOKEN;

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Content-Type": "application/json"
};

// Knapsack algorithm - finds best combo of vehicles within mechanic hours
function knapsack(vehicles, maxHours) {
  const n = vehicles.length;
  const dp = Array(n + 1).fill(null).map(() => Array(maxHours + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    const { Duration, Impact } = vehicles[i - 1];
    for (let w = 0; w <= maxHours; w++) {
      dp[i][w] = dp[i - 1][w];
      if (Duration <= w) {
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - Duration] + Impact);
      }
    }
  }

  // Backtrack to find which vehicles were selected
  let w = maxHours;
  const selected = [];
  for (let i = n; i > 0; i--) {
    if (dp[i][w] !== dp[i - 1][w]) {
      selected.push(vehicles[i - 1]);
      w -= vehicles[i - 1].Duration;
    }
  }

  return {
    totalImpact: dp[n][maxHours],
    selectedVehicles: selected
  };
}

async function main() {
  try {
    await Log("backend", "info", "handler", "Vehicle scheduler started");

    // Step 1 - Fetch depots
    const depotRes = await fetch(`${BASE_URL}/depots`, { headers });
    const depotData = await depotRes.json();
    const depots = depotData.depots;

    await Log("backend", "info", "handler", `Fetched ${depots.length} depots`);

    // Step 2 - Fetch vehicles
    const vehicleRes = await fetch(`${BASE_URL}/vehicles`, { headers });
    const vehicleData = await vehicleRes.json();
    const vehicles = vehicleData.vehicles;

    await Log("backend", "info", "handler", `Fetched ${vehicles.length} vehicles`);

    // Step 3 - For each depot, find best vehicle combo
    const results = [];

    for (const depot of depots) {
      const { ID, MechanicHours } = depot;

      await Log("backend", "info", "handler", `Processing depot ${ID} with ${MechanicHours} mechanic hours`);

      const { totalImpact, selectedVehicles } = knapsack(vehicles, MechanicHours);

      results.push({
        depotID: ID,
        mechanicHours: MechanicHours,
        totalImpact,
        selectedVehicles: selectedVehicles.map(v => v.TaskID)
      });

      await Log("backend", "info", "handler", 
        `Depot ${ID}: selected ${selectedVehicles.length} vehicles, total impact: ${totalImpact}`
      );

      // Print result to console
      console.log(`\n=== Depot ${ID} (${MechanicHours} hours) ===`);
      console.log(`Total Impact: ${totalImpact}`);
      console.log(`Selected Vehicles:`, selectedVehicles.map(v => v.TaskID));
    }

    await Log("backend", "info", "handler", "Vehicle scheduler completed successfully");

    console.log("\n\n=== FINAL RESULTS ===");
    console.log(JSON.stringify(results, null, 2));

  } catch (err) {
    await Log("backend", "error", "handler", `Vehicle scheduler failed: ${err.message}`);
    console.error("Error:", err.message);
  }
}

main();