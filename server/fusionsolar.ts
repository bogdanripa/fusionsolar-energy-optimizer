import rs from 'jsrsasign'
import Mongo from './mongo.js'
import axios from 'axios'

function getSecureRandom() {
    let result = ''
    for (let i = 0; i < 15; i++) {
        result += (Math.floor(Math.random() * 256)).toString(16)
    }

    return result
}

interface Credentials {
    organizationName: string;
    username: string;
    password: string;
}

interface Out {
    using: number,
    producing: number
}

let credentials: Credentials
let c:any = {}
let signedIn:boolean = false
let m:any

function getCookies(domain:string) {
    let cStr = '';
    for (let d in c) {
        if (domain.indexOf(d) != -1) {
            for (let cName in c[d]) {
                if (cStr) cStr += '; ';
                cStr += cName + '=' + c[d][cName];
            }            
        }
    }
    return cStr;
}

function setMongoDBUri(uri?:string) {
    if (!m && uri)
        m = new Mongo(uri, 'fusionsolar')
}

async function request(method:string, url:string, headers?:any, data?:any) {
    //console.log("Fusionsolar: " + method +" " +url)
    if (!headers) headers = {};
    let domain = url.replace(/^\w+:\/\//, '').replace(/\/.*$/, '');
    headers.cookie = getCookies(domain);
    let response;
    try {
         response = await axios.request({
            method: method,
            url: url,
            headers: headers,
            data: data,
            maxRedirects: 0
        });
    } catch(e:any) {
        response = e.response;
    }

    if (response.headers && response.headers['set-cookie']) {
        let cList = response.headers['set-cookie'];
        for (let cDev of cList) {
            let cName = cDev.replace(/=.*$/, '');
            let cValue = cDev.substr(cName.length + 1).replace(/;.*$/, '');
            let cDomain = cDev.match(/Domain=([^\;]+);/);
            if (cDomain) cDomain = cDomain[1];
            if (!cDomain) cDomain = domain;

            if (!c[cDomain]) c[cDomain] = {};
            c[cDomain][cName] = cValue;
        }
    }

    if (response.headers.location) {
        let newURL = response.headers.location;
        if (newURL.match(/^\//)) {
            newURL = url.replace(/^(\w+:\/\/[^\/]*).*$/, '$1') + newURL;
        }
        return request("GET", newURL, {}, {});
    }

    return response;
}

function setCredentials(user?:string, pass?:string) {
    if (!user || !pass) return;
    credentials = {
        "organizationName": '',
        "username": user,
        "password": pass,
    };
}

async function signIn() {
    if (signedIn) return;
    if (!credentials) throw "Fusionsolar credentials not supplied"

    // try getting the cookies from mongo
    try {
        c = (await m.getById('cookies')).cookies
        return;
    } catch(e) {
        console.log("Fusionsolar: failed reusing cookies from mongo");
    }

    let response = await request("GET", 'https://eu5.fusionsolar.huawei.com/unisso/pubkey', {}, {});
    let pubKey:rs.RSAKey = rs.KEYUTIL.getKey(response.data.pubKey) as rs.RSAKey;
    let valueEncode = encodeURIComponent(credentials.password);
    let encryptValue = "";
    for (let i = 0; i < valueEncode.length / 270; i++) {
        let currntValue = valueEncode.substr(i * 270, 270);
        let encryptValueCurrent = rs.KJUR.crypto.Cipher.encrypt(currntValue, pubKey, "RSAOAEP384"); 
        encryptValue = encryptValue == "" ? "" : encryptValue + "00000001";
        encryptValue = encryptValue + rs.hextob64(encryptValueCurrent);
    }

    let encryptedCredentials = {...credentials};
    encryptedCredentials.password = encryptValue + response.data.version;

    response = await request("POST", 'https://eu5.fusionsolar.huawei.com/unisso/v3/validateUser.action?timeStamp=' + response.data.timeStamp + '&nonce=' + getSecureRandom(), {}, encryptedCredentials);
    try {
        await request("GET", 'https://eu5.fusionsolar.huawei.com' + response.data.respMultiRegionName[1], {}, {})
    } catch(e:any) {
        console.log(e.message)
    }
    //await request("GET", "https://eu5.fusionsolar.huawei.com/rest/dp/web/v1/auth/on-sso-credential-ready?ticket=ST-160757-kkLY1yKMzRvjaSFz4mtddgvuHfjCGcb1HHm&regionName=region004");
    //https://eu5.fusionsolar.huawei.com/rest/dp/web/v1/auth/on-sso-credential-ready?ticket=ST-160757-kkLY1yKMzRvjaSFz4mtddgvuHfjCGcb1HHm&regionName=region004
    //https://eu5.fusionsolar.huawei.com/rest/dp/web/v1/auth/on-sso-credential-ready?ticket=ST-13977-EaZFC6QLUceIdGjH7CZtdSxWoPvfKcdYt4G&regionName=region004
    //await request('GET', 'https://uni004eu5.fusionsolar.huawei.com/rest/neteco/syscfg/v1/homepage?from=LOGIN');

    console.log("Fusionsolar: saving cookies to mongo");
    await m.upsert('cookies', {cookies: c})  
    signedIn = true;
}

async function getStationsList(retried:boolean=false) {
    await signIn();
    let response = await request('POST', 'https://uni004eu5.fusionsolar.huawei.com/rest/pvms/web/station/v1/station/station-list', {}, {
        "curPage": 1,
        "pageSize": 10,
        "gridConnectedTime": "",
        "queryTime": Date.now(),
        "timeZone": 2,
        "sortId": "createTime",
        "sortDir": "DESC",
        "locale": "en_US"
      });

    if (response.data && response.data.data && response.data.data.list)
        return response.data.data.list;

    // sign in expired
    signedIn = false;
    if (m)
         await m.deleteMany();
    c = {};
    if (!retried) {
        console.log("Fusionsolar: sign in cookies expired. Retrying.")
        return getStationsList(true)
    }
    throw("Fusionsolar: retried singnin failed");    
}

async function getStationDetails(stationId:string) {
    await signIn();
    let response = await request('GET', 'https://uni004eu5.fusionsolar.huawei.com/rest/pvms/web/station/v1/overview/energy-flow?stationDn=' + stationId, {}, {});
    return response.data;
}

async function getRealTimeDetails(stationId:string, retied = false) {
    let sl = await getStationDetails(stationId);

    let out:Out = {using: -1, producing: -1};

    try {
        for (let node of [...sl.data.flow.nodes, ...sl.data.flow.links]) {
            switch (node.description.label) {
                case 'neteco.pvms.KPI.kpiView.electricalLoad':
                    out.using = parseFloat(node.description.value.replace(/\s.*/, ''));
                    break;
                case 'neteco.pvms.devTypeLangKey.string':
                    out.producing = parseFloat(node.description.value.replace(/\s.*/, ''));
                    break;
            }
        }
    } catch(e) {
        // sign in expired
        signedIn = false;
        if (m)
            await m.deleteMany();
        c = {};
        if (!retied) {
            console.log("Fusionsolar: sign in cookies expired. Retrying.")
            return getRealTimeDetails(stationId, true);
        }
        console.log("Fusionsolar: retried singnin failed");
    }

    return out;
}

export const fusionsolar = {
    setCredentials,
    getRealTimeDetails,
    getStationsList,
    setMongoDBUri
}