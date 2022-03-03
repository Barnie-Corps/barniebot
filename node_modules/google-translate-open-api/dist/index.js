"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var translate_1 = require("./translate");
var util_1 = require("./util");
exports.parseMultiple = util_1.parseMultiple;
var language_1 = require("./language");
exports.isSupport = language_1.isSupport;
exports.getAllLanguage = language_1.getAllLanguage;
exports.getAllCode = language_1.getAllCode;
function translate(value, options) {
    // {tld: "cn"}
    var text;
    if (typeof value === 'string') {
        text = [value];
        !options.format && (options.format = 'text');
    }
    else {
        text = value;
        !options.format && (options.format = 'html');
    }
    return translate_1.default(text, options);
}
exports.default = translate;
