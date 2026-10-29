require("dotenv").config();
const path = require("path");

const R = require("../src/models/RoadmapItem");
console.log("resolved model file:", require.resolve("../src/models/RoadmapItem"));
console.log("schema has source:", Boolean(R.schema.path("source")), "| jdId required:", R.schema.path("jdId").options.required);

const routes = require.resolve("../src/routes/roadmap");
const src = require("fs").readFileSync(routes, "utf8");
const needle = 'source: { $ne: "resume_baseline" }';
console.log("routes file:", routes);
console.log("routes contains filter:", src.includes(needle));

const m = require("mongoose");
(async () => {
  await m.connect(process.env.MONGO_URI);
  const R2 = m.model("RoadmapItem");
  const docs = await R2.find({}).lean();
  console.log("total docs:", docs.length);
  process.exit(0);
})();
