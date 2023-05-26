"use strict";

const fs = require("fs");
const crypto = require("crypto");
const { networks } = require("bitcoinjs-lib");
const { BIP32Factory } = require("bip32");
const ecc = require("tiny-secp256k1");

const WORD_LIST_FILE = "./english.json";
const HASH_ALG = "sha256";
const NUM_BYTES = 32;

const SALT_BASE = "mnemonic";
const NUM_PBKDF2_ROUNDS = 2048;
const KEY_LENGTH = 64; // 64 bytes = 512 bits
const PBKDF2_DIGEST = "sha512"; // Should be 'hmac-sha512'

class KeyGenerator {
  // to generate the mnemonic words.
  constructor(words) {
    let content = fs.readFileSync(WORD_LIST_FILE);
    this.wordlist = JSON.parse(content);

    //keep track of last index created
    this.index = 0;
    this.depth = 0;

    // New mnemonic.
    if (words === undefined) {
      // Creating the sequence, with an extra byte for the checksum.
      this.seq = Buffer.alloc(NUM_BYTES + 1);

      // Fill `this.seq` // with 32 random bytes.  The
      // crypto.randomFillSync function may be useful here.
      crypto.randomFillSync(this.seq, 0, NUM_BYTES);

      // Next, calculate the checksum.  The checksum is 1 byte,
      // which is the first byte of the hash of the random sequence.
      const checksum = this.calcChecksum();
      // Once you have calculated the checksum, append it to the
      // end of the buffer.
      this.seq.writeUInt8(checksum, NUM_BYTES);
    } else {
      // If the caller specifies a list of words, use this for the mnemonic.
      this.calculateSequence(words);
    }

    this.bip32 = BIP32Factory(ecc);
  }

  // Converts a byte to a string of zeroes and ones.
  static convertByteToBinString(byte) {
    let bs = "";
    // Test each bit individually, appending either a 1 or a 0.
    bs += byte & 0x80 ? "1" : "0";
    bs += byte & 0x40 ? "1" : "0";
    bs += byte & 0x20 ? "1" : "0";
    bs += byte & 0x10 ? "1" : "0";
    bs += byte & 0x08 ? "1" : "0";
    bs += byte & 0x04 ? "1" : "0";
    bs += byte & 0x02 ? "1" : "0";
    bs += byte & 0x01 ? "1" : "0";
    return bs;
  }

  // Converts a string of zeroes and ones to a byte
  static convertBinStringToByte(bs) {
    let bitPosVal = 128;
    let n = 0;
    for (let i = 0; i < bs.length; i++) {
      const bit = bs.charAt(i);
      if (bit === "1") {
        n += bitPosVal;
      }
      bitPosVal = bitPosVal / 2;
    }
    return n;
  }

  // Takes a buffer and returns an array of 11-bit unsigned ints
  static split(seq) {
    // convert seq to binary string
    let bitString = "";

    for (let byte of seq.values()) {
      let bs = this.convertByteToBinString(byte);
      bitString += bs;
    }

    // break up binary into 11bits
    let elevenBits = bitString.match(/.{11}/g);

    // convert 11bits to ints
    return elevenBits.map((bs) => {
      let bitPosVal = 1024;
      let val = 0;
      for (let i = 0; i < bs.length; i++) {
        let bit = bs.charAt(i);
        if (bit === "1") val += bitPosVal;
        bitPosVal = bitPosVal / 2;
      }
      return val;
    });
  }

  // Converts an 11-bit number to a string of 0's and 1's.
  static translate11bit(n) {
    let bitPosVal = 1024;
    let bs = "";
    while (bitPosVal >= 1) {
      if (n >= bitPosVal) {
        bs += "1";
        n -= bitPosVal;
      } else {
        bs += "0";
      }
      bitPosVal = bitPosVal / 2;
    }
    return bs;
  }

