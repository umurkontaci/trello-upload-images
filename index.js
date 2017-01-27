const Trello = require("node-trello");
const ogs = require( 'open-graph-scraper' );
const flatten = require('lodash/flatten');
const range = require( 'lodash/range' );

const t = new Trello(process.env.KEY, process.env.TOKEN);

function makePromise( action ) {
	return new Promise( ( resolve, reject ) => {
		console.log( arguments );
		t[ action ].apply( t, Array.from( arguments ).slice(1).concat( [ (err, data) => {
			if ( err ) {
				reject( err );
			} else {
				resolve ( data );
			}
		} ] ) ) ;
	} );
}

function getBoard(id) {
	return makePromise('get', `/1/board/${id}`);
}

function getLists(boardId) {
	return makePromise('get', `/1/board/${boardId}/lists`);
}

function getCards(listId) {
	return makePromise('get', `/1/list/${listId}/cards`);
}

function addAttachment( cardId, data ) {
	return makePromise('post', `/1/card/${cardId}/attachments`, data );
}

function updateCard( cardId, data ) {
	return makePromise( 'put', `/1/card/${cardId}`, data );
}

function getUrl( str ) {
	const urls = str.match( /https?:\/\/[^ ]+/gm );
	return urls && urls.length && urls[ 0 ] || null;
}

function processCard( cardData ) {
	return new Promise( ( resolve, reject ) => {
		console.log( `${cardData.name}: Started processing` );
		const url = getUrl( cardData.name );
		if ( ! url ) {
			console.log( `${cardData.name} has no URL` );
			return reject( `${cardData.name} has no URL` );
		}
		console.log( `${cardData.name}: Getting OGS` );
		try {
		ogs( { url }, ( err, { data } = {} ) => {
			if ( err ) {
				console.log( err );
				return reject( err );
			}
			if ( ! data ) {
				console.log( `${cardData.name}: No OGP data found` )
				return reject( `${cardData.name}: No OGP data found` );
			}
			const { ogTitle: title, ogImage: image } = data;

			if ( !image || ! image.url ) {
				console.log( `${cardData.name}: has no og:image` );
			} else {
				console.log( `${cardData.name}: Will add ${image.url}` );
				addAttachment( cardData.id, { url: image.url } );					
			}
			if ( !title ) {
				console.log( `${cardData.name}: Has no og:title` );
			} else {
				console.log( `${cardData.name}: Will replace title with: ${title}` );
				updateCard( cardData.id, { name: title, desc: url } );
			}
			resolve({});
		} );
	} catch ( e ) {
		reject( e );
	}
	} );
}
function processCards( cards ) {
	let slots = 1, ptr = 0, q = cards.slice();
	function proc() {
		console.log( `Proc: Slots: ${slots}, Ptr: ${ptr}` );
		if ( slots > 0 && ptr < q.length ) {
			slots--;
			try {
				processCard(q[ptr++]).then( (m) => {console.log(`S: ${m}`);slots++; proc() }, (e) => { console.log(`E: ${e}`);slots++; proc() } );
			} catch ( e ) {
				console.error( e );
				slots++;
				setTimeout(proc, 1);
			}
		}
	}
	range(slots).forEach(proc);
}

getLists( process.env.BOARD )
	.then( lists => Promise.all( lists.map( ( { id } ) => getCards( id ) ) ) )
	.then( listCards => flatten( listCards ) )
	.then( cards => cards.filter( card => ! card.idAttachmentCover && getUrl( card.name ) ) )
	.then( cards => {
		console.log( `Got ${cards.length} cards` );
		processCards( cards );
	} )
