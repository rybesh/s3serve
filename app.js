#! /usr/bin/env node


var connect = require('connect');
var knox = require('knox');
var util = require('util');

var settings = require('./settings');

function forceHTTPS() {
  return function (req, res, next) {
    if (! ('sslsessionid' in req.headers || 
           req.headers['x-forwarded_proto'] == 'https')) {
      var host = req.headers.host || settings.host;
      res.writeHead(301, { Location: 'https://' + host + req.url });
      res.end();
    } else {
      next();
    }
  };
}

function checkAuth(authenticate) {
  return function (req, res, next) {
    if (! req.session) {
      connect.utils.unauthorized(res);
      return;
    }
    if (req.session.user) {
      next();
      return;
    }
    connect.basicAuth(authenticate)(req, res, function() {
      req.session.user = req.remoteUser;
      next();
    });
  };
}

function handle() {
  return function (req, res, next) {
    var s3 = knox.createClient(req.session.user);
    s3.get(req.url).on('response', function (s3_res) {
      if (s3_res.statusCode != 200) {
        res.writeHead(s3_res.statusCode, { 'Content-Type': 'text/plain' });
        res.end(s3_res.statusCode + '\n');
      } else {
        s3_res.on('data', function (chunk) {
          res.write(chunk, 'binary');
        });
        s3_res.on('end', function () {
          res.end();
        });
        res.writeHead(s3_res.statusCode, s3_res.headers);          
      }
    }).end();
  };
}

function s3auth(key, secret, callback) {
  var user = { key: key, secret: secret, bucket: settings.s3.bucket };
  var s3 = knox.createClient(user);
  s3.head('does-not-exist').on('response', function (res) {
    if (res.statusCode == 404) {
      callback(null, user);
    } else {
      callback('unauthorized user');
    }
  }).end();
}

connect.createServer(
  connect.logger(':method :url'),
  forceHTTPS(),
  connect.cookieParser(),
  connect.session(settings.session),
  checkAuth(s3auth),
  handle()
).listen(settings.port, settings.host);

