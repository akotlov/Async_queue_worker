const Queue = require("bull");
const async = require("async");
const request = require("request");
const urlExists = require("url-exists");
const shortid = require("shortid");
const is = require("is_js");

const cluster = require("cluster");
//const numCPUs = require("os").cpus().length;
const numCPUs = 1;

const winston = require("winston");
const logger = new winston.Logger({
  level: "info",
  transports: [
    // colorize the output to the   console
    new winston.transports.Console({ colorize: true }),
    new winston.transports.File({ filename: "logfile.log" })
  ]
});
logger.remove(winston.transports.Console);

logger.level = "debug";

const express = require("express");
const bodyParser = require("body-parser");
// const url = require('url');
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.static(`${__dirname}/build/`));
// to allow webpack server app access from another PORT
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});
app.use(logErrors);
app.use(errorHandler);

//require("./api/job_queue")(app);

function logErrors(err, req, res, next) {
  console.error(err.stack);
  next(err);
}
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  res.status(500);
  res.render("error", { error: err });
}

//logger.log("info" ,process.env);

/*process.on("uncaughtException", err => {
   logger.log("info", `Uncaught exception: ${err.stack}`);
  process.exit(1);
});*/

/*if you have to debug a huge codebase, and you don't know which Promise can 
potentially hide an issue, you can use the unhandledRejection hook. It will print out all u
nhandled Promise rejections.

process.on('unhandledRejection', (err) => {  
   logger.log("info", err)
})
*/

if (cluster.isMaster && numCPUs > 1) {
  logger.log("info", `Master ${process.pid} is running`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code, signal) => {
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      logger.log(
        "info",
        `Worker ${worker.id} crashed. ` + "Starting a new worker..."
      );
      cluster.fork();
    }
  });

  cluster.on("online", worker => {
    logger.log("info", `Worker ${worker.process.pid} is online`);
  });
} else {
  require("./api/mongo")(app);
}

const Job = require("./models/Job");

app.get("/test", function(req, res) {
  res.send("hello world");
});

const htmlParseQueue = new Queue("html_parsing", "redis://127.0.0.1:6379");
const resultQueue = new Queue("Result Queue");

htmlParseQueue.on("completed", (job, result) => {
  //logger.log("info", "completed job: ", job.id, result);
  resultQueue.add({ status: "completed", job: job, result: result });
});

htmlParseQueue.on("failed", (job, error) => {
  logger.log("info", "failed job ", job, error);
  resultQueue.add({ status: "failed", job: job, error: error });
});

htmlParseQueue.process((job, done) => {
  logger.log("info", "Job processing : ", job.id);
  process(job, done);
});

function bytesToSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "n/a";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  if (i === 0) return `${bytes} ${sizes[i]})`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

function process(job, done) {
  async.waterfall(
    [
      callback => {
        let jobResult = {
          testRunTime: null
        };
        callback(null, arrayTest(jobResult));
      }
    ],
    (err, jobResult) => {
      if (err) done(err);
      done(null, jobResult);
      //logger.log("info","Final create_job_async callback return status: ", result);
    }
  );
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive)
 * Using Math.round() will give you a non-uniform distribution!
 */
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function arrayTest(jobResult) {
  let data = new Array(327); //768);
  let dataSize = data.length;

  for (let c = 0; c < dataSize; c++) data[c] = getRandomInt(0, 256);

  data.sort(function(a, b) {
    return a - b;
  });

  let start = new Date();
  let sum = 0;

  for (let i = 0; i < 100000; i++) {
    // Primary loop
    for (let c = 0; c < dataSize; c++) {
      if (data[c] <= 128) {
        sum += data[c];
      }
    }
  }
  let end = new Date();
  let testRunTime = end.getTime() - start.getTime();
  jobResult.testRunTime = testRunTime;
  logger.log("info", "Operation took " + testRunTime + " msec");
  //logger.log("info", sum);
  return jobResult;
}

//arrayTest();

var text = [
  "The",
  "quick",
  "brown",
  "fox",
  "jumped",
  "over",
  "the",
  "lazy",
  "dog",
  "at",
  "a",
  "restaurant",
  "near",
  "the",
  "lake",
  "of",
  "a",
  "new",
  "era"
];

function hashThing() {
  let map = {};
  times = 100; //0001;

  while (--times)
    for (var k = 0; k < text.length; ++k) {
      // Unlike luajit, if we put if (map[text[k]]) map[text[k]] += 1
      // in v8, this program will become 6 times slower. Instead we create a new object with a counter
      // and this way we'll only need to access the hashtable once per loop.
      var kth = map[text[k]];
      if (kth) kth.c += 1;
      else map[text[k]] = { c: 1 };
    }

  for (var key in map) {
    console.log(key, map[key].c);
  }
}

function Test(text) {
  this.text = text;
  this.uniqueText = [];
}

