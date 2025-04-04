import 'dotenv/config';

import {fusionsolar} from './fusionsolar'

fusionsolar.setCredentials(process.env.fusionsolarCredentialsUser, process.env.fusionsolarCredentialsPassword)
fusionsolar.setMongoDBUri(process.env.FUSIONSOLAR_DATABASE_URL);

(await fusionsolar.getStationsList());