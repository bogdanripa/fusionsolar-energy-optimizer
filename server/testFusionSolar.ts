import 'dotenv/config';

import FusionSolar from './fusionsolar'

let fusionsolar = new FusionSolar(process.env.fusionsolarCredentialsUser, process.env.fusionsolarCredentialsPassword)
console.log(await fusionsolar.getStationsList());