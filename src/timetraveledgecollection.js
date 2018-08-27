/*
 * ===========================
 * timetraveledgecollection.js 02.08.18 17:33
 * Kevin 'Extremo' Sekin
 * Copyright (c) 2018
 * ===========================
 */

const GenericTimeCollection = require('./generictimecollection');

class TimeTravelEdgeCollection extends GenericTimeCollection {
	
	/**
	 * Establishes the TimeTravelEdgeCollection
	 * @param {ArangoDatabase} db The arangoDB db constant to access arangoDB
	 * @param {string} name The name of the collection
	 * @param {Object} settings The settings related to the timetravel collection
	 */
	constructor(db, name, settings) {
		super(db, name, settings);
	}
	
	/**
	 * Inserts a new edge into the timetraveledge collection
	 * @param {Object} object The extra data of the edge
	 * @param {Object} options The options related to the insertion
	 */
	insert(object, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (object !== Object(object)) {
			throw new Error('[TimeTravel] insert received non-object as first parameter (object)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] insert received non-object as second parameter (options)');
		}
		if (typeof object._key === 'string') {
			object.id = object._key;
			delete object._key;
		}
		if (typeof object._id === 'string') {
			object.id = object._id.split('/')[1];
			delete object._id;
		}
		if (typeof object.id !== 'string') {
			throw new Error('[TimeTravel] Attempted to insert edge without id, _id or _key value');
		}
		if (typeof object._from !== 'string') {
			throw new Error('[TimeTravel] Attempted to insert edge without _from value');
		}
		if (typeof object._to !== 'string') {
			throw new Error('[TimeTravel] Attempted to insert edge without _to value');
		}
		/**
		 * Begin of actual method
		 */
		// Check if the edge already exists
		if (this.exists(object.id)) {
			// And redirect to update if it already does
			this.update(object.id, object, options);
		} else {
			this.db._executeTransaction({
				collections: {
					write: [this.name]
				},
				action: function({edge, from, to, object, options}) {
					// Import arangoDB database driver
					const db = require('@arangodb').db;
					// Open up the edge collection
					let edgeCollection = db._collection(edge);
					// Establish the current date
					let dateNow = Date.now();
					// Otherwise we need to insert the new edge
					edgeCollection.insert(Object.assign({
						_from: from,
						_to: to,
						createdAt: dateNow,
						expiresAt: 8640000000000000
					}, object), options);
				},
				params: {
					edge: this.name,
					from: object._from + this.settings.proxy.outboundAppendix,
					to: object._to + this.settings.proxy.inboundAppendix,
					object: object,
					options: options
				}
			});
		}
	}
	
	/**
	 * Replaces an edge with a new one, ignoring previous data in the edges
	 * @param {String} handle The handle of the document
	 * @param {Object} object The extra data of the edge
	 * @param {Object} options The options to consider upon replacement
	 */
	replace(handle, object, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (typeof handle !== 'string') {
			throw new Error('[TimeTravel] replace received non-string as first parameter (handle)');
		}
		if (object !== Object(object)) {
			throw new Error('[TimeTravel] insert received non-object as second parameter (object)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] insert received non-object as third parameter (options)');
		}
		if (typeof object._key === 'string') {
			delete object._key;
		}
		if (typeof object._id === 'string') {
			delete object._id;
		}
		object = Object.assign(object, {id: handle});
		if (typeof object.id !== 'string') {
			throw new Error('[TimeTravel] Attempted to insert edge without id, _id or _key value');
		}
		/**
		 * Begin of actual method
		 */
		// Check if the edge already exists
		if (this.exists(object.id)) {
			this.db._executeTransaction({
				collections: {
					write: [this.name]
				},
				action: function({edge, object, options}) {
					// Import arangoDB database driver
					const db = require('@arangodb').db;
					// Open up the edge collection
					let edgeCollection = db._collection(edge);
					// Establish current date
					let dateNow = Date.now();
					// Expire previous edges
					let from = undefined;
					let to = undefined;
					let currentEdges = db._query(aqlQuery`
							FOR vertex IN ${edgeCollection}
							FILTER vertex.id==${object.id} && vertex.expiresAt==8640000000000000
							RETURN vertex
						`).toArray();
					currentEdges.forEach((edge) => {
						edgeCollection.update(edge._key, {expiresAt: dateNow});
						from = edge._from;
						to = edge._to;
					});
					// Insert the new edge
					edgeCollection.insert(Object.assign({
						_from: from,
						_to: to,
						createdAt: dateNow,
						expiresAt: 8640000000000000
					}, object), options);
				},
				params: {
					edge: this.name,
					object: object,
					options: options
				}
			});
		} else {
			// Cannot replace what does not exist! Forward to insert
			this.insert(object, options);
		}
	}
	
