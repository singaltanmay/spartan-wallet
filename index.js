"use strict";

const {readFileSync} = require("fs");
const KeyGenerator = require("./key-generator.js").KeyGenerator;

if (process.argv.length !== 3) {
    console.error(`Usage: ${process.argv[0]} ${process.argv[1]} <config.json>`);
    process.exit();
}
const walletConfig = JSON.parse(readFileSync(process.argv[2]));

let m = new KeyGenerator(walletConfig.mnemonic);

let seed = m.generateSeed();

m.printMnemonic();

console.log("The seed is " + seed);

let masterKey = m.generateMasterKey(seed);
let [privateKey, publicKey] = m.generateKeys(masterKey);
console.log("privateKey: " + privateKey);
console.log("chainCode: " + publicKey);
//console.log("publicKey: " + keys[2]);

const {masterNode, masterExtendedPublicKey, masterChainCode} = m.generateMasterNode(masterKey);

console.log("masterExtendedPublicKey: " + masterExtendedPublicKey)
console.log("masterChainCode: " + masterChainCode)

// Derive a child key from the master node
const childNode = masterNode.derivePath("m/0");

console.log(childNode.publicKey);

// Get the child node's extended public key and chain code
const childExtendedPublicKey = childNode.neutered().toBase58();
const childChainCode = childNode.chainCode.toString('hex');

// console.log(childNode)
//
// console.log(childExtendedPublicKey);
// console.log(childChainCode);

