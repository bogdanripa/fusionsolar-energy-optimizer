import mongoose, { Model, Document } from 'mongoose';

class Mongo {

    private static connected: boolean = false;
    private MONGO_DB_URI: string;
    private name: string;
    private MatModel?: any;

    constructor(MONGO_DB_URI: string, name: string) {
        this.MONGO_DB_URI = MONGO_DB_URI;
        this.name = name;
    }

    async init() {
        if (!this.MONGO_DB_URI) return;
        if (!Mongo.connected) {
            Mongo.connected = true;
            await mongoose.connect(this.MONGO_DB_URI);
        }

        if (!this.MatModel) {
            if (mongoose.models[this.name]) {
                this.MatModel = mongoose.models[this.name]
            } else {
                switch(this.name) {
                    case 'tesla':
                        this.MatModel = mongoose.model('tesla', new mongoose.Schema({
                            _id: { type: String, required: true }, // Explicitly setting _id type to String
                            pos: { type: Object, required: false },
                            charge_port_door_open: { type: Boolean, required: false },
                            charging_state: {type: String, required: false},
                        }));
                        break;
                    case 'tesla_accounts':
                        this.MatModel = mongoose.model('tesla_accounts', new mongoose.Schema({
                            _id: { type: String, required: true }, // Explicitly setting _id type to String
                            refreshToken: { type: String, required: true },
                            accessToken: { type: String, required: false }
                        }));
                        break;
                    case 'fusionsolar':
                        this.MatModel = mongoose.model('fusionsolar', new mongoose.Schema({
                            _id: { type: String, required: true }, // Explicitly setting _id type to String
                            cookies: {type: Object, required: true},
                            roarand: {type: String, required: true},
                        }));
                        break;
                }
            }
        }
    }

    async upsert(id: string, args: any) {
        // Ensure initialization of MongoDB connection
        await this.init(); // Wait for the MongoDB connection to be initialized
    
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
        await this.init(); // Ensure the MongoDB connection is initialized
  
        const doc = await this.MatModel.findById(id);
        if (!doc) {
            // Handle the case where the document does not exist
            console.log(`No document found with ID ${id}`);
            return null;
        }
        return doc;
    }

    async getAll() {
        await this.init();
        const docs = await this.MatModel.find({});
        return docs;
    }

    async deleteMany() {
        await this.init();
        await this.MatModel.deleteMany();
    }
}

export default Mongo;