"use strict";

const {utils} = require("spartan-gold");
const accounts = new Map();

module.exports = class AccountsManager {
    createNewAccount(path, alias, privKey, pubKey, balance) {
        if (accounts.has(path)) {
            throw new Error(`Account at path "${path}" already exists. Choose another name.`)
        }
        accounts.set(path, {
            path: path,
            alias: alias,
            keyPair: {
                privKey: privKey,
                pubKey: pubKey
            },
            address: utils.calcAddress(pubKey),
            balance: balance | 0
        })
    }

    getAllBalances() {
        const result = [];
        accounts.forEach((v, k) => result.push({
            path: k,
            alias: v['alias'],
            balance: v['balance']
        }))
        return result;
    }

    getAmount(path) {
        return accounts.get(path)['balance'];
    }

    getAccountByAlias(alias) {
        let entries = accounts.entries();
        for (let entry of entries) {
            const it = entry[1]
            if (it.alias === alias) {
                return it
            }
        }
    }

    getAccountByAddress(address) {
        let entries = accounts.entries();
        for (let entry of entries) {
            const it = entry[1]
            if (it.address === address) {
                return it
            }
        }
    }
}