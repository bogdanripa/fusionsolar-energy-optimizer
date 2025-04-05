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
    for (const vin of vl) {
        console.log("Working with vehicle " + vin)
        let t = new Tesla(vin, ta)
        await t.wakeUp();
    }
}
