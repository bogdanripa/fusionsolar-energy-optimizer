import { GenezioDeploy, GenezioMethod } from "@genezio/types";
import { GenezioHttpResponse, GenezioHttpRequest } from "@genezio/types";

import TeslaAccount from './teslaAccount.js'
import Tesla from './tesla.js'

let config:any;
import {fusionsolar} from './fusionsolar'

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

@GenezioDeploy()
export class FusionsolarEnergyOptimizer {
    constructor() {
        console.log("Constructor called!")

        fusionsolar.setCredentials(process.env.fusionsolarCredentialsUser, process.env.fusionsolarCredentialsPassword)
        fusionsolar.initMongo()
    }

    async #optimize(VIN:string, account:TeslaAccount) {
        console.log(VIN + ': optimizing');
        if (!teslas[VIN]) {
            teslas[VIN] = new Tesla(VIN, account)
        }

        try {
            await teslas[VIN].cacheVehicleData(true);
        } catch(e:any) {
            console.log(VIN + ': ' + e.message)
            if  ((new Date()).getMinutes() < 5 && (new Date()).getHours()%2 == 0) {
                // every 2 hours, wake them up
                await teslas[VIN].wakeUp();
            }
        }

        var chargePortOpen = await teslas[VIN].isChargePortOpen()
        if (!chargePortOpen) {
            console.log(VIN + ": charge port is closed")
            return
        }
        var pos = await teslas[VIN].getPosition();
        var sList = await fusionsolar.getStationsList();
        let closestStation: Station | undefined = undefined;

        console.log(VIN + ": is at " + pos.lat + ", " + pos.long)

        for (const station of sList) {
            station.sqDistance = Math.abs(station.latitude - pos.lat) * Math.abs(station.longitude - pos.long);
            
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
            var fusion = await fusionsolar.getRealTimeDetails(closestStation.dn)
            console.log(closestStation.name + ": solar production is " + fusion.producing + ", using " + fusion.using);
            var cs = await teslas[VIN].getChargeState();
            if  ((new Date()).getMinutes() > 5) {
                if (cs != 'Charging' && fusion.producing < fusion.using + config.usedWatts.startAmp) {
                    console.log(VIN + ": solar production is less than using, and the car is not charging. Nothing to do.")
                    return;
                }
            }

            console.log(VIN + ": waking up and get details")
            try {
                await teslas[VIN].wakeUp();
            } catch(e:any) {
                console.log(VIN + ": " + e.message)
                return;
            }
            cs = await teslas[VIN].getChargeState()
            var cl = await teslas[VIN].getChargeLimit()
            var amps
            var diff = cs == 'Charging'?config.usedWatts.incrementalAmp:config.usedWatts.startAmp;
            console.log(VIN + ": car is " + cs + ", target: " + cl + "%");

            if (cl != 100 && cs != 'Disconnected' && cs != 'Complete') {
                
                if (fusion.using + diff < fusion.producing) {
                    // can use more
                    if (cs == 'Charging') {
                        amps = await teslas[VIN].getChargeAmps()
                        await teslas[VIN].setChargeAmps(amps+1)
                        console.log(VIN + ": increasing charging to " + (amps+1) + " amps")
                        return
                    } else {
                        await teslas[VIN].setChargeAmps(config.teslaAmps.min)
                        await teslas[VIN].startCharging()
                        console.log(VIN + ": starting charging at "+config.teslaAmps.min+" amps")
                        return
                    }
                } else {
                    if (fusion.using < fusion.producing - config.usedWatts.upperLimit) {
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
        let ta = new TeslaAccount('')
        console.log("Getting all accounts")
        let al = await ta.getAllAccounts()
        for (const account of al) {
            console.log("Working with account " + account.email)
            ta = new TeslaAccount(account['_id'])
            const vl = await ta.getVehicleList();
            for (const vin of vl) {
                await this.#optimize(vin, ta)
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