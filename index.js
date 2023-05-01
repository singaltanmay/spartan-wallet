"use strict";

const Mnemonic = require("./mnemonic.js").Mnemonic;

let m = new Mnemonic();

let seed = m.generateSeed();

m.printMnemonic();

console.log("The seed is " + seed);

let masterKey = m.generateMasterKey(seed);
let keys = m.generateKeys(masterKey);
console.log("privateKey: " + keys[0]);
console.log("chainCode: " + keys[1]);
//console.log("publicKey: " + keys[2]);

