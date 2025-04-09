import 'dotenv/config';
import TeslaAccount from './teslaAccount.js'
import TeslaCache from './testlaCache.js';

let ta = new TeslaAccount('')
let teslaCache = new TeslaCache('protos/vehicle_data.proto', 'TopLevelMessage');
console.log("Getting all accounts")
let al = await ta.getAllAccounts()
for (const account of al) {
    console.log("Working with account " + account.email)
    ta = new TeslaAccount(account['_id'])
    const vl = await ta.getVehicleList();
    for (const vehicle of vl) {
        const VIN = vehicle['vin'];
        const vehicleData = vehicle['cached_data'];
        const vehicleDataBuffer = Buffer.from(vehicleData, 'base64');
        const jsonData = await teslaCache.decodeVehicleData(vehicleDataBuffer);
        console.log("Working with vehicle " + VIN);
        console.log(jsonData)
    }
}