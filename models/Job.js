const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const JobSchema = Schema({
  // TODO have a unique ID assigned //no need - automatically assigned by Mongo on creation
  job_id: String,
  url: String,
  created_at: Number,
  size: String,
  completed_at: Number,
  //htmlJSON: { type: Array, default: [] },
  links: { type: Array, default: [] },
  linksCount: Number,
  htmlString: String,
  status: String,
  error_msg: String
});

module.exports = mongoose.model("Job", JobSchema);
