const Queue = require("bull");
const async = require("async");
const request = require("request");
const urlExists = require("url-exists");
const shortid = require("shortid");
const Job = require("../models/Job");

// const html2json = require('html2json').html2json;
// const json2html = require('html2json').json2html;
const himalaya = require("himalaya");
const toHTML = require("himalaya/translate").toHTML;
const htmlparser = require("htmlparser2");
const cheerio = require("cheerio");

var sendQueue = new Queue("Server A");
var receiveQueue = new Queue("Server B");

receiveQueue.process(function(job, done) {
  console.log("Received message", job.data.msg);
  done();
});

const htmlParseQueue = new Queue("html_parsing", "redis://127.0.0.1:6379");

htmlParseQueue.on("completed", (job, result) => {
  console.log("completed job: ", job.id, result);
  // const json = himalaya.parse(body);
  const jobResult = new Job({
    job_id: job.id,
    url: job.data.url,
    created_at: Date.now(),
    size: result.dataLength,
    completed_at: Date.now(),
    links: result.links,
    linksCount: result.links.length,
    htmlString: null,
    status: "completed",
    error_msg: null
  });
  jobResult.save((error, jresult) => {
    if (error) logErrors(new Error(error));
    console.log("saved ", jresult.job_id);
  });
});

htmlParseQueue.on("failed", (job, error) => {
  //handleError(error, job.id);
  console.log("failed job", error);
});

htmlParseQueue.process((job, done) => {
  console.log("Job processing : ", job.id);
  process(job, done);
});

/* function parseHtml(html, done) {
    let parsed;
    try {
      parsed = himalaya.parse(html);
    } catch (ex) {
      done(new Error(ex));
      // return null; // Oh well, but whatever...
    }

    return parsed; // Could be undefined!
  }
*/

function parseHtml(data) {
  const tags = [];
  const tagsCount = {};
  const tagsWithCount = [];

  const handler = new htmlparser.DomHandler((error, dom) => {
    console.log(dom);
  });

  const parsedData = new htmlparser.Parser(
    {
      onopentag(name, attribs) {
        if (tags.indexOf(name) === -1) {
          tags.push(name);
          tagsCount[name] = 1;
        } else {
          tagsCount[name]++;
        }
      },
      onend() {
        for (let i = 1; i < tags.length; i++) {
          tagsWithCount.push({ name: tags[i], count: tagsCount[tags[i]] });
        }
      }
    },
    { decodeEntities: true }
  );

  parsedData.write(data);
  parsedData.end();
  // console.log(tagsWithCount);
  return tagsWithCount;
}

function bytesToSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "n/a";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  if (i === 0) return `${bytes} ${sizes[i]})`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

function process(job, done) {
  const maxSize = 1048576;
  console.log("Url content size limit set to: ", bytesToSize(maxSize));

  async.waterfall(
    [
      //Task 1
      callback => {
        request(
          {
            url: job.data.url,
            method: "HEAD"
          },
          (err, headRes) => {
            const size = headRes.headers["content-length"];
            if (size > maxSize) {
              console.log(`Resource size exceeds limit (${size})`);
              //done(new Error("Resource stream exceeded limit"));
              callback(new Error("Resource stream exceeded limit"));
            } else {
              callback(null, job.data.url);
            }
          }
        );
      },
      // Task 2
      (url, callback) => {
        let dataSize = 0;
        let body = "";

        const res = request({ url: url });

        res.on("data", data => {
          dataSize += data.length;

          if (dataSize > maxSize) {
            console.log(`Resource stream exceeded limit (${dataSize})`);
            callback(new Error("Resource stream exceeded limit"));
            res.abort(); // Abort the response (close and cleanup the stream)
          }
          body += data;
        });
        res.on("end", () => {
          // const l = (body.length / 1024).toFixed(3);
          const l = bytesToSize(body.length);
          console.log("Resource lenght is", l);
          //let parsedBody;
          let jobResult = {
            url: url,
            dataLength: l,
            links: []
          };
          let foundLinks = [];
          /*try {
          parsedBody = parseHtml(body);
          console.log("htmlParseQueue parsedBody :", parsedBody);
          return done(null, parsedBody);
        } catch (e) {
          done(new Error(e));
        }*/
          $ = cheerio.load(body);
          let links = $("a"); //jquery get all hyperlinks
          $(links).each(function(i, link) {
            //console.log($(link).text() + ":\n  " + $(link).attr("href"));
            //console.log($(link).attr("href"));
            foundLinks.push($(link).attr("href"));
          });
          console.log(foundLinks.length);

          /*function isValidUrl(url, cb) {
            urlExists(url, (err, exists) => {
              if (exists) {
                cb(null, url);
              }
              cb(null, false);
            });
          }*/

          /*function validate(arr, cb) {
            let validLinks = [];

            for (let i = 0; i < arr.length; i++) {
              console.log("outer i ", i);
              isValidUrl(arr[i], (err, result) => {
                console.log("inner i ", i);
                if (result === false) return;
                validLinks.push(result);
                console.log("validLinks inside for loop ", validLinks);
                //if (i === arr.length) cb(null, validLinks);
              });
            }
          }

          validate(foundLinks, (err, resultArr) => {
            console.log("valida callback result ", resultArr);
            jobResult.links = resultArr;
            console.log(jobResult);
            callback(null, jobResult);
          });*/

          async.filter(foundLinks, urlExists, function(err, validLinks) {
            jobResult.links = validLinks;
            callback(null, jobResult);
          });
        });

        res.on("error", error => {
          done(new Error(error));
        });
        res.end();
      }
    ],
    (err, jobResult) => {
      if (err) done(err);
      done(null, jobResult);
      //console.log("Final create_job_async callback return status: ", result);
    }
  );
}

module.exports = function(app) {
  app.post("/create_job_async/*", createJob);
};
