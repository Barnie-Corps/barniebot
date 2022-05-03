const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const utils = {
    encryptWithAES: (key, text) => {
        const cipher = crypto.createCipher('aes-256-cbc', key);
        let crypted = cipher.update(text, 'utf8', 'hex');
        crypted += cipher.final('hex');
        return crypted;
    },
    decryptWithAES: (key, text) => {
        try {
            const decipher = crypto.createDecipher('aes-256-cbc', key);
            let dec = decipher.update(text, 'hex', 'utf8');
            dec += decipher.final('utf8');
            return dec;
        }
        catch (e) {
            return null;
        }
    },
    hasWord: (text, word) => {
        return RegExp(`\\b${word}\\b`, 'i').test(text);
    }
}
module.exports = utils;