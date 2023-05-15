const net = require("net");

const { writeFileSync } = require("fs");
const crypto = require("crypto");
const ecKeyUtils = require('eckey-utils');

const {
  FakeNet,
  Client,
  Block,
  Blockchain,
  Transaction,
  utils,
  Miner,
} = require("spartan-gold");
const AccountsManager = require("./accounts-manager");

const KeyGenerator = require("./key-generator.js").KeyGenerator;

/**
 * This extends the FakeNet class to actually communicate over the network.
 */
class TcpWallet extends FakeNet {
  sendMessage(address, msg, o) {
    if (typeof o === "string") o = JSON.parse(o);
    let data = { msg, o };
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
module.exports = class TcpClient extends Miner {
  /**
   * In addition to the usual properties for a miner, the constructor
   * also takes a JSON object for the connection information and sets
   * up a listener to listen for incoming connections.
   */
  constructor({
    name,
    startingBlock,
    keyPair,
    connection,
    mnemonic,
    passphrase,
  } = {}) {
    super({ name, net: new TcpWallet(), startingBlock, keyPair });
    // Setting up the server to listen for connections
    this.accountsManager = new AccountsManager();
    this.connection = connection;
    this.mnemonic = mnemonic;
    this.passphrase = passphrase;

    /*Creates a mnemonic and derives a seed from it*/
    let m = new KeyGenerator(this.mnemonic);
    let seed = m.generateSeed(this.passphrase);
    console.log("Your mnemonic is: (Don't forget it!)");
    m.printMnemonic();

    /* Derive masterkey/node from seed */
    let masterKey = m.generateMasterKey(seed);
    this.masterNode = m.generateMasterNode(masterKey);
    this.path = "m/0'";

    /*derives private and public key from the seed. */
    this.keyPair = this.masterNode.derivePath(this.path);

    console.log(this.keyPair)

    /*Change Private/Public Key to PEM format*/
    const curveName = 'secp256k1';
    const pems = ecKeyUtils.generatePem({curveName, privateKey: this.keyPair.privateKey, publicKey: this.keyPair.publicKey});
    
    /*Private/Public in x509 andsec1 PEM formats*/
    const x509Pem = pems.publicKey;
    const sec1Pem = pems.privateKey;

    /*Change Prv/Pub Keys to PCKS8/SPKI keys */
    const spkix509Pem = crypto.createPublicKey({ key: x509Pem, format: 'pem' }).export({ type: 'spki', format: 'pem' });
    const pkcs8PemFromSec1 = crypto.createPrivateKey({key: sec1Pem, format: 'pem', type: 'sec1'}).export({type: 'pkcs8', format: 'pem'}).toString();

    this.keyPair = {publicKey: spkix509Pem, pkcs8PemFromSec1}
    console.log(this.keyPair)

    this.address = utils.calcAddress(this.keyPair.publicKey);
    new AccountsManager().createNewAccount(
      this.path,
      this.masterNode,
      "root",
      this.availableGold
    );

    this.srvr = net.createServer();
    this.srvr.on("connection", (client) => {
      this.log("Received connection");
      client.on("data", (data) => {
        let { msg, o } = JSON.parse(data);
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

  lateGenesis(startingBalances) {
    let genesisBlock = Blockchain.makeGenesis({
      blockClass: Block,
      transactionClass: Transaction,
      startingBalances: startingBalances,
    });
    this.lastConfirmedBlock = genesisBlock;
    this.lastBlock = genesisBlock;
    this.blocks.clear();
    this.blocks.set(genesisBlock.id, genesisBlock);
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
          address: utils.calcAddress(this.keyPair.publicKey),
          connection: this.connection,
        },
      };
      conn.write(JSON.stringify(data));
    });
  }

  /**
   * Begins mining and registers with any known miners.
   */
  async initialize(knownMinerConnections) {
    this.knownMiners = knownMinerConnections;
    super.initialize();
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
      s += `\n    id:${tx.id} nonce:${
        tx.nonce
      } totalOutput: ${tx.totalOutput()}\n`;
    });
    return s;
  }

  showAllBalances() {
    this.log("Showing balances:");
    for (let [id, balance] of this.lastConfirmedBlock.balances) {
      const account = this.accountsManager.getAccountByAddress(id);
      let walletContextString = "<remote>  ";
      if (account !== undefined) {
        const { alias, path } = account;
        if (alias !== undefined && alias !== " ") {
          walletContextString = `<${path}>:(${alias})`;
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
    console.log(keyPair)
    //let publicKey = keyPair.publicKey;
    //let privateKeyBuffer = keyPair.privateKey;
    
    //const curveName = 'secp256k1';
    //const pems = ecKeyUtils.generatePem({curveName, privateKey: privateKeyBuffer, publicKey: publicKey});
    
    //const x509Pem = pems.publicKey;
    //const sec1Pem = pems.privateKey;

    //const spkix509Pem = crypto.createPublicKey({ key: x509Pem, format: 'pem' }).export({ type: 'spki', format: 'pem' });
    //console.log(spkix509Pem)
    let tx = Blockchain.makeTransaction(
      Object.assign(
        {
          from: address,
          nonce: this.nonce,
          pubKey: keyPair.publicKey,
        },
        txData
      )
    );

    
    //const pkcs8PemFromSec1 = crypto.createPrivateKey({key: sec1Pem, format: 'pem', type: 'sec1'}).export({type: 'pkcs8', format: 'pem'}).toString();
    //console.log(pkcs8PemFromSec1)
    
    tx.sign(keyPair.privateKey);

    // Adding transaction to pending.
    this.pendingOutgoingTransactions.set(tx.id, tx);

    this.nonce++;

    this.net.broadcast(Blockchain.POST_TRANSACTION, tx);

    return tx;
  }

  postTransactionByAddress(address, outputs, fee = Blockchain.DEFAULT_TX_FEE) {
    // We calculate the total value of gold needed.
    let totalPayments =
      outputs.reduce((acc, { amount }) => acc + amount, 0) + fee;

    // Make sure the client has enough gold.
    let availableGold = this.getAvailableGoldByAddress(address);
    if (totalPayments > availableGold) {
      throw new Error(
        `Requested ${totalPayments}, but account only has ${availableGold}.`
      );
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
};
