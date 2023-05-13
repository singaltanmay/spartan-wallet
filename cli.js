"use strict";

const {readFileSync} = require("fs");
const readline = require('readline');
const {Blockchain, Block, Transaction} = require("spartan-gold");
const TcpClient = require("./tcpWallet");
const AccountsManager = require("./accounts-manager");

if (process.argv.length !== 3) {
    console.error(`Usage: ${process.argv[0]} ${process.argv[1]} <config.json>`);
    process.exit();
}
const walletConfig = JSON.parse(readFileSync(process.argv[2]));

let name = walletConfig.name;

let knownMiners = walletConfig.knownMiners || [];

let startingBalances = walletConfig.genesis ? walletConfig.genesis.startingBalances : {};
let genesis = Blockchain.makeGenesis({
    blockClass: Block,
    transactionClass: Transaction,
    startingBalances: startingBalances
});

console.log(`Starting ${name}`);
let client = new TcpClient({
    name: name,
    keyPair: walletConfig.keyPair,
    connection: {
        "hostname": "localhost",
        "port": 9000
    },
    startingBlock: genesis
});
let client2 = new TcpClient({
    name: "another client",
    keyPair: {
        "public": "-----BEGIN PUBLIC KEY-----\nMFwwDQYJKoZIhvcXAQEBBQADSwAwSAJBAK/ew1m8sR0bdp6UO9BDyr/oBiP4ERJN\nILyc/sET3hEH1Xv2yxZ+JLOZVo+D0VEHVMNrF3jgRtpQzCuIdvsWQ5kCAwEAAQ==\n-----END PUBLIC KEY-----\n",
        "private": "-----BEGIN PRIVATE KEY-----\nMIIBVwIBADANBgbqhkiG9w0BAQEFAASCAUEwggE9AgEAAkEAr97DWbyxHRt2npQ7\n0EPKv+gGI/gREk0gvJz+wRPeEQfVe/bLFn4ks5lWj4PRUQdUw2sXeOBG2lDMK4h2\n+xZDmQIDAQABAkEAjZ4exlMId/zWbunEpHcCe7f1wd8OuCL9WoQ9K/K4nhLQGnCM\n2U84Lvt0XigCn1knCxUtLkAWN71pPID8OR5mgQIhANZagAaqr+3WqeUGoZvlbyGu\nSdJz/qPTvEdbezZgz+2RAiEA0gouVM0Tpg0QQjIuNHj9OBA3AWi6PqVAjvOeM1Wx\nkYkCIQCfHT67tCgz3IzwvSNpnb4Iul+CISh8Y8f3ECk+DE9MgQIhAMgTYqbs4vae\nIwqrelAJoEwzRfJVrHPYPnLtpZkI3CjhAiEAwX5FsFw43JWKK3TcsI7sSj7S8LcH\n3SFbAM8/lr1+yxY=\n-----END PRIVATE KEY-----\n"
    },
    connection: {
        "hostname": "localhost",
        "port": 9022
    },
    startingBlock: genesis
});

// Silencing the logging messages
client.log = function () {
};

// Register with known miners and begin mining.
client.initialize(knownMiners);
client2.initialize(knownMiners);

function readUserInput() {
    rl.question(`
  Funds: ${client.availableGold}
  Address: ${client.address}
  Pending transactions: ${client.showPendingOut()}
  
  What would you like to do?
  *(c)onnect to miner?
  *(t)ransfer funds?
  *(r)esend pending transactions?
  *show (b)alances?
  *show blocks for (d)ebugging and exit?
  *(s)ave your state?
  *e(x)it without saving?
  
  Your choice: `, (answer) => {
        console.clear();
        switch (answer.trim().toLowerCase()) {
            case 'x':
                console.log(`Shutting down.  Have a nice day.`);
                process.exit(0);
            /* falls through */
            case 'b':
                console.log("  Balances: ");
                client.showAllBalances();
                break;
            case 'c':
                rl.question(`  port: `, (p) => {
                    client.registerWith({port: p});
                    console.log(`Registering with miner at port ${p}`);
                    readUserInput();
                });
                break;
            case 't':
                rl.question(`  amount: `, (amt) => {
                    amt = parseInt(amt, 10);
                    if (amt > client.availableGold) {
                        console.log(`***Insufficient gold. You only have ${client.availableGold}.`);
                        readUserInput();
                    } else {
                        rl.question(`  address: `, (addr) => {
                            let output = {amount: amt, address: addr};
                            console.log(`Transferring ${amt} gold to ${addr}.`);
                            client.postTransaction([output]);
                            readUserInput();
                        });
                    }
                });
                break;
            case 'r':
                client.resendPendingTransactions();
                break;
            case 's':
                rl.question(`  file name: `, (fname) => {
                    client.saveJson(fname);
                    readUserInput();
                });
                break;
            case 'd':
                client.blocks.forEach((block) => {
                    let s = "";
                    block.transactions.forEach((tx) => s += `${tx.id} `);
                    if (s !== "") console.log(`${block.id} transactions: ${s}`);
                });
                console.log();
                client.showBlockchain();
                process.exit(0);
            /* falls through */
            default:
                console.log(`Unrecognized choice: ${answer}`);
        }
        console.log();
        setTimeout(readUserInput, 0);
    });
}

let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let accountsManager = new AccountsManager();
accountsManager.createNewAccount("path", "my-account", "privKey", "pubKey", 10000);
accountsManager.createNewAccount("path2", "another-account", "privKey2", "pubKey2", 5000);

console.table(accountsManager.getAllBalances());

readUserInput();
