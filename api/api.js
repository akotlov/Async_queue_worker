const redisClient = require("./redis");
const async = require("async");
const sf = require("sf");

const foldingCharacter = ":";
const prefix = "bull:html_parsing";

module.exports = function(app) {
  app.get("/api/jobs", getJobs);
  app.get("/api/job/:id", getJobDetails);
  app.get("/api/all_jobs", getAllJobs);
  app.get("/jobs", _getJobs);
};

function getJobs(req, res, next) {
  let cursor = "0";
  redisClient.scan(cursor, "MATCH", prefix + ":*", "COUNT", "50", function(
    err,
    reply
  ) {
    if (err) {
      console.error("getKeys", err);
      return next(err);
    }
    cursor = reply[0];
    if (cursor === "0") {
      return console.log("Scan Complete");
      res.send("No records found");
    } else {
      console.log(sf('found {0} keys for "{1}"', reply[1].length, prefix));

      var lookup = {};
      var reducedKeys = [];
      reply[1].forEach(function(key) {
        var fullKey = key;
        if (prefix) {
          key = key.substr((prefix + foldingCharacter).length);
        }
        var parts = key.split(foldingCharacter);
        var firstPrefix = parts[0];
        if (lookup.hasOwnProperty(firstPrefix)) {
          lookup[firstPrefix].count++;
        } else {
          lookup[firstPrefix] = {
            attr: { id: firstPrefix },
            count: parts.length === 1 ? 0 : 1
          };
          lookup[firstPrefix].fullKey = fullKey;
          if (parts.length === 1) {
            lookup[firstPrefix].leaf = true;
          }
          reducedKeys.push(lookup[firstPrefix]);
        }
      });
      reducedKeys.forEach(function(data) {
        if (data.count === 0) {
          data.data = data.attr.id;
        } else {
          data.data = data.attr.id + ":* (" + data.count + ")";
          data.state = "closed";
        }
      });

      async.forEachLimit(
        reducedKeys,
        10,
        function(keyData, callback) {
          if (keyData.leaf) {
            redisClient.type(keyData.fullKey, function(err, type) {
              if (err) {
                return callback(err);
              }
              keyData.attr.rel = type;
              var sizeCallback = function(err, count) {
                if (err) {
                  return callback(err);
                } else {
                  keyData.data += " (" + count + ")";
                  callback();
                }
              };
              if (type == "list") {
                redisClient.llen(keyData.fullKey, sizeCallback);
              } else if (type == "set") {
                redisClient.scard(keyData.fullKey, sizeCallback);
              } else if (type == "zset") {
                redisClient.zcard(keyData.fullKey, sizeCallback);
              } else {
                callback();
              }
            });
          } else {
            callback();
          }
        },
        function(err) {
          if (err) {
            console.error("getKeys", err);
            return next(err);
          }
          reducedKeys = reducedKeys.sort(function(a, b) {
            return a.data > b.data ? 1 : -1;
          });
          //console.log(reducedKeys);
          res.send(JSON.stringify(reducedKeys));
        }
      );
    }
    /*
  cursor = reply[0];
  if (cursor === "0") {
    return console.log("Scan Complete");
  } else {
    console.log(reply[1]);
    const jobs = JSON.stringify(reply[1]);
    res.json(reply[1]);
    //return scan();
  }*/
  });
}

function getJobDetails(req, res, next) {
  const jobID = req.params.id;
  console.log(jobID);

  redisClient.hgetall(jobID, function(err, fieldsAndValues) {
    if (err) {
      console.error("getKeys", err);
      return next(err);
    }
    console.log(fieldsAndValues);
    var details = {
      key: jobID,
      type: "hash",
      data: fieldsAndValues
    };
    /*cursor = reply[0];
      if (cursor === "0") {
        return console.log("Scan Complete");
      } else {*/
    // do your processing
    // reply[1] is an array of matched keys.
    res.json(details);
    //return scan();
  });
}

function getAllJobs(req, res, next) {
  async.parallel(
    [
      function(callback) {
        // Task 1
        let cursor = "0";
        redisClient.zscan("bull:html_parsing:failed", cursor, function(
          err,
          reply
        ) {
          if (err) {
            callback(err);
          }
          console.log(JSON.stringify(reply[1]));
          callback(null, reply[1]);
        });
      },
      function(callback) {
        // Task 2
        let cursor = "0";
        redisClient.zscan("bull:html_parsing:completed", cursor, function(
          err,
          reply
        ) {
          if (err) {
            callback(err);
          }
          console.log(JSON.stringify(reply[1]));
          callback(null, reply[1]);
        });
      }
    ],
    (err, results) => {
      if (err) return next(err); // If an error occurred, we let express handle it by calling the `next` function
      console.log("async.parallel final callback with results ", results);
    }
  );
}

function _getJobs(req, res, next) {
  const limit = 200;

  distinct = function(items) {
    var hash = {};
    items.forEach(function(item) {
      hash[item] = true;
    });
    var result = [];
    for (var item in hash) {
      result.push(item);
    }
    return result;
  };

  redisClient.keys(`${prefix}*`, (err, keys) => {
    if (err) {
      console.error("getKeys", err);
      return next(err);
    }
    console.log(sf('found {0} keys for "{1}"', keys.length, prefix));

    if (keys.length > 1) {
      keys = distinct(
        keys.map(function(key) {
          var idx = key.indexOf(foldingCharacter, prefix.length);
          if (idx > 0) {
            return key.substring(0, idx + 1);
          }
          return key;
        })
      );
    }

    if (keys.length > limit) {
      keys = keys.slice(0, limit);
    }

    keys = keys.sort();
    //res.send(JSON.stringify(keys));
    console.log(keys);
    res.send(JSON.stringify(keys));
  });
}

/*
var cursor3 = "0";

redisClient.hscan("bull:html_parsing:ByicbxkwW", cursor3, function(err, reply) {
  if (err) {
    throw err;
  }
  console.log(reply);
  cursor3 = reply[0];
  if (cursor2 === "0") {
    return console.log("Scan Complete");
  } else {
    // do your processing
    // reply[1] is an array of matched keys.
    console.log(JSON.stringify(reply[1]));
    //return scan();
  }
});*/