	/**
	 * Replaces the edges matched by keys, ignoring previous data in the edges
	 * @param {Array} handles The ids of the edges to replace
	 * @param {Object} object The extra data of the edges
	 * @param {Object} options The options to be considered upon replacement
	 */
	replaceByKeys(handles, object, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (handles.constructor !== Array) {
			throw new Error('[TimeTravel] replaceByKeys received non-array as first parameter (handles)');
		}
		if (object !== Object(object)) {
			throw new Error('[TimeTravel] replaceByKeys received non-object as second parameter (object)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] replaceByKeys received non-object as third parameter (options)');
		}
		/**
		 * Begin of actual method
		 */
			// Fetch all the edges with those handles
		let documents = this.documents(handles);
		documents.forEach((document) => {
			// And redirect each of them to the replace function
			this.replace(document.id, object, options);
		});
	}
	
	/**
	 * Replaces the edges matched by example, ignoring previous data in the edge
	 * @param {Object} example The example to match against the edges
	 * @param {Object} object The new data to replace
	 * @param {Object} options The options to consider upon replacement
	 */
	replaceByExample(example, object, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (example !== Object(example)) {
			throw new Error('[TimeTravel] replaceByExample received non-object as first parameter (example)');
		}
		if (object !== Object(object)) {
			throw new Error('[TimeTravel] replaceByExample received non-object as second parameter (object)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] replaceByExample received non-object as third parameter (options)');
		}
		/**
		 * Begin of actual method
		 */
			// Fetch all the edges by example
		let documents = this.byExample(example);
		documents.forEach((document) => {
			// And redirect each of them to the replace function
			this.replace(document.id, object, options);
		});
	}
	
	/**
	 * Updates the edge with the new data, respecting previous data from the edge
	 * @param {String} handle The handle of the document
	 * @param {Object} object The extra data to merge with the previous
	 * @param {Object} options The options to consider upon updating
	 */
	update(handle, object, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (typeof handle !== 'string') {
			throw new Error('[TimeTravel] replace received non-string as first parameter (handle)');
		}
		if (object !== Object(object)) {
			throw new Error('[TimeTravel] insert received non-object as second parameter (object)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] insert received non-object as third parameter (options)');
		}
		if (typeof object._key === 'string') {
			delete object._key;
		}
		if (typeof object._id === 'string') {
			delete object._id;
		}
		object = Object.assign(object, {id: handle});
		if (typeof object.id !== 'string') {
			throw new Error('[TimeTravel] Attempted to insert edge without id, _id or _key value');
		}
		/**
		 * Begin of actual method
		 */
		// Check if the edge already exists
		if (this.exists(object.id)) {
			this.db._executeTransaction({
				collections: {
					write: [this.name]
				},
				action: function({edge, object, options}) {
					// Import arangoDB database driver
					const db = require('@arangodb').db;
					// Open up the edge collection
					let edgeCollection = db._collection(edge);
					// Establish current date
					let dateNow = Date.now();
					// Build the current version of the edge
					let latestEdge = {createdAt: 0};
					// Expire previous edges
					let currentEdges = db._query(aqlQuery`
							FOR vertex IN ${edgeCollection}
							FILTER vertex.id==${object.id} && vertex.expiresAt==8640000000000000
							RETURN vertex
						`).toArray();
					currentEdges.forEach((edge) => {
						// If the latestEdge was created before the current edge we're looking at
						if (latestEdge.createdAt < edge.createdAt) {
							// Merge the edge with the latest edge
							latestEdge = edge;
						}
						edgeCollection.update(edge._key, {expiresAt: dateNow});
					});
					// Remove unimportant data from latest Edge
					delete latestEdge._key;
					delete latestEdge._rev;
					delete latestEdge._id;
					// Insert the new edge
					edgeCollection.insert(Object.assign(latestEdge, {
						createdAt: dateNow,
						expiresAt: 8640000000000000
					}, object), options);
				},
				params: {
					edge: this.name,
					object: object,
					options: options
				}
			});
		} else {
			// Cannot replace what does not exist! Forward to insert
			this.insert(object, options);
		}
	}
	
	/**
	 * Updates all edges that are matched by keys with the new data, respecting the previous data of the edges
	 * @param {Array} handles The ids to match
	 * @param {Object} object The extra data to merge with the previous data
	 * @param {Object} options The options to consider upon updating
	 */
	updateByKeys(handles, object, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (handles.constructor !== Array) {
			throw new Error('[TimeTravel] updateByKeys received non-array as first parameter (handles)');
		}
		if (object !== Object(object)) {
			throw new Error('[TimeTravel] updateByKeys received non-object as second parameter (object)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] updateByKeys received non-object as third parameter (options)');
		}
		/**
		 * Begin of actual method
		 */
			// Fetch all the edges with those handles
		let documents = this.documents(handles);
		documents.forEach((document) => {
			// And redirect each of them to the update function
			this.update(document.id, object, options);
		});
	}
	
