#! /usr/bin/env node

var fs = require('fs');
var connect = require('connect');
var knox = require('knox');
var util = require('util');
var xml2js = require('xml2js');
var jade = require('jade');

var settings = require('./settings');
var templates = {};

function load_templates(names) {
  names.forEach(function (name) {
    templates[name] = jade.compile(fs.readFileSync('./' + name + '.jade'));
  });
}

function force_https() {
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

function check_auth(authenticate) {
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

function list_dir(s3_res, res) {
  var parser = new xml2js.Parser();
  parser.on('end', function(obj) {
    var prefix = (typeof(obj.Prefix) == 'object' ? '' : obj.Prefix);
    var data = { path: '/' + prefix, dirs: [], files: [] };
    if ('CommonPrefixes' in obj) {
      data.dirs = obj.CommonPrefixes.map(function (val) { 
        return val.Prefix.slice(prefix.length); 
      });
    }
    if ('Contents' in obj) {
      data.files = obj.Contents.map(function (val) {
        if (parseInt(val.Size, 10) > 0) {
          return val.Key.slice(prefix.length);          
        } else {
          return null;
        }
      }).filter(function (val) {
        return val !== null;
      });
    }
    res.writeHead(s3_res.statusCode, { 'Content-Type': 'text/html' });
    res.end(templates.dir(data));
  });
  var buf = '';
  s3_res.on('data', function (chunk) {
    buf += chunk;
  });
  s3_res.on('end', function () {
    parser.parseString(buf);
  });
}

function proxy_response(s3_res, res) {
  s3_res.on('data', function (chunk) {
    res.write(chunk, 'binary');
  });
  s3_res.on('end', function () {
    res.end();
  });
  res.writeHead(s3_res.statusCode, s3_res.headers);          
}

function handle() {
  return function (req, res, next) {
    var s3 = knox.createClient(req.session.user);
    if (req.url.slice(-1) == '/') {
      req.url = '/?prefix=' + req.url.slice(1) + '&delimiter=/';
    }
    s3.get(req.url).on('response', function (s3_res) {
      if (s3_res.statusCode != 200) {
        res.writeHead(s3_res.statusCode, { 'Content-Type': 'text/plain' });
        res.end(s3_res.statusCode + '\n');
      } else if (s3_res.headers['content-type'] == 'application/xml') {
        list_dir(s3_res, res);
      } else {
        proxy_response(s3_res, res);
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

load_templates(['dir']);

connect.createServer(
  connect.logger(':method :url'),
  force_https(),
  connect.cookieParser(),
  connect.session(settings.session),
  check_auth(s3auth),
  handle()
).listen(settings.port, settings.host);

