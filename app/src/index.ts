const Trello = require("node-trello");

const ogs = require("open-graph-scraper");

import {flatten} from "lodash";

import {JSDOM} from 'jsdom';

const trello = new Trello(process.env.KEY, process.env.TOKEN);

interface Card {
    id: string;
    desc: string;
    name: string;
    idAttachmentCover?: string;
}

interface List {
    id: string;
}

interface Attachment {
    url: string;
}

function makePromise<T>(action: string, ...rest: any[]): Promise<T> {
    return new Promise(function (resolve, reject) {
        console.log(action, rest);
        trello[action].apply(trello, rest.concat([(err: Error, data: T) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        }]));
    });
}

function getLists(boardId: string): Promise<List[]> {
    return makePromise('get', `/1/board/${boardId}/lists`);
}

function getCards(listId: string): Promise<Card[]> {
    return makePromise('get', `/1/list/${listId}/cards`);
}

function addAttachment(cardId: string, data: Attachment) {
    return makePromise('post', `/1/card/${cardId}/attachments`, data);
}

function updateCard(cardId: string, data: Partial<Card>) {
    return makePromise('put', `/1/card/${cardId}`, data);
}

function deleteCard(cardId: string) {
    return makePromise('del', `/1/cards/${cardId}`);
}

function getCardAttachments(cardId: string): Promise<Attachment[]> {
    return makePromise('get', `/1/cards/${cardId}/attachments`);
}

function getUrl(str = ''): string {
    const urls = str.match(/https?:\/\/[^ \n]+/gm);
    return urls && urls.length && urls[0] || '';
}

async function findUrlFromAttachment(cardId: string): Promise<string> {
    const attachments = await getCardAttachments(cardId);
    let found = attachments
        .find((a: Attachment) => a.url.includes('craigslist'));
    return found ? found.url : '';
}

async function processCard(cardData: Card) {
    console.log(`${cardData.name}: Started processing`);
    if (cardData.name === 'Check out this listing on REALTOR.ca') {
        await updateCard(cardData.id, {name: cardData.desc})
    }
    const url = getUrl(cardData.name) || getUrl(cardData.desc) || await findUrlFromAttachment(cardData.id);

    if (!url) {
        console.log(`${cardData.name} has no URL`);
        return
    }

    const dom = await JSDOM.fromURL(url);

    let banished = !!dom.window.document.querySelector('#has_been_removed');
    if (banished) {
        console.log(`will delete: ${cardData.name}, ${url}`);
        return await deleteCard(cardData.id);
    }

    if (cardData.idAttachmentCover) {
        return Promise.resolve(true);
    }

    console.log(`${cardData.name}: Getting OGS: '${url}'`);

    try {
        const {data} = await ogs({url});
        if (!data) {
            console.log(`${cardData.name}: No OGP data found`);
        }

        const {ogTitle: title, ogImage: image, ogDescription: description} = data;

        // console.log(data);
        if (!image || !image.url) {
            console.log(`${cardData.name}: has no og:image`);
        } else {
            console.log(`${cardData.name}: Will add ${image.url}`);
            await addAttachment(cardData.id, {url: image.url});
        }
        if (!title) {
            console.log(`${cardData.name}: Has no og:title`);
        } else {
            console.log(`${cardData.name}: Will replace title with: ${title}`);
            let desc = `${url}

${description}

${cardData.desc}`;
            await updateCard(cardData.id, {
                name: title,
                desc: desc.substr(0, 16384)
            });
        }
    } catch (e) {
        console.error(e);
    }
}

async function processCards(cards: Card[]) {
    const results = [];
    for (const card of cards) {
        try {
            results.push(processCard(card));
        } catch (e) {
            console.error(e);
        }
    }
    await Promise.all(results);
}

async function main() {
    try {
        const lists = await getLists(process.env.BOARD);
        let flatCards = flatten(await Promise.all(lists.map(({id}) => getCards(id))));
        console.log(`Board has ${flatCards.length} cards.`);
        await processCards(flatCards);
    } catch (e) {
        console.error(e);
    }

}
main().catch(e => console.error(e));