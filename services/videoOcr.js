const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const imageOcr = require("./imageOcr");

module.exports = function videoOcr(videoPath) {
  return new Promise((resolve, reject) => {
    const framePath = videoPath + ".png";

    ffmpeg(videoPath)
      .screenshots({
        count: 1,
        filename: path.basename(framePath),
        folder: path.dirname(videoPath)
      })
      .on("end", async () => {
        try {
          const text = await imageOcr(framePath);
          resolve(text);
        } catch (e) {
          reject(e);
        }
      })
      .on("error", reject);
  });
};

