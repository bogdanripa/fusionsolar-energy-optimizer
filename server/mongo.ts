import mongoose, { Model, Document } from 'mongoose';

type TeslaType = { 
    _id: string;
    pos?: object;
    charge_port_door_open?: boolean;
    charging_state?: string;
    apiType?: string;
};

type TeslaAccount = { 
    _id: string;
    refreshToken: string;
    accessToken?: string;
    email: string;
};

type FusionSolarType = { 
    _id: string;
    cookies: object;
    roarand: string;
};

type AuditType = { 
    _id: string;
    VIN: string;
    timestamp?: Date;
    action?: string;
};

const TeslaSchema = new mongoose.Schema<TeslaType>({
    _id: { type: String, required: false },
    pos: { type: Object, required: false },
    charge_port_door_open: { type: Boolean, required: false },
    charging_state: { type: String, required: false },
    apiType: { type: String, required: false, default: 'legacy' },
});

const TeslaAccountSchema = new mongoose.Schema<TeslaAccount>({
    _id: { type: String, required: false },
    refreshToken: { type: String, required: true },
    accessToken: { type: String, required: false },
    email: { type: String, required: true },
});

const FusionSolarSchema = new mongoose.Schema<FusionSolarType>({
    _id: { type: String, required: false },
    cookies: { type: Object, required: true },
    roarand: { type: String, required: true },
});

const AuditSchema = new mongoose.Schema<AuditType>({
    _id: { type: String, required: false },
    VIN: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    action: { type: String, required: false },
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
            default:
                throw new Error(`Unknown model name: ${name}`);
        }
    }

    async upsert(id: string, args: any) {    
        // Remove null values from args
        for (var key in args) {
        if (args[key] === null || args[key] === undefined)
            delete args[key];
        }
  
        // Use findByIdAndUpdate with upsert option to insert or update the document
        const updatedDocument = await this.MatModel.findByIdAndUpdate(
            id,
            { $set: args }, // Only update fields present in args
            {
                new: true, // Return the modified document rather than the original
                upsert: true, // Insert a new document if one doesn't exist with the given ID
                runValidators: true, // Ensure the update adheres to the schema
            }
        );

        return updatedDocument; // Optionally return the updated document
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

    async waitForConnection(timeoutMs = 10000) {
        const start = Date.now();
        while (mongoose.connection.readyState !== 1) {
            console.log(`Mongo connection is ${mongoose.connection.readyState}, waiting...`);
            if (Date.now() - start > timeoutMs) {
                throw new Error('MongoDB connection timeout');
            }
            await new Promise(res => setTimeout(res, 500));
        }
        console.log('MongoDB connection established.');
    }

    async getAll() {
        await this.waitForConnection();
        const docs = await this.MatModel.find({});
        return docs;
    }

    async deleteMany() {
        await this.MatModel.deleteMany();
    }
}

export default Mongo;