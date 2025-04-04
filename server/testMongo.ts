import 'dotenv/config';

import {fusionsolar} from './fusionsolar'

fusionsolar.setCredentials(process.env.fusionsolarCredentialsUser, process.env.fusionsolarCredentialsPassword)
fusionsolar.initMongo();

console.log(await fusionsolar.getStationsList());