const fs = require("fs");
const path = require("path");


const LIMIT_FILE = path.join(__dirname, "../limits.json");


function loadData() {
return JSON.parse(fs.readFileSync(LIMIT_FILE, "utf8"));
}


function saveData(data) {
fs.writeFileSync(LIMIT_FILE, JSON.stringify(data, null, 2));
}


exports.checkLimit = (type) => (req, res, next) => {
const ip = req.ip;
const data = loadData();


if (!data[ip]) data[ip] = { image: 0, video: 0 };


if (type === "image" && data[ip].image >= 10)
return res.status(403).json({ message: "Image limit reached" });


if (type === "video" && data[ip].video >= 5)
return res.status(403).json({ message: "Video limit reached" });


data[ip][type]++;
saveData(data);


next();
};

exports.resetLimits = () => {
const data = {};
saveData(data);
};

// Reset limits every 24 hours
setInterval(exports.resetLimits, 24 * 60 * 60 * 1000);
exports.resetLimits();

