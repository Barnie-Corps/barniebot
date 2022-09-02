let axios;
try {
    axios = require('axios');
} catch (err) {}
const languages = require('./languages');

function extract(key, res) {
    var re = new RegExp(`"${key}":".*?"`);
    var result = re.exec(res.body);
    if (result !== null) {
        return result[0].replace(`"${key}":"`, '').slice(0, -1);
    }
    return '';
}

class Result {
    text = '';
    pronunciation = '';
    from = {
        language: {
            didYouMean: false,
            iso: ''
        },
        text: {
            autoCorrected: false,
            value: '',
            didYouMean: false
        }
    }
    raw = '';
    constructor(raw) {
        this.raw = raw;
    }
}

function translate(input, opts, requestOptions) {
    opts = opts || {};
    requestOptions = requestOptions || {};

    var e;
    [[opts.from, opts.forceFrom], [opts.to, opts.forceTo]].forEach(function ([lang, force]) {
        if (!force && lang && !languages.isSupported(lang)) {
            e = new Error();
            e.code = 400;
            e.message = 'The language \'' + lang + '\' is not supported';
        }
    });

    let requestFunction;
    opts.requestFunction = typeof opts.requestFunction === 'string' ? opts.requestFunction.toLowerCase() : opts.requestFunction;

    switch (opts.requestFunction) {
        case undefined:
        case 'fetch':
            if (typeof fetch !== 'undefined') {
                requestFunction = function (url, requestOptions, body) {
                    const fetchinit = {
                        ...requestOptions,
                        headers: new Headers(requestOptions.headers),
                        credentials: requestOptions.credentials || 'omit',
                        body: body
                    };
                    return fetch(url, fetchinit).then(res => res.text());
                };
                break;
            }
            if (opts.requestFunction === 'fetch') {
                e = new Error();
                e.code = 400;
                e.message = 'fetch was not found';
                break;
            }
        case 'axios':
            if (axios) {
                requestFunction = function (url, requestOptions, body) {
                    const axiosconfig = {
                        ...requestOptions,
                        url: url,
                        data: body
                    };
                    return axios(axiosconfig).then(res => res.data);
                };
                break;
            }
            if (opts.requestFunction === 'axios') {
                e = new Error();
                e.code = 400;
                e.message = 'axios was not found';
                break;
            }
        default:
            if (typeof opts.requestFunction === 'string') {
                e = new Error();
                e.code = 400;
                e.message = (opts.requestFunction || 'axios and fetch') + ' was not found';
            } else {
                requestFunction = opts.requestFunction;
            }

    }

    if (e) {
        return new Promise(function (resolve, reject) {
            reject(e);
        });
    }

    opts.from = opts.from || 'auto';
    opts.to = opts.to || 'en';
    opts.autoCorrect = opts.autoCorrect === undefined ? false : Boolean(opts.autoCorrect);
    opts.from = opts.forceFrom ? opts.from : languages.getCode(opts.from);
    opts.to = opts.forceTo ? opts.to : languages.getCode(opts.to);
    opts.tld = opts.tld || 'com';

    var url = 'https://translate.google.' + opts.tld;

    requestOptions.method = 'GET';

    // according to translate.google.com constant rpcids seems to have different values with different POST body format.
    // * MkEWBc - returns translation
    // * AVdN8 - return suggest
    // * exi25c - return some technical info
    var rpcids = 'MkEWBc';
    return requestFunction(url, requestOptions).then(function (res) {
        var data = {
            'rpcids': rpcids,
            'source-path': '/',
            'f.sid': extract('FdrFJe', res),
            'bl': extract('cfb2h', res),
            'hl': 'en-US',
            'soc-app': 1,
            'soc-platform': 1,
            'soc-device': 1,
            '_reqid': Math.floor(1000 + (Math.random() * 9000)),
            'rt': 'c'
        };

        return data;
    }).then(function (data) {
        // === format for freq below is only for rpcids = MkEWBc ===
        const queryParams = new URLSearchParams(data);

        url = url + '/_/TranslateWebserverUi/data/batchexecute?' + queryParams.toString();
        requestOptions.method = 'POST';
        requestOptions.headers = {
            ...requestOptions.headers,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        };

        const sourceArray = Array.isArray(input) ? input : (typeof input === 'object' ? Object.values(input) : [input]);

        const freq = [];
        for (let i = 0; i < sourceArray.length; i++) {
            let from = sourceArray[i].from || opts.from;
            const forceFrom = sourceArray[i].forceFrom || opts.forceFrom;
            let to = sourceArray[i].to || opts.to;
            const forceTo = sourceArray[i].forceTo || opts.forceTo;
            [[from, forceFrom], [to, forceTo]].forEach(function ([lang, force]) {
                if (!force && lang && !languages.isSupported(lang)) {
                    const e = new Error('The language \'' + lang + '\' is not supported');
                    e.code = 400;
                    throw e;
                }
            });
            from = forceFrom ? from : languages.getCode(from);
            to = forceTo ? to : languages.getCode(to);

            const autoCorrect = sourceArray[i].autoCorrect || opts.autoCorrect;
            const text = sourceArray[i].text || sourceArray[i];

            // i (converted to base 36 to minimize request length) is used as a unique indentifier to order responses
            const freqPart = [rpcids, JSON.stringify([[text, from, to, autoCorrect], [null]]), null, i.toString(36)];
            freq.push(freqPart);
        }
        const body = 'f.req=' + encodeURIComponent(JSON.stringify([freq])) + '&';

        return requestFunction(url, requestOptions, body).then(function (res) {
            res = res.slice(6);

            let finalResult = Array.isArray(input) ? [] : (typeof input === 'object' ? {} : undefined);

            const resChunks = res.split('\n');
            resChunks.forEach(chunk => {
                if (chunk[0] !== '[' || chunk[3] === 'e') {
                    return;
                }
                chunk = JSON.parse(chunk);
                chunk.forEach(translation => {
                    if (translation[0] !== 'wrb.fr') {
                        return;
                    }
                    const id = parseInt(translation[translation.length - 1], 36);
                    translation = JSON.parse(translation[2]);
                    const result = new Result(translation);

                    if (translation[1][0][0][5] === undefined || translation[1][0][0][5] === null) {
                        // translation not found, could be a hyperlink or gender-specific translation?
                        result.text = translation[1][0][0][0];
                    } else {
                        result.text = translation[1][0][0][5]
                            .map(function (obj) {
                                return obj[0];
                            })
                            .filter(Boolean)
                            // Google api seems to split text per sentences by <dot><space>
                            // So we join text back with spaces.
                            // See: https://github.com/vitalets/google-translate-api/issues/73
                            .join(' ');
                    }
                    result.pronunciation = translation[1][0][0][1];

                    // From language
                    if (translation[0] && translation[0][1] && translation[0][1][1]) {
                        result.from.language.didYouMean = true;
                        result.from.language.iso = translation[0][1][1][0];
                    } else if (translation[1][3] === 'auto') {
                        result.from.language.iso = translation[2];
                    } else {
                        result.from.language.iso = translation[1][3];
                    }

                    // Did you mean & autocorrect
                    if (translation[0] && translation[0][1] && translation[0][1][0]) {
                        var str = translation[0][1][0][0][1];

                        str = str.replace(/<b>(<i>)?/g, '[');
                        str = str.replace(/(<\/i>)?<\/b>/g, ']');

                        result.from.text.value = str;

                        if (translation[0][1][0][2] === 1) {
                            result.from.text.autoCorrected = true;
                        } else {
                            result.from.text.didYouMean = true;
                        }
                    }
                    if (Array.isArray(input)) {
                        finalResult[id] = result;
                    } else if (typeof input === 'object') {
                        finalResult[Object.keys(input)[id]] = result;
                    } else {
                        finalResult = result;
                    }
                });
            });

            return finalResult;
        }).catch(function (err) {
            err.message += `\nUrl: ${url}`;
            if (err.statusCode !== undefined && err.statusCode !== 200) {
                err.code = 'BAD_REQUEST';
            } else {
                err.code = 'BAD_NETWORK';
            }
            throw err;
        });
    });
}

module.exports = translate;
module.exports.languages = languages;
