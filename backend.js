const fs = require('fs');
const http = require('http');
const https = require('https');
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
const tmpDir = '/tmp';
const compression = require('compression');

app.use(compression());

const domain = 'mindslide.cn';
try {
  const privateKey = fs.readFileSync(`/etc/letsencrypt/live/${domain}/privkey.pem`, 'utf8');
  const certificate = fs.readFileSync(`/etc/letsencrypt/live/${domain}/cert.pem`, 'utf8');
  const ca = fs.readFileSync(`/etc/letsencrypt/live/${domain}/chain.pem`, 'utf8');
  app.use((req, res, next) => {
  	req.secure ? next() : res.redirect('https://' + req.headers.host + req.url)
  })
  const credentials = {
  	key: privateKey,
  	cert: certificate,
  	ca: ca,
  };
  const httpsServer = https.createServer(credentials, app);
  httpsServer.listen(443, () => {
  	console.log('HTTPS Server running on port 443');
  });
} catch (e) {
  console.log(e);
}

const httpServer = http.createServer(app);

httpServer.listen(80, () => {
	console.log('HTTP Server running on port 80');
});

app.use(express.static('dist'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/exists/:key', function(req, res) {
  const key = req.params.key;
  res.json({
    exists: fs.existsSync(path.join(tmpDir, key))
  });
});

app.get('/file/:key', function(req, res) {
  const key = req.params.key;
  if (!fs.existsSync(path.join(tmpDir, key))) {
    res.json({success: false});
    return;
  }
  res.json({
    blob: fs.readFileSync(path.join(tmpDir, key)).toString(),
    success: true,
  });
});

app.post('/upload', function(req, res) {
  const {
    filename,
    blob,
  } = req.body;
  fs.writeFileSync(path.join(tmpDir, filename), blob);
  res.json({
    success: true,
  });
});
