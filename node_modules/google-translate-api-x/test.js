let axios;
try {
    axios = require('axios');
} catch (err) {
    if (fetch === undefined) {
        throw new Error('Neither Fetch nor Axios are accessible!');
    }
}

const test = require('ava');
const languages = require('./languages.js');
const translate = require('./index.js');

test('translate without any options', async t => {
    const res = await translate('vertaler');

    t.is(res.text, 'translator');
    t.false(res.from.language.didYouMean);
    t.is(res.from.language.iso, 'nl');
    t.false(res.from.text.autoCorrected);
    t.is(res.from.text.value, '');
    t.false(res.from.text.didYouMean);
});

test('translate from auto to dutch', async t => {
    const res = await translate('translator', {from: 'auto', to: 'nl'});

    t.is(res.text, 'vertaler');
    t.false(res.from.language.didYouMean);
    t.is(res.from.language.iso, 'en');
    t.false(res.from.text.autoCorrected);
});

if (axios) {
    test('translate using axios if default fetch, and installed', async t => {
        const res = await translate('translator', {from: 'en', to: 'nl', requestFunction: 'axios'});

        t.is(res.text, 'vertaler');
        t.false(res.from.language.didYouMean);
        t.is(res.from.language.iso, 'en');
        t.false(res.from.text.autoCorrected);
    });
}

test('translate several sentences with spaces (#73)', async t => {
    const res = await translate(
        'translator, translator. translator! translator? translator,translator.translator!translator?',
        {from: 'auto', to: 'nl'}
    );

    t.is(res.text, 'Vertaler, vertaler. vertaler! vertaler? vertaler, vertaler.translator! Vertaler?');
});

test('test pronunciation', async t => {
    const res = await translate('translator', {from: 'auto', to: 'zh-CN'});

    // here can be 2 variants: 'Yì zhě', 'Fānyì'
    t.regex(res.pronunciation, /^(Yì zhě)|(Fānyì)|(Fānyì)$/);
});

test('translate some english text setting the source language as portuguese', async t => {
    const res = await translate('happy', {from: 'pt', to: 'nl'});

    t.true(res.from.language.didYouMean);
    t.is(res.from.language.iso, 'en');
});

test('translate some misspelled english text to dutch, expecting not autocorrrected', async t => {
    const res = await translate('I spea Dutch!', {from: 'en', to: 'nl'});

    if (res.from.text.didYouMean && !res.from.text.autoCorrected) {
        t.is(res.from.text.value, 'I [speak] Dutch!');
        t.is(res.text, 'Ik speed Nederlands!');
    } else {
        t.fail();
    }
});

test('translate some mispelled english text to dutch, expecting autoCorrect', async t => {
    const res = await translate('I spea Dutch!', {from: 'en', to: 'nl', autoCorrect: true});

    if (!res.from.text.didYouMean && res.from.text.autoCorrected) {
        t.is(res.from.text.value, 'I [speak] Dutch!');
        t.is(res.text, 'Ik spreek Nederlands!');
    } else {
        t.fail();
    }
});

test('translate some text and get the raw output alongside', async t => {
    const res = await translate('vertaler', {raw: true});

    t.truthy(res.raw);
});

test('test a supported language – by code', t => {
    t.true(languages.isSupported('en'));
});

test('test an unsupported language – by code', t => {
    t.false(languages.isSupported('js'));
});

test('test a supported language – by name', t => {
    t.true(languages.isSupported('english'));
});

test('test an unsupported language – by name', t => {
    t.false(languages.isSupported('javascript'));
});

test('get a language code by its name', t => {
    t.is(languages.getCode('english'), 'en');
});

test('get an unsupported language code by its name', t => {
    t.false(languages.getCode('javascript'));
});

test('get a supported language code by code', t => {
    t.is(languages.getCode('en'), 'en');
});

test('call getCode with \'undefined\'', t => {
    t.is(languages.getCode(undefined), false);
});

test('call getCode with \'null\'', t => {
    t.is(languages.getCode(null), false);
});

test('call getCode with an empty string', t => {
    t.is(languages.getCode(''), false);
});

test('call getCode with no arguments', t => {
    t.is(languages.getCode(), false);
});

test('try to translate from an unsupported language', async t => {
    try {
        await translate('something', {from: 'js', to: 'en'});
        t.fail();
    } catch (err) {
        t.is(err.code, 400);
        t.is(err.message, 'The language \'js\' is not supported');
    }
});

test('try to translate to an unsupported language', async t => {
    try {
        await translate('something', {from: 'en', to: 'js'});
        t.fail();
    } catch (err) {
        t.is(err.code, 400);
        t.is(err.message, 'The language \'js\' is not supported');
    }
});

test('try to translate with an unsupported request function', async t => {
    try {
        await translate('something', {from: 'en', to: 'es', requestFunction: 'test'});
        t.fail();
    } catch (err) {
        t.is(err.code, 400);
        t.is(err.message, 'test was not found');
    }
});

test('translate from dutch to english using language names instead of codes', async t => {
    const res = await translate('iets', {from: 'dutch', to: 'english'});

    t.is(res.from.language.iso, 'nl');
    t.is(res.text, 'something');
});

