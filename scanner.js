/*
 * Modern.IE scanner module.
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

var request = require('request'),
    promises = require('promised-io/promise'),
    Deferred = require('promised-io').Deferred,
    url = require('url'),
    http = require('http'),
    zlib = require('zlib'),
    cheerio = require('cheerio'),
    cssLoader = require('./lib/checks/loadcss.js'),
    jsLoader = require('./lib/checks/loadjs.js'),
    tests = require('./lib/checks/loadchecks.js').tests,
    charset = 'utf-8',
    request = request.defaults({
    	followAllRedirects: true,
        encoding: null,
        jar: false,
        proxy: process.env.HTTP_PROXY || process.env.http_proxy,
        headers: {
            'Accept': 'text/html, application/xhtml+xml, */*',
            'Accept-Encoding': 'gzip,deflate',
            'Accept-Language': 'en-US,en;q=0.5',
            'User-Agent': 'Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.2; WOW64; Trident/6.0)'
        }
    });

/**
 * Launches and returns an array with the promises of all the non parallel tests
 * (browser detection, css prefixes, etc.)
 * */
function launchNonParallelTests(promisesArray, website) {
    var deferred = new Deferred();

    process.nextTick(function () {
        tests.forEach(function (test) {
            if (!test.parallel) {
                promisesArray.push(test.check(website));
            }
        });
        deferred.resolve(promisesArray);
    });

    return deferred.promise;
}

/**
 * Since several tests need HTML/JS/CSS content, fetch it all at once
 * before calling any of the tests. Note that the tests still could
 * retrieve additional content async, since they return a promise.
 */
function fetchResourcesAndRunTests(data, content, deferred) {
    var start = Date.now(),
        promisesTests = [];

    var website = {
        url: url.parse(data.uri),
        auth: data.auth,
        content: content.body,
        compression: content.compression,
        $: cheerio.load(content.body, { lowerCaseTags: true, lowerCaseAttributeNames: true })
    };

    /* Kick off the tests that can run in parallel with the other resource downloads */
    tests.forEach(function (test) {
        if (test.parallel) {
            promisesTests.push(test.check(website));
        }
    });

    /* Load CSS and JavaScript and then kick off tests that depend on these resources */
    cssLoader.loadCssFiles(website)
        .then(jsLoader.loadjsFiles)
        .then(launchNonParallelTests.bind(null, promisesTests))
        .then(promises.all) /* wait for all tests to finish */
        .then(collectResults.bind(website, deferred, start), returnError.bind(website, deferred));
}

function returnError(deferred, error) {
    errorResponse(deferred, undefined, false, JSON.stringify(error) + '\n');
}

function collectResults(deferred, start, resultsArray) {
    var results = {};

    for (var i = 0; i < resultsArray.length; i++) {
        results[resultsArray[i].testName] = resultsArray[i];
    }

    deferred.resolve({
    	url: {uri: (this && this.url && this.url.href) || 'http://private'},
    	processTime: (Date.now() - start)/1000,
    	results: results
    });
}

/**
 * Decompresses a byte array using the decompression method passed by type.
 * It supports gunzip and deflate
 * */
function decompress(body, type) {
    var deferred = new Deferred();

    if (type === 'gzip') {
        zlib.gunzip(body, function (err, data) {
            if (!err) {
                deferred.resolve({
                    body: data.toString(charset),
                    compression: 'gzip'
                });
            } else {
                deferred.reject('Error found: can\'t gunzip content ' + err);
            }
        });
    } else if (type === 'deflate') {
        zlib.inflateRaw(body, function (err, data) {
            if (!err) {
                deferred.resolve({
                        body: data.toString(charset),
                        compression: 'deflate'}
                );
            } else {
                deferred.reject('Error found: can\'t deflate content' + err);
            }
        });
    } else {
        process.nextTick(function () {
            deferred.reject("Unknown content encoding: " + type);
        });
    }

    return deferred.promise;
}

/**
 * Gets the body of a pages and decompresses if needed
 * */
function getUncompressedBody(res, body) {
    var deferred = new Deferred();
    if (res.headers['content-encoding']) {
        return decompress(body, res.headers['content-encoding']);
    } else {
        process.nextTick(function () {
            if (body) {
                deferred.resolve({ body: body.toString(charset), compression: 'none'});
            } else {
                deferred.reject('Error found: Empty body');
            }
        });
    }
    return deferred.promise;
}

/**
 * Handler for the request to get the body of a page and start all the process
 * */
function processPageResponse(deferred, auth) {
    return function (err, res, body) {
        if (!err && res.statusCode === 200) {
            getUncompressedBody(res, body)
                .then(function (result) {
                    fetchResourcesAndRunTests({uri: res.request.href, auth: auth}, result, deferred);
                }, errorResponse.bind(null, deferred, res.statusCode, true));
        } else {
            errorResponse(deferred, res ? res.statusCode : 'No response', true, 'Error found: ' + err);
        }
    };
}

/**
 * Reject promise with the error and message passed as parameters
 * */
function errorResponse(deferred, statusCode, page, message) {
    deferred.reject({statusCode: statusCode, message: message, pageError:page});
}

exports.analyze = function(urlToAnalyze,user,password) {
    var deferred = new Deferred(),auth;

    // If we have a user/pass, send it along. Wait for 401 response before sending passwords.
    if (user !== undefined && password !== undefined) {
        auth = {
            'user': user,
            'pass': password,
            'sendImmediately': false
        };
        request(urlToAnalyze, {auth: auth}, processPageResponse(deferred, auth));
    } else {
        request(urlToAnalyze, processPageResponse(deferred));
    }

    return deferred.promise;
}