Test.prototype.runTest = function() {
  if (this.uniqueText.length === 0) this.uniqueText = this.text.map(x => x);
  let dataSize = this.uniqueText.length;
  let dataSize1 = this.text.length;
  for (let i = 0; i < dataSize; i++) {
    for (let j = 0; j < dataSize1; j++) {
      if (this.text.length === 0) return;
      if (this.uniqueText[i] === this.text[j])
        this.text.splice(this.text[j], 1);
    }
  }
  return uniqueText;
};
let test = new Test(text);
//test.runTest();
//logger.log("info", test.uniqueText);

//hashThing();
//logger.log(`Worker ${process.pid} started`);
/*
TODO:
-check if database is available before we init our app
-when using cluster module check what code should run inside child processes ,
for example DB connections? Answer- will have one db connection per process.
-what if master process crashes first?What would happen to its slave processes?
-remove   logger.log statements,use debug
 -check if headers has 'x-frame-options': 'SAMEORIGIN' -
it will prevent browser from displaying HTML in iframe.

*/

// var options = {method: 'HEAD', host: url.parse(job_url).host, /*port: 80, path: '/'*/};

/* var isValidUrlRequest = adapterFor(job_url).request(options, function(r) {
             logger.log(JSON.stringify(r.statusCode));
            callback(null, r.statusCode);
        });
      isValidUrlRequest.end(); 

      if (typeof job_url !== 'string') {
        handleError(new Error('url should be a string'));
        return;
      } */

/*
1.Massdrop html content wont display in iframe because of 'x-frame-options': 'SAMEORIGIN' 
option in header.  
 */

/*
 // HOW and WHY the timers implementation works the way it does.
//
// Timers are crucial to Node.js. Internally, any TCP I/O connection creates a
// timer so that we can time out of connections. Additionally, many user
// libraries and applications also use timers. As such there may be a
// significantly large amount of timeouts scheduled at any given time.
// Therefore, it is very important that the timers implementation is performant
// and efficient.
//
// Note: It is suggested you first read though the lib/internal/linkedlist.js
// linked list implementation, since timers depend on it extensively. It can be
// somewhat counter-intuitive at first, as it is not actually a class. Instead,
// it is a set of helpers that operate on an existing object.
//
// In order to be as performant as possible, the architecture and data
// structures are designed so that they are optimized to handle the following
// use cases as efficiently as possible:

// - Adding a new timer. (insert)
// - Removing an existing timer. (remove)
// - Handling a timer timing out. (timeout)
//
// Whenever possible, the implementation tries to make the complexity of these
// operations as close to constant-time as possible.
// (So that performance is not impacted by the number of scheduled timers.)
//
// Object maps are kept which contain linked lists keyed by their duration in
// milliseconds.
// The linked lists within also have some meta-properties, one of which is a
// TimerWrap C++ handle, which makes the call after the duration to process the
// list it is attached to.
//
//
// ╔════ > Object Map
// ║
// ╠══
// ║ refedLists: { '40': { }, '320': { etc } } (keys of millisecond duration)
// ╚══          ┌─────────┘
//              │
// ╔══          │
// ║ TimersList { _idleNext: { }, _idlePrev: (self), _timer: (TimerWrap) }
// ║         ┌────────────────┘
// ║    ╔══  │                              ^
// ║    ║    { _idleNext: { },  _idlePrev: { }, _onTimeout: (callback) }
// ║    ║      ┌───────────┘
// ║    ║      │                                  ^
// ║    ║      { _idleNext: { etc },  _idlePrev: { }, _onTimeout: (callback) }
// ╠══  ╠══
// ║    ║
// ║    ╚════ >  Actual JavaScript timeouts
// ║
// ╚════ > Linked List
//
//
// With this, virtually constant-time insertion (append), removal, and timeout
// is possible in the JavaScript layer. Any one list of timers is able to be
// sorted by just appending to it because all timers within share the same
// duration. Therefore, any timer added later will always have been scheduled to
// timeout later, thus only needing to be appended.
// Removal from an object-property linked list is also virtually constant-time
// as can be seen in the lib/internal/linkedlist.js implementation.
// Timeouts only need to process any timers due to currently timeout, which will
// always be at the beginning of the list for reasons stated above. Any timers
// after the first one encountered that does not yet need to timeout will also
// always be due to timeout at a later time.
//
// Less-than constant time operations are thus contained in two places:
// TimerWrap's backing libuv timers implementation (a performant heap-based
// queue), and the object map lookup of a specific list by the duration of
// timers within (or creation of a new list).
// However, these operations combined have shown to be trivial in comparison to
// other alternative timers architectures.


// Object maps containing linked lists of timers, keyed and sorted by their
// duration in milliseconds.
//
// The difference between these two objects is that the former contains timers
// that will keep the process open if they are the only thing left, while the
// latter will not.
//
// - key = time in milliseconds
// - value = linked list*/
