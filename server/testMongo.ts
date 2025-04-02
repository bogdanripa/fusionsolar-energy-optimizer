import 'dotenv/config';

import {fusionsolar} from './fusionsolar'

fusionsolar.setCredentials(process.env.fusionsolarCredentialsUser, process.env.fusionsolarCredentialsPassword)
fusionsolar.setMongoDBUri(process.env.MONGO_DB_URI);

(await fusionsolar.getStationsList());