test('translate via custom tld', async t => {
    const res = await translate('vertaler', {tld: 'cn'});

    t.is(res.text, 'translator');
    t.false(res.from.language.didYouMean);
    t.is(res.from.language.iso, 'nl');
    t.false(res.from.text.autoCorrected);
    t.is(res.from.text.value, '');
    t.false(res.from.text.didYouMean);
});

test('translate via an external language from outside of the API', async t => {
    translate.languages['sr-Latn'] = 'Serbian Latin';
    const res = await translate('translator', {to: 'sr-Latn'});

    t.is(res.text, 'преводилац');
    t.is(res.from.language.iso, 'en');
});

test('pass fetch init', async t => {
    const abortController = new AbortController();
    const fetchinit = {
        signal: abortController.signal
    };
    try {
        const translation = translate('vertaler', {}, fetchinit);
        abortController.abort();
        await translation;
    } catch (err) {
        try {
            if (fetch) {
                t.is(err.name, 'AbortError');
            }
        } catch (_) {
            t.is(err.name, 'CanceledError');
        }
    }
});

test('test get zh code', t => {
    t.false(languages.getCode('zh'));
});

test('test get zh-CN code', t => {
    t.is(languages.getCode('zh-CN'), 'zh-CN');
});

test('test get zh-cn code', t => {
    t.false(languages.getCode('zh-cn'));
});

test('test get zh-TW code', t => {
    t.is(languages.getCode('zh-TW'), 'zh-TW');
});

test('test get zh-tw code', t => {
    t.false(languages.getCode('zh-tw'));
});

test('test zh unsupported', t => {
    t.false(languages.isSupported('zh'));
});

test('test zh-CN supported', t => {
    t.true(languages.isSupported('zh-CN'));
});

test('test zh-cn unsupported', t => {
    t.false(languages.isSupported('zh-cn'));
});

test('test zh-TW supported', t => {
    t.true(languages.isSupported('zh-TW'));
});

test('test zh-tw unsupported', t => {
    t.false(languages.isSupported('zh-tw'));
});

test('test zh-CN supported – by name', t => {
    t.true(languages.isSupported('chinese (simplified)'));
});

test('translate "smug" to es (#88)', async t => {
    const res = await translate('smug', {to: 'es'});

    t.is(res.text, 'presumida');
});

test('autoCorrect', async t => {
    let res = await translate('I spea Dutch!', {from: 'en', to: 'nl', autoCorrect: true});

    t.is(res.from.text.value, 'I [speak] Dutch!');

    // for some reason autocorrect not always applied..
    if (!res.from.text.autoCorrected) {
        const correctedText = res.from.text.value.replace(/\[([a-z]+)\]/ig, '$1');
        res = await translate(correctedText, {from: 'en', to: 'nl'});
    }

    t.is(res.text, 'Ik spreek Nederlands!');
});

test('force to language not listed', async t => {
    languages['ja'] = undefined;
    const res = await translate('dog', {from: 'en', to: 'ja', forceTo: true});
    t.is(res.text, '犬');
});

test('force from language not listed', async t => {
    languages['ja'] = undefined;
    const res = await translate('犬', {from: 'ja', to: 'en', forceFrom: true});
    t.is(res.text, 'dog');
});

test('array input and output', async t => {
    const res = await translate(['dog', 'cat'], {from: 'en', to: 'es'});

    t.is(res.length, 2);
    t.is(res[0].text, 'perra');
    t.is(res[1].text, 'gata');
});

test('array input in auto from different languages', async t => {
    const res = await translate(['perro', '犬', 'كلب'], {from: 'auto', to: 'en'});

    t.is(res.length, 3);
    t.is(res[0].text, 'dog');
    t.is(res[1].text, 'dog');
    t.is(res[2].text, 'dog');
});

test('object input and output', async t => {
    const res = await translate({dog: 'dog', cat: 'cat'}, {from: 'en', to: 'es'});

    t.is(res.dog.text, 'perra');
    t.is(res.cat.text, 'gata');
});

test('option query translate different languages', async t => {
    const res = await translate([{text: 'dog', to: 'ar'}, 'cat'], {from: 'en', to: 'es'});

    t.is(res[0].text, 'كلب');
    t.is(res[1].text, 'gata');
});

test('large batch translate', async t => {
    const sources = [];
    const targets = [];
    for (let i = 0; i < 1000; i++) {
        const mod = i % 3;
        if (mod === 0) {
            sources.push('uno');
            targets.push('one');
        } else if (mod === 1) {
            sources.push('dos');
            targets.push('two');
        } else {
            sources.push('tres');
            targets.push('three');
        }
    }

    const res = await translate(sources, {from: 'es', to: 'en'});

    const translations = res.map(translation => translation.text);

    t.deepEqual(translations, targets);
});

test('force from language not listed in option query', async t => {
    languages['ja'] = undefined;
    const res = await translate(['test', {text: '犬', from: 'ja', to: 'en', forceFrom: true}]);
    t.is(res[1].text, 'dog');
});

test('force to language not listed  in option query', async t => {
    languages['ja'] = undefined;
    const res = await translate(['test', {text: 'dog', from: 'en', to: 'ja', forceTo: true}]);
    t.is(res[1].text, '犬');
});
