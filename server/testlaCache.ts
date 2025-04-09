import protobuf from 'protobufjs';
import { Buffer } from 'buffer';

export default class TeslaCache {
    protoPath: string;
    messageTypeName: string;
    MessageType: protobuf.Type | null = null;
    
    constructor(protoPath: string, messageTypeName: string) {
        this.protoPath = protoPath;
        this.messageTypeName = messageTypeName;
        this.MessageType = null;
    }

    async decodeVehicleData(buffer: Buffer): Promise<any> {
        try {
          // Ensure the proto definition is loaded
          await this.loadProtoDefinition();
          if (!this.MessageType) {
            // Error should have been thrown by loadProtoDefinition, but double-check
            console.error('Message type not available after loading.');
            return null;
          }
      
          // 2. Verify the buffer contains data expected by the message type (optional but good practice)
          const errMsg = this.MessageType.verify(buffer);
          if (errMsg) {
            console.error('Buffer verification failed:', errMsg);
            // Decide if you want to throw an error or return null
            // throw new Error(`Buffer verification failed: ${errMsg}`);
            return null; // Or return null/empty object as appropriate
          }
      
          // 3. Decode the buffer using the loaded message type
          //    This creates a JS object instance representing the message
          const decodedMessage = this.MessageType.decode(buffer);
      
          // Note: .decode does not throw on invalid data, it might return partial data.
          // .verify helps catch structural issues beforehand.
      
          // 4. Optional: Convert to a plain JavaScript object if needed
          const plainObject = this.MessageType.toObject(decodedMessage, {
            longs: String,  // Convert Long objects to strings
            enums: String,  // Convert enum values to strings
            bytes: String,  // Convert bytes to base64 strings
            defaults: true, // Include fields with default values
            arrays: true,   // Copy arrays instead of modifying in-place
            objects: true,  // Copy objects instead of modifying in-place
            oneofs: true    // Include virtual oneof properties
          });
          //find(plainObject, ['number', 'number', 'number', 'number', 'number', 'number', 'number'])
    
          return plainObject; // If you prefer plain objects
      
        } catch (error) {
          console.error('Error decoding protobuf message:', error);
          return null; // Indicate failure
        }
    }

    async loadProtoDefinition() {
        try {
            const root: protobuf.Root = await protobuf.load(this.protoPath);
            // Lookup the specific message type within the loaded definition
            this.MessageType = root.lookupType(this.messageTypeName);
            if (!this.MessageType) {
                throw new Error(`Could not find message type '${this.messageTypeName}' in ${this.protoPath}`);
            }
            console.log('Protobuf definition loaded successfully.');
        } catch (err) {
            console.error('Failed to load protobuf definition:', err);
            throw err; // Re-throw error to indicate failure
        }
    }
}