	/**
	 * Updates all edges that match the example, respecting previous data in the edges
	 * @param {Object} example The example to match against
	 * @param {Object} object The extra data to merge with the previous
	 * @param {Object} options The options to consider upon updating
	 */
	updateByExample(example, object, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (example !== Object(example)) {
			throw new Error('[TimeTravel] updateByExample received non-object as first parameter (example)');
		}
		if (object !== Object(object)) {
			throw new Error('[TimeTravel] updateByExample received non-object as second parameter (object)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] updateByExample received non-object as third parameter (options)');
		}
		/**
		 * Begin of actual method
		 */
			// Fetch all the edges by example
		let documents = this.byExample(example);
		documents.forEach((document) => {
			// And redirect each of them to the update function
			this.update(document.id, object, options);
		});
	}
	
	/**
	 * Expires the edge selected by handle
	 * @param {string} handle The id of the edge
	 * @param {Object} options The options to consider upon removal
	 */
	remove(handle, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (typeof handle !== 'string') {
			throw new Error('[TimeTravel] remove received non-string as first parameter (handle)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] remove received non-object as second parameter (options)');
		}
		/**
		 * Begin of actual method
		 */
		/**
		 * Begin of actual method
		 */
		// Check if the edge already exists
		if (this.exists(handle)) {
			this.db._executeTransaction({
				collections: {
					write: [this.name]
				},
				action: function({edge, handle, options}) {
					// Import arangoDB database driver
					const db = require('@arangodb').db;
					// Open up the edge collection
					let edgeCollection = db._collection(edge);
					// Establish current date
					let dateNow = Date.now();
					// Expire all edges
					let currentEdges = db._query(aqlQuery`
							FOR vertex IN ${edgeCollection}
							FILTER vertex.id==${handle} && vertex.expiresAt==8640000000000000
							RETURN vertex
						`).toArray();
					currentEdges.forEach((edge) => {
						edgeCollection.update(edge._key, {expiresAt: dateNow});
					});
				},
				params: {
					edge: this.name,
					handle: handle,
					options: options
				}
			});
		} else {
			// Cannot remove what doesn't exist!
			throw new Error('[TimeTravel] Attempted to remove an edge that does not exist!');
		}
	}
	
	/**
	 * Expires all edges matched by the ids provided
	 * @param {Array} handles The ids to match
	 * @param {Object} options The options to consider upon removal
	 */
	removeByKeys(handles, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (handles.constructor !== Array) {
			throw new Error('[TimeTravel] removeByKeys received non-array as first parameter (handles)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] removeByKeys received non-object as third parameter (options)');
		}
		/**
		 * Begin of actual method
		 */
			// Fetch all the edges with those handles
		let documents = this.documents(handles);
		documents.forEach((document) => {
			// And redirect each of them to the remove function
			this.remove(document.id, options);
		});
	}
	
	/**
	 * Expires all edges matched by the example provided
	 * @param {Object} example The example to match against
	 * @param {Object} options The options to consider upon removal
	 */
	removeByExample(example, options = {}) {
		/**
		 * Section that validates parameters
		 */
		if (example !== Object(example)) {
			throw new Error('[TimeTravel] removeByExample received non-object as first parameter (example)');
		}
		if (options !== Object(options)) {
			throw new Error('[TimeTravel] removeByExample received non-object as third parameter (options)');
		}
		/**
		 * Begin of actual method
		 */
			// Fetch all the edges by example
		let documents = this.byExample(example);
		documents.forEach((document) => {
			// And redirect each of them to the remove function
			this.remove(document.id, options);
		});
	}
	
	/**
	 * Returns all edges matched by the handle to have a history of the edge and its expired counterparts
	 * @param handle The id to match
	 * @returns {Array} The edges
	 */
	history(handle) {
		/**
		 * Section that validates parameters
		 */
		if (typeof handle !== 'string') {
			throw new Error('[TimeTravel] history received non-string as first parameter (handle)');
		}
		/**
		 * Begin of actual method
		 */
		// Let us first check if the handle exists!
		if (this.exists(handle)) {
			// Open the edge collection
			let edgeCollection = this.db._collection(this.name);
			// Return all edges with the handle
			return this.db._query(aqlQuery`
				FOR vertex IN ${edgeCollection}
				FILTER vertex.id == ${handle}
				RETURN vertex
			`).toArray();
		} else {
			throw new Error('[TimeTravel] history received handle that was not found.');
		}
	}
	
