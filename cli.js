"use strict";

const {readFileSync} = require("fs");

if (process.argv.length !== 3) {
    console.error(`Usage: ${process.argv[0]} ${process.argv[1]} <config.json>`);
    process.exit();
}
const walletConfig = JSON.parse(readFileSync(process.argv[2]));


console.log(walletConfig);
