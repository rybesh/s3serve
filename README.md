s3serve
=======

[Amazon S3 supports hosting websites](http://docs.amazonwebservices.com/AmazonS3/latest/dev/index.html?WebsiteHosting.html), 
but only if you want your site to be publicly accessible. Sometimes it
is useful to serve from an S3 bucket a website that is only accessible
to people authorized to access that bucket. This is what s3serve is for.

Settings
--------

s3serve expects a `settings.js` file like the following:

    var settings = {};

    settings.host = 'localhost';
    settings.port = 8080;

    settings.session = {};
    settings.session.secret = 'my super secret string';

    settings.s3 = {};
    settings.s3.bucket = 'mybucket';

    module.exports = settings;

s3serve uses HTTP Basic authentication and expects a valid Amazon
access key and secret. Note that if you were to connect to s3serve via
HTTP, this would expose your Amazon credentials to the world. Thus
s3serve is intended to be run behind an SSL reverse proxy. It tries to
detect if it's being connected to directly via HTTP and redirects to
HTTPS.
