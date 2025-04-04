import mongoose, { Model, Document } from 'mongoose';

class Mongo {

    private static connected: boolean = false;
    private connectionString: string;
    private name: string;
    private MatModel?: any;

    constructor(connectionString: string, name: string) {
        this.connectionString = connectionString;
        this.name = name;
    }

    async init() {
        if (!this.connectionString) return;
        if (!Mongo.connected) {
            console.log('Connecting to MongoDB using ' + this.connectionString);
            Mongo.connected = true;
            try {
              await mongoose.connect(this.connectionString);
            } catch(e:any) {
              console.log(JSON.stringify(e));
              throw new Error(`Cannot connect to MongoDB using ${this.connectionString}`);
            }
            console.log("Connected to MongoDB");
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
                            apiType: { type: String, required: false, default: 'legacy' },
                        }));
                        break;
                    case 'tesla_accounts':
                        this.MatModel = mongoose.model('tesla_accounts', new mongoose.Schema({
                            _id: { type: String, required: true }, // Explicitly setting _id type to String
                            refreshToken: { type: String, required: true },
                            accessToken: { type: String, required: false },
                            email: { type: String, required: true },
                        }));
                        break;
                    case 'fusionsolar':
                        this.MatModel = mongoose.model('fusionsolar', new mongoose.Schema({
                            _id: { type: String, required: true }, // Explicitly setting _id type to String
                            cookies: {type: Object, required: true},
                            roarand: {type: String, required: true},
                        }));
                        break;
                    case 'audit':
                        this.MatModel = mongoose.model('audit', new mongoose.Schema({
                            _id: { type: String, required: true }, // Explicitly setting _id type to String
                            VIN: { type: String, required: true },
                            timestamp: { type: Date, default: Date.now },
                            action: { type: String, required: false },
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