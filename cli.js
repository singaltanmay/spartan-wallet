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
    blockClass: Block, transactionClass: Transaction, startingBalances: startingBalances
});

console.log(`Starting ${name}`);
let client = new TcpClient({
    name: name,
    connection: walletConfig.connection,
    startingBlock: genesis,
    mnemonic: walletConfig.mnemonic,
    passphrase: walletConfig.passphrase
});

// Silencing the logging messages
client.log = function () {
};

client.accountsManager = new AccountsManager();

client.accountsManager.createNewAccount("m/1'", client.masterNode, "my-account", 10000);
//client.accountsManager.createNewAccount("m/2'", client.masterNode, "another-account", 5000);
const allBalances = client.accountsManager.getAllBalances();
console.table(allBalances);

const newAccountGenesis = {}
allBalances.forEach(it => {
    newAccountGenesis[it.address] = it.balance
})

client.lateGenesis(newAccountGenesis);

// Register with known miners and begin mining.
client.initialize(knownMiners);

function readUserInput() {
    rl.question(`
  Funds: ${client.getAvailableGoldByAddress(client.address)}
  Address: ${client.address}
  Pending transactions: ${client.showPendingOut()}
  
  What would you like to do?
  *(c)onnect to miner?
  *(t)ransfer funds?
  *(r)esend pending transactions?
  *show (b)alances?
  *show blocks for (d)ebugging and exit?
  *(s)ave your state?
  *create (a)ccount
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
                rl.question(`  account alias: `, (alias) => {
                    let fromAccount = client.accountsManager.getAccountByAlias(alias);
                    if (fromAccount == null) {
                        console.log(`***Account (${alias}) not found!`);
                        readUserInput();
                    } else {
                        const fromAddress = fromAccount['address']
                        rl.question(`  amount: `, (amt) => {
                            amt = parseInt(amt, 10);
                            let availableGold = client.getAvailableGoldByAddress(fromAddress);
                            console.log(availableGold)
                            if (amt > availableGold) {
                                console.log(`***Insufficient gold. This accout only has ${availableGold}.`);
                                readUserInput();
                            } else {
                                rl.question(`  address: `, (addr) => {
                                    let output = {amount: amt, address: addr};
                                    console.log(`Transferring ${amt} gold from ${fromAddress} to ${addr}.`);
                                    client.postTransactionByAddress(fromAddress, [output]);
                                    readUserInput();
                                });
                            }
                        });
                    }
                })
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
            case 'a':
                //client.accountsManager.createNewAccount("m/1'", client.masterNode, "my-account", 10000);
                rl.question(`Account Alias? `, (alias) => {
                    let accountAlias = client.accountsManager.getAccountByAlias(alias);
                    if (accountAlias) {
                        console.log(`***Account alias "${alias}" already exists!`);
                        readUserInput();
                    } else {
                        accountAlias = alias;
                        rl.question(`Index (optional): `, (index) => {
                            let accountIndex = client.accountsManager.getAccountByIndex(index);
                            if (accountIndex) {
                                console.log(`***Account at index m/${index} already exists!`);
                                readUserInput();
                            } else {
                                accountIndex = index;
                                rl.question(`Transfer funds(amount): `, (amount) => {
                                    client.accountsManager.createNewAccount(`m/${accountIndex}'`, client.masterNode, accountAlias, 0);
                                    console.log(client.accountsManager.getAllBalances());
                                    
                                    let toAddress = client.accountsManager.getAccountByAlias(accountAlias).address;
                                    let output = {amount: parseInt(amount), address: toAddress};
                                    console.log(`Transferring ${amount} gold to ${toAddress}.`);
                                    console.log(client.address);
                                    client.postTransactionByAddress(client.address, [output]);
                                    readUserInput();
                                });
                            }
                        });
                    }
                })
                break;
            default:
                console.log(`Unrecognized choice: ${answer}`);
        }
        console.log();
        setTimeout(readUserInput, 0);
    });
}

let rl = readline.createInterface({
    input: process.stdin, output: process.stdout
});

readUserInput();
