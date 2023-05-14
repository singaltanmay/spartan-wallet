const net = require('net');

const {writeFileSync} = require('fs');

const {FakeNet, Client, Block, Blockchain, Transaction} = require('spartan-gold')
const AccountsManager = require("./accounts-manager");

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
    constructor({name, startingBlock, keyPair, connection} = {}) {
        super({name, net: new TcpWallet(), startingBlock, keyPair});

        // Setting up the server to listen for connections
        this.accountsManager = new AccountsManager();
        this.connection = connection;
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
                    address: this.address,
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
                    pubKey: keyPair.pubKey,
                },
                txData));

        tx.sign(keyPair.privKey);

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



