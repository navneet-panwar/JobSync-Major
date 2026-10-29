const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

router.get("/",(req,res) =>{
    const states = ["disconnected","connected","connecting","disconnecting"];

    // Report the subsystems that can silently degrade, so an operator can tell
    // "the app is broken" from "email is unconfigured" without reading logs.
    // AI and email are optional by design — the app works without either.
    let queue = { pending: 0, size: 0 };
    let email = { configured: false };
    let geminiConfigured = false;
    try {
        queue = require("../shared/queue").queueStats();
        email = require("../services/emailService").emailStatus();
        geminiConfigured = Boolean(require("../config/env").geminiApiKey);
    } catch (err) {
        console.error("[health] subsystem probe failed:", err.message);
    }

    res.json({
        status : "ok",
        uptime : process.uptime(),
        db: states[mongoose.connection.readyState] || "unknown",
        ai: { configured: geminiConfigured },
        email: {
            configured: email.configured,
            provider: email.provider || null,
            sentToday: email.sentToday ?? 0,
            dailyCap: email.dailyCap ?? null,
        },
        bulkQueue: queue,
        timestamp : new Date().toISOString(),
    });
});

module.exports = router;