"use strict";

const {readFileSync} = require("fs");
const readline = require('readline');
const {Blockchain, Block, Transaction} = require("spartan-gold");
const TcpClient = require("./tcpWallet");

if (process.argv.length !== 3) {
    console.error(`Usage: ${process.argv[0]} ${process.argv[1]} <config.json>`);
    process.exit();
}
const walletConfig = JSON.parse(readFileSync(process.argv[2]));

console.log(walletConfig);

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
    connection: walletConfig.connection,
    startingBlock: genesis
});

// Silencing the logging messages
client.log = function () {
};

// Register with known miners and begin mining.
client.initialize(knownMiners);

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
                        console.log(`***Insufficient gold.  You only have ${client.availableGold}.`);
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

readUserInput();
