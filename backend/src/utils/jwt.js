const jwt = require("jsonwebtoken");
const env = require("../config/env");

function signToken(paylaod) {
    return jwt.sign(paylaod, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

}

function verifyToken(token) {
    return jwt.verify(token, env.jwtSecret);
}


const cookieOptions = {
    httpOnly: true,
    secure: env.isProd,
    sameSite: env.isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
};
module.exports = {signToken, verifyToken, cookieOptions};

