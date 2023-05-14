"use strict";

const {utils} = require("spartan-gold");
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
              while(accounts.has(`m/${counter}'`)){
                  counter++;
              }
            keyPair = masterNode.derivePath(`m/${counter}'`);
            counter++;
          }else{
            if (accounts.has(path)) {
                throw new Error(`Account at path "${path}" already exists. Choose another name.`)
            }else{
                keyPair = masterNode.derivePath(path);
            }
          }

        accounts.set(path, {
            path: path,
            alias: alias,
            keyPair: keyPair,
            address: utils.calcAddress(keyPair.publicKey.toString('hex')),
            balance: balance | 0
        })
    }

    getAllBalances() {
        const result = [];
        accounts.forEach((v, k) => result.push({
            path: k,
            alias: v['alias'],
            address: v['address'],
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