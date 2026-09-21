const dns = require("dns");
const mongoose = require("mongoose");
const env = require("./env");

// Ensure public DNS resolver is used for MongoDB Atlas SRV lookup in all environments
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore if not permitted
}

mongoose.set("strictQuery", true);

async function connectDB(){
    const conn = await mongoose.connect(env.mongoUri,{
        serverSelectionTimeoutMS:10_000,
    });
    console.log(`MongoDB connected : ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on("error",(err) => {
        console.log("MongoDB error : ",err.message);
    });

    mongoose.connection.on("disconnected",() => {
        console.warn("MongoDB disconnected");
    });
}

module.exports = {connectDB};