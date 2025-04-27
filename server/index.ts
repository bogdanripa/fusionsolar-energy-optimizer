import { GenezioDeploy, GenezioMethod } from "@genezio/types";
import { GenezioHttpResponse, GenezioHttpRequest } from "@genezio/types";

import TeslaAccount from './teslaAccount.js'
import Tesla from './tesla.js'
import Mongo from './mongo.js'
import TeslaCache from './testlaCache.js';

let config:any;
import FusionSolar from './fusionsolar.js'

import('./config.json').then((cfg) => {
    config = cfg;
})

type TeslaMap = { [key: string]: Tesla };
let teslas:TeslaMap = {};

interface Station {
    sqDistance: number,
    name: string,
    dn: string
}

@GenezioDeploy({timeout: 300})
export class FusionsolarEnergyOptimizer {
    fusionsolar: FusionSolar;
    constructor() {
        console.log("Constructor called!")
        this.fusionsolar = new FusionSolar(process.env.fusionsolarCredentialsUser, process.env.fusionsolarCredentialsPassword)
    }

    async #optimize(VIN:string, account:TeslaAccount) {
        console.log(VIN + ': optimizing');
        if (!teslas[VIN]) {
            teslas[VIN] = new Tesla(VIN, account)
        }

        // wake up every 2 hours
        var date = new Date();
        if (date.getHours() % 2 == 0 && date.getMinutes() < 5) {
            await teslas[VIN].wakeUp();
        }

        var chargePortOpen = await teslas[VIN].isChargePortOpen()
        if (!chargePortOpen) {
            console.log(VIN + ": charge port is closed")
            return
        }
        var pos = await teslas[VIN].getCachedPosition();
        console.log(VIN + ": is at " + pos.latitude + ", " + pos.longitude)
        
        var sList = await this.fusionsolar.getStationsList();
        let closestStation: Station | undefined = undefined;

        for (const station of sList) {
            station.sqDistance = Math.abs(station.latitude - pos.latitude) * Math.abs(station.longitude - pos.longitude);
            
            //console.log(station.name + ": " + station.latitude + ", " + station.longitude)
            
            if (station.sqDistance < 0.001) {
                if (closestStation === undefined) closestStation = station;
                else {
                    if (station.sqDistance < closestStation.sqDistance) {
                        closestStation = station;
                    }
                }    
            }
        }
        if (closestStation !== undefined) {
            // car is here
            console.log(VIN + ": closest to " + closestStation.name)
            var fusion = await this.fusionsolar.getRealTimeDetails(closestStation.dn)
            console.log(closestStation.name + ": solar production is " + fusion.producing + ", using " + fusion.using);
            fusion.producing -= config.usedWatts.upperLimit;
            var cs = await teslas[VIN].getChargeState();
            var cl = await teslas[VIN].getChargeLimit();
            var amps
            var diff = cs == 'Charging'?config.usedWatts.incrementalAmp:config.usedWatts.startAmp;
            console.log(VIN + ": car is " + cs + ", target: " + cl + "%");

            if (cl != 100 && cs != 'Disconnected' && cs != 'Complete') {
                
                if (fusion.using + diff < fusion.producing) {
                    // can use more
                    if (cs == 'Charging') {
                        amps = await teslas[VIN].getChargeAmps()
                        if (amps < config.teslaAmps.max) {
                            await teslas[VIN].setChargeAmps(amps+1)
                            console.log(VIN + ": increasing charging to " + (amps+1) + " amps")
                        } else {
                            console.log(VIN + ": already at max charging")
                            return
                        }
                        return
                    } else {
                        await teslas[VIN].startCharging(config.teslaAmps.min)
                        console.log(VIN + ": starting charging at "+config.teslaAmps.min+" amps")
                        return
                    }
                } else {
                    if (fusion.using < fusion.producing) {
                        console.log(VIN + ": car is " + cs + ", using slightly less power than what we produce.")
                        return
                    } else {
                        // should use less
                        if (cs == 'Charging') {
                            amps = await teslas[VIN].getChargeAmps()
                            if (amps > 5) {
                                await teslas[VIN].setChargeAmps(amps-1)
                                console.log(VIN + ": decreasing charging to " + (amps-1) + " amps")
                                return
                            } else {
                                await teslas[VIN].stopCharging()
                                console.log(VIN + ": stopping charging")
                                return
                            }
                        } else {
                            console.log(VIN + ": car is " + cs + ", doing nothing.")
                            return
                        }
                    }
                }
            } else {
                console.log(VIN + ": car is " + cs + ", doing nothing.")
            }
        } else {
            console.log(VIN + ": car is not close to any station.")
        }
    }

    @GenezioMethod({type: "cron", cronString: "*/15 * * * *"})
    async optimizeAll() {
        console.log("Optimizing all vehicles")
        const teslaCache = new TeslaCache('protos/vehicle_data.proto', 'TopLevelMessage');
        await this.fusionsolar.signIn();
        const cachedVehicleData = new Mongo('cached_vehicle_data')
        let ta = new TeslaAccount('')
        console.log("Getting all tesla accounts")
        let al = await ta.getAllAccounts()
        for (const account of al) {
            console.log("Working with account " + account.email)
            ta = new TeslaAccount(account['_id'])
            const vl = await ta.getVehicleList();
            for (const vehicle of vl) {
                const vin = vehicle['vin']
                console.log(vin + ": optimizing");
                try {
                    const base64VehicleData = vehicle['cached_data'];
                    const found = await cachedVehicleData.findOne({ VIN: vin });
                    if (found) {
                        console.log(vin + ": no new cached data, skipping")
                    } else {
                        const vehicleDataBuffer = Buffer.from(base64VehicleData, 'base64');
                        var vehicleData = undefined;
                        try {
                            vehicleData = await teslaCache.decodeVehicleData(vehicleDataBuffer);
                        } catch(e:any) {
                            console.log(vin + ": " + e.message)
                        }
                        if (base64VehicleData)
                            await cachedVehicleData.upsert(undefined, { VIN: vin, vehicleData, base64VehicleData})
                    }
                    await this.#optimize(vin, ta)
                    console.log(vin + ": done")
                } catch(e:any) {
                    console.log(vin + ": " + e.message)
                }
            }
        }
        console.log("Done optimizing all vehicles")
    }

    #generateGUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
    }

    @GenezioMethod({ type: "http" })
    async redirect(request: GenezioHttpRequest): Promise<GenezioHttpResponse> {

        if (request.queryStringParameters) {
            let ta:TeslaAccount = new TeslaAccount(this.#generateGUID())
            let rt = await ta.obtainRefreshToken(process.env.TESLA_CLIENT_ID, process.env.TESLA_CLIENT_SECRET, request.queryStringParameters["code"])
        }

        const response: GenezioHttpResponse = {
            body: "Thank you.",
            headers: { "content-type": "text/html" },
            statusCode: "200",
        };
      
        return response;
    }
}