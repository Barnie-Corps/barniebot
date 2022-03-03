import { IMeme } from './';
/**
 *
 * @param url The name of the subreddit
 * @param force If we want to force the url to be an image
 * @returns all the necessary information of the post
 */
export declare const getMeme: (url: string, force?: boolean) => Promise<IMeme>;
