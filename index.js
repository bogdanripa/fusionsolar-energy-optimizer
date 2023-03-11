import {tesla} from './tesla.js'
import {fusionsolar} from './fusionsolar.js'
import config from './config.json'// assert {type: 'json'}

export class FusionsolarEnergyOptimizer {
    #solarLocation = config.solarLocation

    constructor() {
        console.log("Constructor called!");

        tesla.setRefreshToken(config.teslaToken)
        tesla.setMongoDBUri(config.MONGO_DB_URI)

        fusionsolar.setCredentials(config.fusionsolarCredentials.user, config.fusionsolarCredentials.password)
    }

    async optimize() {
        var pos = await tesla.getPosition()
 
        if (Math.abs(this.#solarLocation.lat - pos.lat) > 0.001 || Math.abs(this.#solarLocation.long - pos.long) > 0.001) {
            // car not on location, do nothing
            console.log("Car not on location")
            return
        }

        //var awake = await tesla.isAwake();

        await tesla.wakeUp()
        var cs = await tesla.getChargeState()
        var cl = await tesla.getChargeLimit()
        var amps
        var diff = cs == 'Charging'?config.usedWatts.incrementalAmp:config.usedWatts.startAmp;

        if (cl != 100 && cs != 'Disconnected' && cs != 'Complete') {
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
                    await tesla.setChargeAmps(config.teslaAmps.min)
                    await tesla.startCharging()
                    console.log("Starting charging tesla at "+config.teslaAmps.min+" amps")
                    return
                }
            } else {
                if (status.using < status.producing - config.usedWatts.upperLimit) {
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