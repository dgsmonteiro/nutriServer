#!/usr/bin/env nodejs

const express = require('express');
const bodyParser = require('body-parser');
let https = require('https');
let http = require('http');
let fs = require('fs');

const app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, HEAD");
    next();
  });

require('./app/controllers/index')(app);


https.createServer({
  key: fs.readFileSync('../../certificado/chave.key'),
  cert: fs.readFileSync('../../certificado/cert.pem')
}, app)
.listen(3000);


// http.createServer(app)
// .listen(3000);
