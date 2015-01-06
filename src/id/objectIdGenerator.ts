/// <reference path="../../typings/mongodb.d.ts" />

import mongodb = require("mongodb");
import ObjectID = mongodb.ObjectID;
import Identifier = require("../id/identifier");
import IdentityGenerator = require("./identityGenerator");

class ObjectIdGenerator implements IdentityGenerator {

    // TODO: Set cacheHexString on ObjectID? https://github.com/mongodb/js-bson/blob/master/lib/bson/objectid.js

    generate(): Identifier {
        return <Identifier>new ObjectID();
    }

    validate(value: any): boolean {
        return value instanceof ObjectID;
    }

    fromString(text: string): Identifier {
        return <Identifier>ObjectID.createFromHexString(text);
    }

    areEqual(a: Identifier, b: Identifier): boolean {
        return (<any>a).equals(b);
    }
}

export = ObjectIdGenerator;