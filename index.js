"use strict"

import config from 'config'
import {tesla} from './tesla.js'
import {fusionsolar} from './fusionsolar.js'

export class FusionsolarEnergyOptimizer {
    #solarLocation = config.solarLocation

    constructor() {
        console.log("Constructor called!");

        tesla.setRefreshToken(config.get('teslaToken'))
        tesla.setMongoDBUri(config.get('MONGO_DB_URI'))

        fusionsolar.setCredentials(config.get('fusionsolarCredentials.user'), config.get('fusionsolarCredentials.password'), config.get('fusionsolarCredentials.stationId'))
        fusionsolar.setMongoDBUri(config.get('MONGO_DB_URI'))
    }

    async optimize() {
        var pos = await tesla.getPosition()
 
        if (Math.abs(this.#solarLocation.lat - pos.lat) > 0.001 || Math.abs(this.#solarLocation.long - pos.long) > 0.001) {
            // car not on location, do nothing
            console.log("Car not on location")
            return
        }

        //var awake = await tesla.isAwake();

        console.log("Getting tesla details");
        await tesla.wakeUp()
        var cs = await tesla.getChargeState()
        var cl = await tesla.getChargeLimit()
        var amps
        var diff = cs == 'Charging'?config.get('usedWatts.incrementalAmp'):config.get('usedWatts.startAmp');
        console.log("Tesla is " + cs + ", target: " + cl + "%");

        if (cl != 100 && cs != 'Disconnected' && cs != 'Complete') {
            console.log("Getting fusionsolar details");
            var status = await fusionsolar.getRealTimeDetails()
            console.log(status)
            
            if (status.using + diff < status.producing) {
                // can use more
                if (cs == 'Charging') {
                    amps = await tesla.getChargeAmps()
                    await tesla.setChargeAmps(amps+1)
                    console.log("Increasing tesla charging to " + (amps+1) + " amps")
                    return
                } else {
                    await tesla.setChargeAmps(config.get('teslaAmps.min'))
                    await tesla.startCharging()
                    console.log("Starting charging tesla at "+config.get('teslaAmps.min')+" amps")
                    return
                }
            } else {
                if (status.using < status.producing - config.get('usedWatts.upperLimit')) {
                    console.log("Tesla is " + cs + ", using slightly less power than what we produce.")
                    return
                } else {
                    // should use less
                    if (cs == 'Charging') {
                        amps = await tesla.getChargeAmps()
                        if (amps > 5) {
                            await tesla.setChargeAmps(amps-1)
                            console.log("Decreasing tesla charging to " + (amps-1) + " amps")
                            return
                        } else {
                            await tesla.stopCharging()
                            console.log("Stopping charging tesla")
                            return
                        }
                    } else {
                        console.log("Tesla is " + cs + ", doing nothing.")
                        return
                    }
                }
            }
        } else {
            console.log("Tesla is " + cs + ", doing nothing.")
            return
        }
    }
}