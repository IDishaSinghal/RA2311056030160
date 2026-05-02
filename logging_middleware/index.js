const express = require("express");
require("./db");
require("dotenv").config();

const app = express();
app.use(express.json());

app.use("/api", require("./routes/auth"));

app.listen(3000, () => console.log("Server running on port 3000"));