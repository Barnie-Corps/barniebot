"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function arrayStringify(data) {
    return data.map(function (item) { return "q=" + encodeURIComponent(item); }).join('&');
}
exports.arrayStringify = arrayStringify;
function parseMultiple(list) {
    var translateMap = list.map(function (item) {
        var text = item[0][0][0];
        if (text.indexOf('<b>') > -1) {
            return rmHtml(text);
        }
        return text;
    });
    return translateMap;
}
exports.parseMultiple = parseMultiple;
function rmHtml(value) {
    return value.match(/<b>(.*?)<\/b>/g).map(function (item) { return item.match(/<b>(.*)<\/b>/)[1]; }).join('');
}
