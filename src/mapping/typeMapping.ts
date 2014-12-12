/// <reference path="../../typings/tsreflect.d.ts" />

import reflect = require("tsreflect");
import Property = require("./property");
import PropertyFlags = require("./propertyFlags");
import ChangeTracking = require("./changeTracking");
import Map = require("../map");
import TypeMappingFlags = require("./TypeMappingFlags");
import Index = require("./index");
import CollectionOptions = require("../driver/collectionOptions");
import Configuration = require("../config/Configuration");

class TypeMapping {

    id: number;
    collectionName: string;
    databaseName: string;
    indexes: Index[];
    collectionOptions: CollectionOptions;

    properties: Property[];
    private _propertiesByName: Map<Property>;
    private _propertiesByField: Map<Property>;

    discriminatorField: string;
    discriminatorValue: string;

    private _discriminatorMap: Map<TypeMapping>;

    /**
     * The mapping for the type that is at the root of an inheritance hierarchy.
     */
    rootType: TypeMapping;

    changeTracking: ChangeTracking;

    versioned: boolean;
    versionField: string;

    lockable: boolean;
    lockField: string;

    constructor(public type: reflect.Type, public flags: TypeMappingFlags) {

        this.id = type.getId();
    }

    get isEmbeddedType(): boolean {
        return (this.flags & TypeMappingFlags.EmbeddedType) !== 0;
    }

    get isDocumentType(): boolean {
        return (this.flags & TypeMappingFlags.DocumentType) !== 0;
    }

    get isRootType(): boolean {
        return (this.flags & TypeMappingFlags.RootType) !== 0;
    }

    addIndex(index: Index): void {

        if(!this.isRootType) {
            this.rootType.addIndex(index);
            return;
        }

        if(!this.indexes) {
            this.indexes = [];
        }
        this.indexes.push(index);
    }

    addProperty(property: Property): void {

        if(!this.properties) {
            this.properties = [];
            this._propertiesByName = {};
            this._propertiesByField = {};
        }

        var name = property.name;
        if(Map.hasProperty(this._propertiesByName, name)) {
            throw new Error("There is already a mapped property with the name '" + name + "'.");
        }
        this._propertiesByName[name] = property;

        if(Map.hasProperty(this._propertiesByField, property.field)) {
            throw new Error("There is already a mapped property for field '" + property.field + "'.");
        }
        this._propertiesByField[property.field] = property;

        this.properties.push(property);
    }

    setDiscriminatorValue(value: string): void {

        this.discriminatorValue = value;
        this.rootType.addDiscriminatorMapping(value, this);
    }

    getMappingByDiscriminator(value: string): TypeMapping {

        return Map.getProperty(this.rootType._discriminatorMap, value);
    }

    addDiscriminatorMapping(value: string, mapping: TypeMapping): void {

        if(!this._discriminatorMap) {
            this._discriminatorMap = {};
        }

        if(Map.hasProperty(this._discriminatorMap, value)) {
            throw new Error("There is already a class with a discriminator value of '" + value + "'.");
        }

        this._discriminatorMap[value] = mapping;
    }

    getProperty(name: string): Property {

        return Map.getProperty(this._propertiesByName, name);
    }

    getPropertyForField(field: string): Property {

        return Map.getProperty(this._propertiesByField, field);
    }

    getProperties(flags?: PropertyFlags): Property[] {

        if(!flags) {
            return this.properties;
        }

        // TODO: cache search results

        var ret: Property[] = [];
        var properties = this.properties;
        for(var i = 0, l = properties.length; i < l; i++) {
            var property = properties[i];
            if((property.flags & flags) !== 0) {
                ret.push(property)
            }
        }
        return ret;
    }

    /**
     * Adds default mapping values to TypeMapping. Called by MappingProvider after TypeMapping is created.
     * @param config The configuration.
     */
    addDefaultMappings(config: Configuration): void {

        if(this.isDocumentType) {
            // defaults for root type
            if (this.isRootType) {
                // TODO: global configuration for defaults

                if (!this.discriminatorField) {
                    this.discriminatorField = "__t";
                }

                if (!this.lockField) {
                    this.lockField = "__l";
                }

                if (!this.versionField) {
                    this.versionField = "__v";
                }

                if (!this.changeTracking) {
                    this.changeTracking = ChangeTracking.DeferredImplicit;
                }

                if (!this.collectionName) {
                    // TODO: configurable naming strategy for when name is not specified?
                    this.collectionName = this.type.getName();
                }
            }
            else {
                // inherit values from root type
                this.discriminatorField = this.rootType.discriminatorField;
            }

            // if we are a document type and the the discriminatorValue is not set, default to the class name
            if (!this.discriminatorValue) {
                // TODO: configurable naming strategy for when discriminator field is not specified?
                this.setDiscriminatorValue(this.type.getName());
            }
        }
    }
}

export = TypeMapping;