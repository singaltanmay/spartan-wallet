"use strict";

const accounts = new Map();

module.exports = class AccountsManager {
    createNewAccount(path, alias, privKey, pubKey, balance) {
        if (accounts.has(alias)) {
            throw new Error(`Account with alias "${alias}" already exists. Choose another name.`)
        }
        accounts.set(alias, {
            path: path,
            alias: alias,
            keyPair: {
                privKey: privKey,
                pubKey: pubKey
            },
            balance: balance | 0
        })
    }

    getAllBalances() {
        const result = [];
        accounts.forEach((v, k) => result.push({
            alias: k,
            balance: v['balance']
        }))
        return result;
    }

    getAmount(alias) {
        return accounts.get(alias)['balance'];
    }
}