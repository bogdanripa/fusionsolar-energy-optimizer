import 'dotenv/config';

import TeslaAccount from './teslaAccount.js'
import Tesla from './tesla.js'

let ta = new TeslaAccount('')
console.log("Getting all accounts")
let al = await ta.getAllAccounts()
for (const account of al) {
    console.log("Working with account " + account.email)
    ta = new TeslaAccount(account['_id'])
    const vl = await ta.getVehicleList();
    for (const vehicle of vl) {
        const VIN = vehicle['vin'];
        console.log("Working with vehicle " + VIN)
        let t = new Tesla(VIN, ta)
        try {
            await t.wakeUp();
            await t.cacheVehicleData();
            console.log(VIN + ": Car is " + t.vehicleData.state)
        } catch(e:any) {
            console.log(VIN + ': ' + e.message)
        }
    }
}
