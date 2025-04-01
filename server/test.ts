import 'dotenv/config';
import TeslaAccount from './teslaAccount.js'
import Tesla from './tesla.js'

async function test(): Promise<string> {
    // Simulate some asynchronous operation, replace with your bogus logic
    await new Promise((resolve) => setTimeout(() => resolve('test'), 1));
    return 'test';
  }
  

test().then(async () => {
    let ta = new TeslaAccount('')
    ta.setMongoDBUri(process.env.MONGO_DB_URI)
    let al = await ta.getAllAccounts()
    for (const account of al) {
        ta = new TeslaAccount(account['_id'])
        ta.setMongoDBUri(process.env.MONGO_DB_URI)
        let vl;
        try {
            vl = await ta.getVehicleList();
        } catch(e:any) {
            console.log("Error getting vehicle list for account " + account['_id'])
            console.log(e.message)
            continue;
        }
        for (const vin of vl) {
            let t = new Tesla(vin, account)
            t.setMongoDBUri(process.env.MONGO_DB_URI)
            console.log(t.VIN);
            // await t.wakeUp();
            // await t.flashLights();
            // await t.setLock(false);
        }
    }   
})


/*
import {fusionsolar} from './fusionsolar.js'
import Tesla from './tesla.js'

fusionsolar.setCredentials(process.env.fusionsolarCredentialsUser, process.env.fusionsolarCredentialsPassword)
fusionsolar.setMongoDBUri(process.env.MONGO_DB_URI)

console.log("Gettling stations list")
fusionsolar.getStationsList().then((sl: any) => {
    for (const s of sl) {
        console.log(s.name + " is " + s.latitude + " " + s.longitude);
    }


    let t:Tesla = new Tesla()
    t.setVIN('code')
    t.setMongoDBUri(process.env.MONGO_DB_URI)
    t.setRefreshToken('vin')
});

/*
var t = new Tesla();

t.getVehicleList().then(async (vl: any) => {
    console.log(vl)

    t.setVIN(vl[0])
    t.setMongoDBUri(process.env.MONGO_DB_URI)
    await t.wakeUp();
    await t.cacheVehicleData(true);
    var pos = await t.getPosition();
    console.log(pos)
        
    var chargePortOpen = await t.isChargePortOpen()
    console.log(chargePortOpen)
});

*/


// https://auth.tesla.com/oauth2/v3/authorize?&client_id=2bed662ba551-4570-b3a0-c48d0fdd7ed8&locale=en-US&prompt=login&redirect_uri=https://v3nbfm65nmaem2b5axu2b7vgte0qcmxg.lambda-url.us-east-1.on.aws/FusionsolarEnergyOptimizer/redirect&response_type=code&scope=openid%20vehicle_device_data%20offline_access&state=1234
