const mongoose = require("mongoose");

const mLabURL =
  "mongodb://akotlov:asyncjobqueue@ds151289.mlab.com:51289/async-job-queue";
const localDB = "mongodb://localhost/htmlDB";

// MongoDb default connection pool size is 5.
mongoose.Promise = global.Promise; // this will supress depricarion warning.see https://github.com/Automattic/mongoose/issues/4291

function openConnection(app) {
  const mongoClient = mongoose.connect(
    localDB,
    {
      useMongoClient: true
      /* other options */
    },
    err => {
      if (err) {
        console.log("Unable to connect MongoDB");
        process.exit(1);
      } else {
        const server = app.listen(process.env.PORT || 8000, () => {
          const port = server.address().port;
          console.log(
            "App now running on port",
            port,
            "in",
            process.env.NODE_ENV,
            "mode"
          );
        });
      }
    }
  );

  mongoClient.then(db => {
    db.on("error", console.error.bind(console, "connection error:"));
    db.once("open", () => {
      console.log("connection to db is open");
    });
  });
}

module.exports = openConnection;
