"use strict";

const { utils } = require("spartan-gold");
const crypto = require("crypto");
const ecKeyUtils = require('eckey-utils');

let accounts = new Map();
let keyPair;
let counter = 1;

module.exports = class AccountsManager {
  createNewAccount(path, masterNode, alias, balance) {
    if (accounts.has(alias)) {
      throw new Error(
        `Account with alias "${alias}" already exists. Choose another name.`
      );
    }

    if (path === "") {
      while (accounts.has(`m/${counter}'`)) {
        counter++;
      }
      keyPair = masterNode.derivePath(`m/${counter}'`);
      counter++;
    } else {
      if (accounts.has(path)) {
        throw new Error(
          `Account at path "${path}" already exists. Choose another name.`
        );
      } else {
        keyPair = masterNode.derivePath(path);
      }
    }

    /*Change Private/Public Key to PEM format*/
    const curveName = "secp256k1";
    const pems = ecKeyUtils.generatePem({
      curveName,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
    });

    /*Private/Public in x509 andsec1 PEM formats*/
    const x509Pem = pems.publicKey;
    const sec1Pem = pems.privateKey;

    /*Change Prv/Pub Keys to PCKS8/SPKI keys */
    const spkix509Pem = crypto
      .createPublicKey({ key: x509Pem, format: "pem" })
      .export({ type: "spki", format: "pem" });
    const pkcs8PemFromSec1 = crypto
      .createPrivateKey({ key: sec1Pem, format: "pem", type: "sec1" })
      .export({ type: "pkcs8", format: "pem" })
      .toString();

      keyPair = {publicKey: spkix509Pem, privateKey:pkcs8PemFromSec1};

    accounts.set(path, {
      path: path,
      alias: alias,
      keyPair: keyPair,
      address: utils.calcAddress(keyPair.publicKey),
      balance: balance | 0,
    });
  }

  getAllBalances() {
    const result = [];
    accounts.forEach((v, k) =>
      result.push({
        path: k,
        alias: v["alias"],
        address: v["address"],
        balance: v["balance"],
      })
    );
    return result;
  }

  getAmount(path) {
    return accounts.get(path)["balance"];
  }

  getAccountByAlias(alias) {
    let entries = accounts.entries();
    for (let entry of entries) {
      const it = entry[1];
      if (it.alias === alias) {
        return it;
      }
    }
  }

  getAccountByAddress(address) {
    let entries = accounts.entries();
    for (let entry of entries) {
      const it = entry[1];
      if (it.address === address) {
        return it;
      }
    }
  }
};