  // Returns a string with the sequence of words matching to
  // the random sequence.
  words() {
    // Returns an array of 11-bit numbers.
    let arr = this.constructor.split(this.seq);
    // Convert 11-bit numbers to the corresponding words from the dictionary,
    // join together into a space-delimited string, and return the string.
    // let result = "";
    // for (let i = 0; i < arr.length-1; i++) {
    //     const _11bit = arr[i];
    //     const _listequivalent = this.wordlist[_11bit];
    //     result += ' ' + _listequivalent;
    // }
    // return result;
    return arr.map((a) => this.wordlist[a]).join(" ");
  }

  // Hash the sequence, returning the first byte.
  calcChecksum() {
    // Dropping the last byte, holding the checksum.
    let seqHex = this.seq.toString("hex").slice(0, NUM_BYTES);
    let buf = Buffer.from(seqHex);

    // Hashing the buffer, returning the first byte of the hash
    // as the checksum.
    let h = crypto.createHash(HASH_ALG).update(buf).digest();
    return h[0];
  }

 calculateSequence(words) {
  let wordArray = words.split(" ");
  // Determine the number of bytes needed based on the word count
  const numBytesNeeded = Math.ceil((wordArray.length * 11) / 8);
  // Extra byte for checksum
  this.seq = Buffer.alloc(numBytesNeeded + 1);
  let bitString = "";
  // Determine the string of bits from the specified words.
  // Remember that each word translates to an 11-bit number,
  // so conversion can be a little awkward.
  wordArray.forEach((w) => {
    const n = this.wordlist.indexOf(w);
    bitString += this.constructor.translate11bit(n);
  });

  // Convert the bit string to bytes and write to the `this.seq` buffer.
  for (let i = 0; i < bitString.length; i += 8) {
    const byteStr = bitString.substr(i, 8).padEnd(8, "0");
    const byte = this.constructor.convertBinStringToByte(byteStr);
    if (i / 8 < numBytesNeeded) {
      this.seq.writeUInt8(byte, i / 8);
    }
  }

  // Using that string of bits, convert to bytes and write
  // to the `this.seq` buffer.
}


  // Returns true if the checksum matches its contents.
  isValid() {
    let checksum = this.calcChecksum();
    return checksum === this.seq.readUInt8(NUM_BYTES);
  }

  // Returns a random seed derived from the mnemonic and an optional passphrase.
  generateSeed(passphrase = "") {
    let key = crypto.pbkdf2Sync(
      this.seq,
      SALT_BASE + passphrase,
      NUM_PBKDF2_ROUNDS,
      KEY_LENGTH,
      PBKDF2_DIGEST
    );
    return key.toString("hex");
  }

  //Print out user's mnemonic
  printMnemonic() {
    console.log();
    console.log("*** Printing mnemonic out ***");
    let s = this.words();
    let arr = s.split(" ");
    let i = 1;
    arr.forEach((word) => {
      console.log(i + ": " + word);
      i++;
    });
    console.log();
  }

  getMnemonic(){
    return this.words();
  }

  //Returns master key for the HD wallet
  //Instead of Bitcoin seed, should we do SpartanGold seed?
  generateMasterKey(seed) {
    let masterKey = crypto.pbkdf2Sync(
      seed,
      "Bitcoin seed",
      NUM_PBKDF2_ROUNDS,
      KEY_LENGTH,
      PBKDF2_DIGEST
    );
    return masterKey;
  }

  //private key is used to sign transactions and prove ownership of crypto assets
  //extended private key is used in the key derivation algorithm to derive keys from master key
  generateKeys(masterKey) {
    let privateKey = masterKey.slice(0, 32);
    let chainCode = masterKey.slice(32);
    return [privateKey, chainCode];
  }

  generateMasterNode(masterKey) {
    let [privateKey, chainCode] = this.generateKeys(masterKey);
    this.masterPrivateKey = privateKey;
    this.masterChainCode = chainCode;

    this.masterNode = this.bip32.fromPrivateKey(
      privateKey,
      chainCode,
      networks.bitcoin
    );
    return this.masterNode;
  }
}

exports.KeyGenerator = KeyGenerator;
