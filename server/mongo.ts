import mongoose, { Model, Document } from 'mongoose';

type TeslaType = { 
    _id: string;
    pos: {
        lat: number;
        long: number;
    };
    state: string;
    api_type?: string;
    last_update: Date;
    charge_state: {
        charge_port_door_open: boolean;
        battery_level: number;
        charging_state: string;
        charge_limit_soc: number;
        charge_amps: number;
        charge_current_request_max: number;
    }
};

type TeslaAccount = { 
    _id: string;
    refreshToken: string;
    accessToken?: string;
    email: string;
    last_update: Date;
};

type FusionSolarType = { 
    _id: string;
    cookies: object;
    roarand: string;
    last_update: Date;
};

type AuditType = { 
    _id: string;
    VIN: string;
    action?: string;
    last_update: Date;
};

type CachedVehicleData = {
    _id: string;
    VIN: string;
    vehicleData: object;
    last_update: Date;
}

const TeslaSchema = new mongoose.Schema<TeslaType>({
    _id: { type: String, required: true },
    api_type: { type: String, required: false, default: 'legacy' },
    last_update: { type: Date, default: Date.now },
    state: { type: String, required: true, default: 'unknown' },
    pos: {
        lat: { type: Number, required: true },
        long: { type: Number, required: true },
    },
    charge_state: {
        charge_port_door_open: { type: Boolean, required: true },
        battery_level: { type: Number, required: true },
        charging_state: { type: String, required: true },
        charge_limit_soc: { type: Number, required: true },
        charge_amps: { type: Number, required: true },
        charge_current_request_max: { type: Number, required: true },
    }
});

const TeslaAccountSchema = new mongoose.Schema<TeslaAccount>({
    _id: { type: String, required: true },
    refreshToken: { type: String, required: true },
    accessToken: { type: String, required: false },
    email: { type: String, required: true },
    last_update: { type: Date, default: Date.now },
});

const FusionSolarSchema = new mongoose.Schema<FusionSolarType>({
    _id: { type: String, required: true },
    cookies: { type: Object, required: true },
    roarand: { type: String, required: true },
    last_update: { type: Date, default: Date.now },
});

const AuditSchema = new mongoose.Schema<AuditType>({
    _id: { type: String, required: true },
    VIN: { type: String, required: true },
    action: { type: String, required: false },
    last_update: { type: Date, default: Date.now },
});

const CachedVehicleDataSchema = new mongoose.Schema<CachedVehicleData>({
    _id: { type: String, required: true },
    VIN: { type: String, required: true },
    vehicleData: { type: Object, required: true },
    last_update: { type: Date, default: Date.now },
});

class Mongo {
    private static connected: boolean = false;
    private MatModel?: any;

    constructor(name: string) {
        if (!Mongo.connected) {
            Mongo.connected = true;
            console.log(`MongoDB (${name}) not connected yet, initializing connection...`);
            mongoose.connect(process.env.FUSIONSOLAR_DATABASE_URL || '');
            console.log(`MongoDB (${name}) connection initialized.`);
        } else {
            console.log(`MongoDB (${name}): someone else initiated the connection`);
        }

        switch (name) {
            case 'tesla':
                this.MatModel = mongoose.model<TeslaType>('tesla', TeslaSchema);
                break;
            case 'tesla_accounts':
                this.MatModel = mongoose.model<TeslaAccount>('tesla_accounts', TeslaAccountSchema);
                break;
            case 'fusionsolar':
                this.MatModel = mongoose.model<FusionSolarType>('fusionsolar', FusionSolarSchema);
                break;
            case 'audit':
                this.MatModel = mongoose.model<AuditType>('audit', AuditSchema);
                break;
            case 'cached_vehicle_data':
                this.MatModel = mongoose.model<CachedVehicleData>('cached_vehicle_data', CachedVehicleDataSchema);
                break;
            default:
                throw new Error(`Unknown model name: ${name}`);
        }
    }

    async upsert(id: string | undefined, args: any) {    
        // Remove null values from args
        for (var key in args) {
        if (args[key] === null || args[key] === undefined)
            delete args[key];
        }
        args.last_update = new Date(); // Update the last_update field
  
        if (!id) {
            id = new mongoose.Types.ObjectId().toString(); // Generate a new ID if not provided
        }
        
        // Use findByIdAndUpdate with upsert option to insert or update the document
        return await this.MatModel.findByIdAndUpdate(
            id,
            { $set: args }, // Only update fields present in args
            {
                new: true, // Return the modified document rather than the original
                upsert: true, // Insert a new document if one doesn't exist with the given ID
                runValidators: true, // Ensure the update adheres to the schema
            }
        );
    }
  
    async getById(id: string) {
        const doc = await this.MatModel.findById(id);
        if (!doc) {
            // Handle the case where the document does not exist
            console.log(`No document found with ID ${id}`);
            return null;
        }
        return doc;
    }

    // stateToString = {
    //     0: 'Disconnected',
    //     1: 'Connected',
    //     2: 'Connecting',
    //     3: 'Disconnecting',
    // };  
    // async waitForConnection(timeoutMs = 10000) {
    //     const start = Date.now();
    //     while (mongoose.connection.readyState !== 1) {
    //         console.log(`Mongo connection is ${stateToString[mongoose.connection.readyState as keyof typeof stateToString]}, waiting...`);
    //         if (Date.now() - start > timeoutMs) {
    //             throw new Error('MongoDB connection timeout');
    //         }
    //         await new Promise(res => setTimeout(res, 500));
    //     }
    //     console.log('MongoDB connection established.');
    // }

    async getAll() {
        //await this.waitForConnection();
        const docs = await this.MatModel.find({});
        return docs;
    }

    async deleteMany() {
        await this.MatModel.deleteMany();
    }
}

export default Mongo;