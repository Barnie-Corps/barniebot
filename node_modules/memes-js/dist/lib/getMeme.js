"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMeme = void 0;
const axios_1 = require("axios");
const BASEURL = 'https://www.reddit.com/r/{url}.json?sort=top&t=day&limit=100';
/**
 *
 * @param url The name of the subreddit
 * @param force If we want to force the url to be an image
 * @returns all the necessary information of the post
 */
const getMeme = async (url, force = false) => {
    if (typeof url != 'string')
        throw TypeError("The url received is not a string, I received " + typeof url);
    if (typeof force != 'boolean')
        throw TypeError("The force received is not a boolean, I received " + typeof url);
    let data;
    const res = await axios_1.default.get(BASEURL.replace("{url}", url));
    const memes = res.data.data.children;
    if (!memes.length)
        throw new Error("There is no post on this reddit");
    const randomMeme = memes[Math.floor(Math.random() * memes.length)].data;
    if (!/^.*\.(jpg?g|png|gif|gifv)$/.test(randomMeme.url) && force)
        return exports.getMeme(url, true);
    data = {
        title: randomMeme.title,
        author: randomMeme.author,
        created: randomMeme.created,
        downs: randomMeme.downs,
        ups: randomMeme.ups,
        url: randomMeme.url,
        comments: randomMeme.num_comments
    };
    return data;
};
exports.getMeme = getMeme;
