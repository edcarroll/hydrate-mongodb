/// <reference path="../typings/async.d.ts" />
/// <reference path="../typings/tsreflect.d.ts" />

import reflect = require("tsreflect");
import async = require("async");
import ObjectId = require("./driver/objectId");
import Map = require("./map");
import Callback = require("./callback");
import Connection = require("./driver/connection");
import MappingRegistry = require("./mapping/mappingRegistry");
import Constructor = require("./constructor");
import ChangeTracking = require("./mapping/changeTracking");
import PropertyFlags = require("./mapping/propertyFlags");
import TypeMapping = require("./mapping/typeMapping");
import ResultCallback = require("./resultCallback");

enum ObjectState {

    Managed,
    New,
    Detached,
    Removed
}

class UnitOfWork {

    private _objectStates: Map<ObjectState> = {};
    private _identityMap: Map<any> = {};
    private _originalDocuments: Map<any> = {};

    private _scheduledUpdates: Map<any> = {};
    private _scheduledDeletions: Map<any> = {};
    private _scheduledInsertions: Map<any> = {};
    private _scheduledDirtyCheck: Map<any> = {};

    private _connection: Connection;
    private _mappingRegistry: MappingRegistry;

    constructor(connection: Connection, mappingRegistry: MappingRegistry) {

        this._connection = connection;
        this._mappingRegistry = mappingRegistry;
    }

    save (obj: any): void {

        var mapping = this._mappingRegistry.getMappingForObject(obj);
        if(!mapping) {
            throw new Error("Object is not mapped as a document type.");
        }

        var state = this._getObjectState(obj);
        switch(state) {
            case ObjectState.Managed:
                if(mapping.changeTracking == ChangeTracking.DeferredExplicit) {
                    this._scheduleDirtyCheck(obj);
                }
                break;
            case ObjectState.New:
                // TODO: what if object already has an ID?
                obj._id = this._connection.driver.createObjectId();
                this._scheduleInsert(obj);
                break;
            case ObjectState.Detached:
                throw new Error("Cannot save a detached object.");
                break;
            case ObjectState.Removed:
                throw new Error("Cannot save a removed object.");
                break;
            default:
                throw new Error("Invalid object state '" + state + "'.");
        }
    }

    remove (obj: any): void {

        var mapping = this._mappingRegistry.getMappingForObject(obj);
        if(!mapping) {
            throw new Error("Object is not mapped as a document type.");
        }

        var state = this._getObjectState(obj);
        switch(state) {
            case ObjectState.New:
            case ObjectState.Removed:
                // nothing to do
                break;
            case ObjectState.Managed:
                // TODO: call lifecycle callbacks
                this._scheduleDelete(obj);
                break;
            case ObjectState.Detached:
                throw new Error("Cannot remove a detached object.");
                break;
            default:
                throw new Error("Invalid object state '" + state + "'.");
        }
    }

    find(id: ObjectId, callback: ResultCallback<any>): void {

    }

    load(document: any, callback: ResultCallback<any>): void {

        var id = this._getObjectId(document);
        if(!id) {
            process.nextTick(() => callback(new Error("Document missing primary key.")));
            return;
        }

        var obj = Map.getProperty(this._identityMap, id);
        if(obj) {
            process.nextTick(() => callback(null ,obj));
            return;
        }

        // deserialize object
    }

    flush (callback?: Callback): void {

    }

    private _computeChangeSets(): void {

        for(var id in this._identityMap) {
            if(this._identityMap.hasOwnProperty(id)) {

                var obj = this._identityMap[id];
                var mapping = this._mappingRegistry.getMappingForObject(obj);

                if(mapping.changeTracking == ChangeTracking.DeferredImplicit || this._scheduledDirtyCheck[id]) {

                    if(this._objectStates[id] == ObjectState.Managed && !this._scheduledInsertions[id]) {

                        //this._computeChangeSet(mapping, obj);
                    }
                }
            }
        }
    }

    private _scheduleDirtyCheck(obj: any): void {

        var id = this._getObjectId(obj);
        this._scheduledDirtyCheck[id] = obj;
    }

    private _scheduleInsert(obj: any): void {

        var id = this._getObjectId(obj);

        if(Map.hasProperty(this._scheduledUpdates, id)) {
            throw new Error("Dirty object cannot be scheduled for insertion.");
        }

        if(Map.hasProperty(this._scheduledDeletions, id)) {
            throw new Error("Removed object cannot be scheduled for insertion.");
        }

        if(Map.hasProperty(this._scheduledInsertions, id)) {
            throw new Error("Object is already scheduled for insertion.");
        }

        this._scheduledInsertions[id] = obj;
        this._addToIdentityMap(obj, id);
    }

    // TODO: remove this function?
    private _scheduleUpdate(obj: any): void {

        var id = this._getObjectId(obj);
        if(!id) {
            throw new Error("Object missing identifier.");
        }

        if(Map.hasProperty(this._scheduledDeletions, id)) {
            throw new Error("Removed object cannot be scheduled for update.");
        }

        if(!Map.hasProperty(this._scheduledInsertions, id)) {
            this._scheduledUpdates[id] = obj;
        }
    }

    private _scheduleDelete(obj: any): void {

        var id = this._getObjectId(obj);

        if(Map.hasProperty(this._scheduledInsertions, id)) {
            this._removeFromIdentityMap(id);
            delete this._scheduledInsertions[id];
            return;
        }

        if(!Map.hasProperty(this._identityMap, id)) {
            return;
        }

        this._removeFromIdentityMap(id);
        this._objectStates[id] = ObjectState.Removed;

        delete this._scheduledUpdates[id];
        this._scheduledDeletions[id] = obj;
    }

    private _addToIdentityMap(obj: any, id: string): boolean {

        if(Map.hasProperty(this._identityMap, id)) {
            return false;
        }

        this._identityMap[id] = obj;
        this._objectStates[id] = ObjectState.Managed;

        // TODO: attach event listener/observable
        return true;
    }

    private _removeFromIdentityMap(id: string): boolean {

        if(!Map.hasProperty(this._identityMap, id)) {
            return false;
        }

        delete this._identityMap[id];
        this._objectStates[id] = ObjectState.Detached;

        // TODO: remove event listener/observable
        return true;
    }

    private _getObjectState(obj: any): ObjectState {

        var id = this._getObjectId(obj);
        if(id === undefined) {
            return ObjectState.New;
        }

        if(Map.hasProperty(this._objectStates, id)) {
            return this._objectStates[id];
        }

        // TODO: how to handle unknown state

        return ObjectState.Detached;
    }

    private _getObjectId(obj: any): string {

        var id = <ObjectId>obj._id;
        if(id !== undefined) {
            return id.toHexString();
        }
    }
}

export = UnitOfWork;