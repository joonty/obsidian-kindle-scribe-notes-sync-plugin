import { remote } from "electron";
import { requestUrl } from "obsidian";

export class AmazonApiError extends Error {
    constructor(
        readonly url: string,
        readonly status: number,
        readonly cookieCount: number,
        readonly body: string,
    ) {
        super(`Amazon returned ${status} for ${url} (${cookieCount} cookies sent)`);
        this.name = 'AmazonApiError';
    }
}

const getCookies = async () => {
    const ses = remote.session.defaultSession;

    return await ses.cookies.get({ domain: '.amazon.com' });
};

export const getAmazonCookies = async (): Promise<string> => {
    const cookies = await getCookies();

    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
};

const requestAmazon = async (url: string, headers?: object) => {
    const cookies = await getCookies();
    const result = await requestUrl({
        url,
        throw: false,
        headers: {
            Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
            ...headers
        }
    });

    if (result.status < 200 || result.status >= 300) {
        throw new AmazonApiError(url, result.status, cookies.length, result.text.slice(0, 500));
    }

    return { result, cookieCount: cookies.length };
};

export const getChunk = async (endpointUrl: string, renderingToken: string): Promise<ArrayBuffer> => {
    const { result } = await requestAmazon(endpointUrl, {
        "x-amzn-karamel-notebook-rendering-token": renderingToken
    });

    return result.arrayBuffer;
};

export const getAmazonApi = async <T extends object>(endpointUrl: string, headers?: object): Promise<T> => {
    const { result, cookieCount } = await requestAmazon(endpointUrl, headers);

    // Amazon answers an unauthenticated request with a sign-in page and a 200
    // status, so a parse failure is the signal that the cookies are stale
    try {
        return await result.json as T;
    } catch {
        throw new AmazonApiError(endpointUrl, result.status, cookieCount, result.text.slice(0, 500));
    }
};

export const noAmazonCookies = async (): Promise<boolean> => {
    const cookies = await getCookies();

    return cookies.length == 0;
};
