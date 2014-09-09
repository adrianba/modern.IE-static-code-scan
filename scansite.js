"use strict";

if(process.argv.length<3 || process.argv.length>5) {
	console.error("Usage: node scansite <siteurl> [user pass]");
	process.exit(1);
}

var scanner = require('./scanner.js');

scanner.analyze(process.argv[2],process.argv[3],process.argv[4])
	.then(function(successResult) {
		var passed=0,count=0;
		for(var test in successResult.results) {
			var result = successResult.results[test];
			if(result.passed) {
				passed++;
			} else {
				console.log("FAIL: " + result.testName);
			}
			count++;
		}
		console.log("Passed " + passed + "/" + count);
		//console.log(JSON.stringify(successResult));
	},function(errorResult) {
		console.log(JSON.stringify(errorResult));
	});