const net = require('net');

const {writeFileSync} = require('fs');

const {FakeNet, Client, Block, Blockchain, Transaction, utils} = require('spartan-gold')
const AccountsManager = require("./accounts-manager");

const KeyGenerator = require("./key-generator.js").KeyGenerator;

/**
 * This extends the FakeNet class to actually communicate over the network.
 */
class TcpWallet extends FakeNet {
    sendMessage(address, msg, o) {
        if (typeof o === 'string') o = JSON.parse(o);
        let data = {msg, o};
        const client = this.clients.get(address);
        let clientConnection = net.connect(client.connection, () => {
            clientConnection.write(JSON.stringify(data));
        });
    }
}

/**
 * Provides a command line interface for a SpartanGold miner
 * that will actually communicate over the network.
 */
module.exports = class TcpClient extends Client {
    /**
     * In addition to the usual properties for a miner, the constructor
     * also takes a JSON object for the connection information and sets
     * up a listener to listen for incoming connections.
     */
    constructor({name, startingBlock, keyPair, connection, wordlist} = {}) {
        super({name, net: new TcpWallet(), startingBlock, keyPair});

        // Setting up the server to listen for connections
        this.accountsManager = new AccountsManager();
        this.connection = connection;
        this.wordlist = wordlist;
        this.srvr = net.createServer();
        this.srvr.on('connection', (client) => {
            this.log('Received connection');
            client.on('data', (data) => {
                let {msg, o} = JSON.parse(data);
                if (msg === TcpClient.REGISTER) {
                    if (!this.net.recognizes(o)) {
                        this.registerWith(o.connection);
                    }
                    this.log(`Registering ${JSON.stringify(o)}`);
                    this.net.register(o);
                } else {
                    this.emit(msg, o);
                }
            });
        });
    }

    static get REGISTER() {
        return "REGISTER";
    }

    /**
     * Connects with the miner specified using the connection details provided.
     *
     * @param {Object} minerConnection - The connection information for the other miner.
     */
    registerWith(minerConnection) {
        this.log(`Connection: ${JSON.stringify(minerConnection)}`);
        let conn = net.connect(minerConnection, () => {
            let data = {
                msg: TcpClient.REGISTER,
                o: {
                    name: this.name,
                    address: utils.calcAddress(this.keyPair.publicKey.toString('hex')),
                    connection: this.connection,
                }
            };
            conn.write(JSON.stringify(data));
        });
    }

    /**
     * Begins mining and registers with any known miners.
     */
    initialize(knownMinerConnections) {
        /*Creates a mnemonic and derives a seed from it*/
    /*derives private and public key from the seed. */
    console.log(this.wordlist)
    let m = new KeyGenerator(this.wordlist);
    let seed = m.generateSeed();

    console.log("Your mnemonic is: (Don't forget it!)");
    m.printMnemonic();

    let masterKey = m.generateMasterKey(seed);
    console.log(masterKey.toString('hex'))
    this.masterNode = m.generateMasterNode(masterKey);

    console.log(this.masterNode)
    this.keyPair = this.masterNode.derivePath("m/0'");
    this.address = utils.calcAddress(this.keyPair.publicKey.toString('hex'));
    

    this.knownMiners = knownMinerConnections;
    this.srvr.listen(this.connection.port);
    for (let m of knownMinerConnections) {
      this.registerWith(m);
    }
    }

    /**
     * Prints out a list of any pending outgoing transactions.
     */
    showPendingOut() {
        let s = "";
        this.pendingOutgoingTransactions.forEach((tx) => {
            s += `\n    id:${tx.id} nonce:${tx.nonce} totalOutput: ${tx.totalOutput()}\n`;
        });
        return s;
    }

    showAllBalances() {
        this.log("Showing balances:");
        for (let [id, balance] of this.lastConfirmedBlock.balances) {
            const account = this.accountsManager.getAccountByAddress(id)
            let walletContextString = '<remote>  ';
            if (account !== undefined) {
                const {alias, path} = account
                if (alias !== undefined && alias !== " ") {
                    walletContextString = `<${path}>:(${alias})`
                }
            }
            console.log(`${walletContextString} ${id}: ${balance}`);
        }
    }

    getConfirmedBalanceByAddress(address) {
        return this.lastConfirmedBlock.balanceOf(address);
    }

    getAvailableGoldByAddress(address) {
        let pendingSpent = 0;
        this.pendingOutgoingTransactions.forEach((tx) => {
            if (tx.from === address) {
                pendingSpent += tx.totalOutput();
            }
        });

        return this.getConfirmedBalanceByAddress - pendingSpent;
    }

    postGenericTransactionByAddress(address, txData) {
        // Creating a transaction, with defaults for the
        // from, nonce, and pubKey fields.
        let keyPair = this.accountsManager.getAccountByAddress(address).keyPair;
        let tx = Blockchain.makeTransaction(
            Object.assign({
                    from: address,
                    nonce: this.nonce,
                    pubKey: keyPair.publicKey.toString("hex"),
                },
                txData));

        tx.sign(keyPair.privateKey.toString("hex"));

        // Adding transaction to pending.
        this.pendingOutgoingTransactions.set(tx.id, tx);

        this.nonce++;

        this.net.broadcast(Blockchain.POST_TRANSACTION, tx);

        return tx;
    }

    postTransactionByAddress(address, outputs, fee = Blockchain.DEFAULT_TX_FEE) {
        // We calculate the total value of gold needed.
        let totalPayments = outputs.reduce((acc, {amount}) => acc + amount, 0) + fee;

        // Make sure the client has enough gold.
        let availableGold = this.getAvailableGoldByAddress(address);
        if (totalPayments > availableGold) {
            throw new Error(`Requested ${totalPayments}, but account only has ${availableGold}.`);
        }

        // Create and broadcast the transaction.
        return this.postGenericTransactionByAddress(address, {
            outputs: outputs,
            fee: fee,
        });
    }

    saveJson(fileName) {
        let state = {
            name: this.name,
            connection: this.connection,
            keyPair: this.keyPair,
            knownMiners: this.knownMiners, 
        };
        writeFileSync(fileName, JSON.stringify(state));
    }

}



