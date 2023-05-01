"use strict";

const KeyGenerator = require("./key-generator.js").KeyGenerator;

let m = new KeyGenerator();

let seed = m.generateSeed();

m.printMnemonic();

console.log("The seed is " + seed);

let masterKey = m.generateMasterKey(seed);
let [privateKey, publicKey] = m.generateKeys(masterKey);
console.log("privateKey: " + privateKey);
console.log("chainCode: " + publicKey);
//console.log("publicKey: " + keys[2]);

const masterNode = m.generateMasterNode(masterKey);

console.log("masterExtendedPublicKey: " + masterNode.masterExtendedPublicKey)
console.log("masterChainCode: " + masterNode.masterChainCode)