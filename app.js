/*
 * Modern.IE main service; runs under node.js.
 *
 * Copyright (c) Microsoft Corporation; All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this
 * file except in compliance with the License. You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * THIS CODE IS PROVIDED AS IS BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, EITHER
 * EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED WARRANTIES OR CONDITIONS
 * OF TITLE, FITNESS FOR A PARTICULAR PURPOSE, MERCHANTABLITY OR NON-INFRINGEMENT.
 *
 * See the Apache Version 2.0 License for specific language governing permissions
 * and limitations under the License.
 */

"use strict";

var url = require('url'),
    fs = require('fs'),
    path = require('path'),
    port = process.env.PORT || 1337,
    express = require('express'),
    app = express(),
    sanitize = require('validator').sanitize,
    querystring = require('querystring'),
    scanner = require('./scanner.js');

/**
 * Responds with a bad request error
 * */
function sendBadRequest(res){
    res.writeHeader(400, {"Content-Type": "text/plain"});
    res.write('Your package is malformed' + '\n');
    res.end();
}

/**
 * Returns the local scan page
 * */
function returnMainPage(response) {
    fs.readFile(path.join(__dirname, "lib", "index.html"), function (err, data) {
        if (!err) {
            response.writeHeader(200, {"Content-Type": "text/html"});

        } else {
            response.writeHeader(500, {"Content-Type": "text/plain"});
            data = "Server error: " + err + "\n";
        }
        response.write(data);
        response.end();
    });
}

/**
 * Decides what action needs to be done: show the main page or analyze a website
 * */
function handleRequest(req, response) {
    if (req.url === '/') {
        // Return the "local scan" page
        returnMainPage(response);
        return;
    }

    var requestUrl = url.parse(req.url),
        parameters = querystring.parse(requestUrl.query),
        urlToAnalyze = sanitize(decodeURIComponent(parameters.url)).xss(),
        user = sanitize(decodeURIComponent(parameters.user)).xss(),
        password = sanitize(decodeURIComponent(parameters.password)).xss();

    var deferred = scanner.analyze(urlToAnalyze,user,password);
    deferred.then(function(result) {
        // Send back results
        response.writeHeader(200, {"Content-Type": "application/json",
            "X-Content-Type-Options": "nosniff" });
        response.write(JSON.stringify(result));
        response.end();
    },function(err) {
        // Return err details
        response.writeHead(200, {"Content-Type": "application/json"});
        response.write(JSON.stringify(err));
        response.end();
    })
}

/**
 * Handles the content of a package sent via any of the plugins
 * */
/*function handlePackage(req, res) {
    if (!req.body.js || !req.body.css || !req.body.html || !req.body.url) {
        remoteErrorResponse(res, 400, "Missing information");
    }
    var start = Date.now(),
        cssPromises = [],
        website;

    //TODO: try/catch this
    try {
        website = {
            url: req.body.url ? url.parse(req.body.url.replace(/"/g, '')) : "http://privates.ite",
            content: req.body.html,
            css: null,
            js: JSON.parse(req.body.js),
            $: cheerio.load(req.body.html, { lowerCaseTags: true, lowerCaseAttributeNames: true })
        };
    } catch (e) {
        sendBadRequest(res);
        return;
    }
    
    var remoteCSS = JSON.parse(req.body.css);
    remoteCSS.forEach(function (parsedCSS) {
        if (parsedCSS.content !== '') {
            cssPromises.push(cssLoader.parseCSS(parsedCSS.content, parsedCSS.url, null, null, website));
        }
    });

    promised.all(cssPromises)
        .then(function (results) {
            var cssResults = [],
                promisesTests = [];

            cssResults.concat.apply(cssResults, results);
            website.css = cssResults;

            for (var i = 0; i < tests.length; i++) {
                // Call each test and save its returned promise
                promisesTests.push(tests[i].check(website));
            }

            promises.all(promisesTests)
                .then(sendResults.bind(null, res, start));
        });
}
*/
// ## CORS middleware
//
// see: http://stackoverflow.com/questions/7067966/how-to-allow-cors-in-express-nodejs
var allowCrossDomain = function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
        res.send(204);
    }
    else {
        next();
    }
};
app.use(allowCrossDomain);

app.use(express.bodyParser());
app.get('/', handleRequest);
//app.post('/package', handlePackage);
app.listen(port);

console.log('Server started on port ' + port);
console.log('To scan a private url go to http://localhost:' + port + '/ and follow the instructions');

module.exports.port = port;
