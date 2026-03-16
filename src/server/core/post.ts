import { reddit } from '@devvit/web/server';

export interface IpoPostData {
    ticker: string;
    name: string;
    icon: string;
    /** Reddit username of the person who proposed the IPO */
    proposerName: string;
    imageUrl?: string | undefined;
}

/** Creates the main game post (default) or an IPO announcement post. */
export const createPost = async (ipoData?: IpoPostData) => {
    if (!ipoData) {
        return await reddit.submitCustomPost({ title: 'Stonks' });
    }

    const postData: Record<string, string> = {
        type: 'ipo',
        ticker: ipoData.ticker,
        name: ipoData.name,
        icon: ipoData.icon,
        proposerName: ipoData.proposerName,
    };
    if (ipoData.imageUrl) {
        postData.imageUrl = ipoData.imageUrl;
    }

    return await reddit.submitCustomPost({
        title: `🚀 New IPO Alert: ${ipoData.ticker} (${ipoData.name}) by u/${ipoData.proposerName}`,
        postData,
    });
};
