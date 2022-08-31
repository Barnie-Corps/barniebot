import axios from "axios";
import { IMeme } from "./interfaces";
/**
 *
 * @param {string} url The name of the subreddit
 * @param {boolean} force If we want to force the url to be an image
 * @returns {IMeme} all the necessary information of the post
 */
export const getMeme = async (
    url: string,
    force: boolean = false
): Promise<IMeme> => {
    if (typeof url != 'string')
        throw TypeError(
            'The url received is not a string, I received ' + typeof url
        );
    if (typeof force != 'boolean')
        throw TypeError(
            'The force received is not a boolean, I received ' + typeof url
        );
    const res = await axios({ url: `https://www.reddit.com/r/${url}.json?sort=top&t=day&limit=100` });
    const memes: Array<any> = res.data.data.children;
    if (!memes.length) throw TypeError("There is no post on this reddit");
    const randomMeme = memes[Math.floor(Math.random() * memes.length)].data;
    if (!/^.*\.(jpg?g|png|gif|gifv)$/.test(randomMeme.url) && force)
        return getMeme(url, true);
    return {
        title: randomMeme.title,
        author: randomMeme.author,
        created: randomMeme.created,
        downs: randomMeme.downs,
        ups: randomMeme.ups,
        url: randomMeme.url,
        comments: randomMeme.num_comments,
    };
};
