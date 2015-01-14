/// <reference path="../../typings/async.d.ts" />

import async = require("async");
import util = require("util");

import Callback = require("../core/callback");
import ResultCallback = require("../core/resultCallback");

import Map = require("../core/map");
import SessionFactory = require("../sessionFactory");
import SessionFactoryImpl = require("../sessionFactoryImpl");
import DatabaseDriver = require("../driver/databaseDriver");
import MongoDriver = require("../driver/mongoDriver");
import Connection = require("../driver/connection");
import Collection = require("../driver/collection");
import Table = require("../core/table");
import Mapping = require("../mapping/mapping");
import MappingFlags = require("../mapping/mappingFlags");
import MappingRegistry = require("../mapping/mappingRegistry");
import MappingProvider = require("../mapping/providers/mappingProvider");
import AnnotationMappingProvider = require("../mapping/providers/annotationMappingProvider");
import ConfigurationOptions = require("./configurationOptions");
import IdentityGenerator = require("../id/identityGenerator");
import EntityMapping = require("../mapping/entityMapping");

class Configuration {

    private _mappingProvider: AnnotationMappingProvider;
    private _options: ConfigurationOptions;
    private _optionsProcessed: boolean;
    private _driver: DatabaseDriver;

    identityGenerator: IdentityGenerator;

    constructor(options?: ConfigurationOptions) {

        this._options = options;
        this._driver = new MongoDriver();
        this._mappingProvider = new AnnotationMappingProvider(this);
        this.identityGenerator = this._driver.defaultIdentityGenerator();
    }

    addDeclarationFile(path: string): void {

        this._mappingProvider.addFile(path);
    }

    createSessionFactory(callback: ResultCallback<SessionFactory>): void;
    createSessionFactory(connection: Connection, callback: ResultCallback<SessionFactory>): void;
    createSessionFactory(connectionOrCallback: any, callback?: ResultCallback<SessionFactory>): void {

        if(typeof connectionOrCallback === "function") {
            callback = connectionOrCallback;

            if(!this._options.uri) {
                var error = new Error("A database connection must be passed to createSessionFactory or a connection URI should be specified in the configuration options.");
            }
            if(typeof this._options.uri !== "string") {
                var error = new Error("Connection URI expected to be of type string.");
            }
            if(error) return callback(error, null);

            // TODO: tell mongodb not to generate objectid. all ids should come from us.

            this._driver.connect(this._options.uri, this._options.connectionOptions || {}, (err, connection) => {
                if(err) return callback(err);
                this._createFactory(connection, callback);
            });
        }
        else {
            this._createFactory(connectionOrCallback, callback);
        }
    }

    private _createFactory(connection: Connection, callback: ResultCallback<SessionFactory>): void {

        // wait to until now to process options so any errors can be passed to callback instead of raised in constructor
        if(!this._optionsProcessed) {
            this._optionsProcessed = true;

            var files = this._options && this._options.declarationFiles;
            if(files) {
                if(!Array.isArray(files)) {
                    return callback(new Error("Expected declarationFiles to be of type array."));
                }

                for (var i = 0, l = files.length; i < l; i++) {
                    this.addDeclarationFile(files[i]);
                }
            }
        }

        this._mappingProvider.getMapping((err, registry) => {
            if(err) return callback(err);

            this._buildCollections(connection, registry, (err, collections) => {
                if(err) return callback(err);

                var sessionFactoryImpl = new SessionFactoryImpl(collections, registry);
                callback(null, sessionFactoryImpl);
            });
        });
    }

    private _buildCollections(connection: Connection, registry: MappingRegistry, callback: ResultCallback<Table<Collection>>): void {

        // Get all the collections and make sure they exit. We can also use this as a chance to build the
        // collection if it does not exist.
        var collections: Table<Collection> = [];
        var names: Map<boolean> = {};

        async.each(registry.getEntityMappings(), (mapping: EntityMapping, callback: (err?: Error) => void) => {

            if(!(mapping.flags & MappingFlags.InheritanceRoot)) return done();

            // make sure we have a collection name
            if (!mapping.collectionName) {
                return done(new Error("Missing collection name on mapping for type '" + mapping.name + "'."));
            }

            // make sure db/collection is not mapped to some other type.
            var key = [(mapping.databaseName || connection.db.databaseName), "/", mapping.collectionName].join("");
            if (Map.hasProperty(names, key)) {
                return done(new Error("Duplicate collection name '" + key + "' on type '" + mapping.name + "' ."));
            }
            names[key] = true;

            // change current database if a databaseName was specified in the mapping
            var db = connection.db;
            if(mapping.databaseName && mapping.databaseName !== connection.db.databaseName) {
                db = db.db(mapping.databaseName);
            }

            db.collectionNames(mapping.collectionName, null, (err: Error, names: string[]): void => {
                if(err) return done(err);

                if(names.length == 0) {
                    // collection does not exist, create it
                    db.createCollection(mapping.collectionName, mapping.collectionOptions || {}, (err, collection) => {
                        if(err) return done(err);
                        collections[mapping.id] = collection;
                        // TODO: create indexes for newly created collection
                        done();
                    });
                }
                else {
                    // collection exists, get it
                    db.collection(mapping.collectionName, { strict: true }, (err: Error, collection: Collection) => {
                        if(err) return done(err);
                        collections[mapping.id] = collection;
                        done();
                    });
                }

            });

            function done(err?: Error): void {
                process.nextTick(() => {
                    callback(err);
                });
            }
        }, (err) => {
            if(err) return callback(err);
            callback(null, collections);
        });
    }
}

export = Configuration;