	/**
	 * Returns the previous edge or the same edge if no previous was found
	 * @param {string} handle The id of the edge
	 * @param {Object} revision The current edge
	 * @returns The previous edge
	 */
	previous(handle, revision) {
		/**
		 * Section that validates parameters
		 */
		if (typeof handle !== 'string') {
			throw new Error('[TimeTravel] previous received non-string as first parameter (handle)');
		}
		if (revision !== Object(revision)) {
			throw new Error('[TimeTravel] previous received non-object as second parameter (revision)');
		}
		if (!revision.hasOwnProperty('createdAt') && typeof revision.createdAt !== 'number') {
			throw new Error('[TimeTravel] previous received invalid document as second parameter (revision)');
		}
		/**
		 * Begin of actual method
		 */
		// Let us first check if the handle exists!
		if (this.exists(handle)) {
			// Open the edge collection
			let edgeCollection = this.db._collection(this.name);
			// Fetch the vertex that expired when the new one was created to get the previous document
			let document = null;
			try {
				document = this.db._query(aqlQuery`
					FOR vertex IN ${edgeCollection}
					FILTER vertex.expiresAt == ${revision.createdAt} && vertex.id == ${handle}
					RETURN vertex
				`).next();
			} catch (e) {
				return revision;
			}
			if (!document) {
				return revision;
			}
			return document;
		} else {
			throw new Error('[TimeTravel] previous received handle that was not found.');
		}
	}
	
	/**
	 * Returns the next edge or the same edge if no next was found
	 * @param handle The id of the edge
	 * @param revision The current edge
	 * @returns The next edge
	 */
	next(handle, revision) {
		/**
		 * Section that validates parameters
		 */
		if (typeof handle !== 'string') {
			throw new Error('[TimeTravel] next received non-string as first parameter (handle)');
		}
		if (revision !== Object(revision)) {
			throw new Error('[TimeTravel] next received non-object as second parameter (revision)');
		}
		if (!revision.hasOwnProperty('expiresAt') && typeof revision.createdAt !== 'number') {
			throw new Error('[TimeTravel] next received invalid document as second parameter (revision)');
		}
		/**
		 * Begin of actual method
		 */
		// Let us first check if the handle exists!
		if (this.exists(handle)) {
			// Open the edge collection
			let edgeCollection = this.db._collection(this.name);
			// Fetch the vertex that was created when the new one was expired to get the next document
			let document = null;
			try {
				document = this.db._query(aqlQuery`
					FOR vertex IN ${edgeCollection}
					FILTER vertex.createdAt == ${revision.expiresAt} && vertex.id == ${handle}
					RETURN vertex
				`).next();
			} catch (e) {
				return revision;
			}
			if (!document) {
				return revision;
			}
			return document;
		} else {
			throw new Error('[TimeTravel] next received handle that was not found.');
		}
	}
	
	/**
	 * Returns all edges of the handle
	 * @param handle The id of the edges
	 * @returns {Array} The edges
	 */
	// TODO: Make sure these only return non expired edges?
	edges(handle) {
		/**
		 * Section that validates parameters
		 */
		if (typeof handle !== 'string') {
			throw new Error('[TimeTravel] edges received non-string as first parameter (handle)');
		}
		/**
		 * Begin of actual method
		 */
		if (this.exists(handle)) {
			let document = this.document(handle);
			return this.collection.edges(document._key);
		} else {
			throw new Error('[TimeTravel] edges received a handle that could not be found');
		}
	}
	
	/**
	 * Returns all inbound edges of the handle
	 * @param handle The id of the edge
	 * @returns {Array} The inbound edges
	 */
	// TODO: Make sure these only return non expired edges?
	inEdges(handle) {
		/**
		 * Section that validates parameters
		 */
		if (typeof handle !== 'string') {
			throw new Error('[TimeTravel] inEdges received non-string as first parameter (handle)');
		}
		/**
		 * Begin of actual method
		 */
		if (this.exists(handle)) {
			let document = this.document(handle);
			return this.collection.inEdges(document._key);
		} else {
			throw new Error('[TimeTravel] inEdges received a handle that could not be found');
		}
	}
	
	/**
	 * Returns all outbound edges of the handle
	 * @param handle The id of the edge
	 * @returns {Array} The edges
	 */
	// TODO: Make sure these only return non expired edges?
	outEdges(handle) {
		/**
		 * Section that validates parameters
		 */
		if (typeof handle !== 'string') {
			throw new Error('[TimeTravel] outEdges received non-string as first parameter (handle)');
		}
		/**
		 * Begin of actual method
		 */
		if (this.exists(handle)) {
			let document = this.document(handle);
			return this.collection.outEdges(document._key);
		} else {
			throw new Error('[TimeTravel] outEdges received a handle that could not be found');
		}
	}
}

module.exports = TimeTravelEdgeCollection;