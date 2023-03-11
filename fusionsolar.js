import rs from 'jsrsasign';
var KEYUTIL = rs.KEYUTIL;

import axios from 'axios';

function getSecureRandom() {
    var result = '';
    for (var i = 0; i < 15; i++) {
        result += (Math.floor(Math.random() * 256)).toString(16);
    }

    return result;
}

var credentials = {};
var c = {};
var signedIn = false;

function getCookies(domain) {
    var cStr = '';
    if (!c[domain]) return undefined;
    for (var cName in c[domain]) {
        if (cStr) cStr += '; ';
        cStr += cName + '=' + c[domain][cName];
    }
    return cStr;
}

async function request(method, url, headers, data) {
    if (!headers) headers = {};
    var domain = url.replace(/^\w+:\/\//, '').replace(/\/.*$/, '');
    if (c[domain]) {
        headers.cookie = getCookies(domain);
    }
    var response;
    try {
         response = await axios.request({
            method: method,
            url: url,
            headers: headers,
            data: data,
            maxRedirects: 0
        });
    } catch(e) {
        response = e.response;
    }

    if (response.headers && response.headers['set-cookie']) {
        var cList = response.headers['set-cookie'];
        for (var cDev of cList) {
            var cName = cDev.replace(/=.*$/, '');
            var cValue = cDev.substr(cName.length + 1).replace(/;.*$/, '');
            if (!c[domain]) c[domain] = {};
            c[domain][cName] = cValue;
        }
    }

    if (response.headers.location) {
        var newURL = response.headers.location;
        if (newURL.match(/^\//)) {
            newURL = url.replace(/^(\w+:\/\/[^\/]*).*$/, '$1') + newURL;
        }
        return request("get", newURL, {});
    }

    return response;
}

function setCredentials(user, pass) {
    credentials = {
        "organizationName": '',
        "username": user,
        "password": pass,
    };
}

async function signIn() {
    if (signedIn) return;
    if (!credentials.username) throw "Fusionsolar credentials not supplied"

    var response = await request("GET", 'https://eu5.fusionsolar.huawei.com/unisso/pubkey');
    var pubKey = KEYUTIL.getKey(response.data.pubKey);
    var valueEncode = encodeURIComponent(credentials.password);
    var encryptValue = "";
    for (var i = 0; i < valueEncode.length / 270; i++) {
        var currntValue = valueEncode.substr(i * 270, 270);
        var encryptValueCurrent = rs.crypto.Cipher.encrypt(currntValue, pubKey, "RSAOAEP384"); 
        encryptValue = encryptValue == "" ? "" : encryptValue + "00000001";
        encryptValue = encryptValue + rs.hextob64(encryptValueCurrent);
    }

    var encryptedCredentials = {...credentials};
    encryptedCredentials.password = encryptValue + response.data.version;

    await request("POST", 'https://eu5.fusionsolar.huawei.com/unisso/v3/validateUser.action?timeStamp=' + response.data.timeStamp + '&nonce=' + getSecureRandom(), {}, encryptedCredentials);
    await request('GET', 'https://region04eu5.fusionsolar.huawei.com/rest/neteco/syscfg/v1/homepage?from=LOGIN');
    signedIn = true;
}

async function getStationDetails() {
    await signIn();
    var response = await request('GET', 'https://region04eu5.fusionsolar.huawei.com/rest/pvms/web/station/v1/overview/energy-flow?stationDn=NE=35757068');
    return response.data;
}

/*
axios.interceptors.request.use(request => {
    console.log(request.method + " " + request.url);
    for (var hk in request.headers) {
        console.log("   " + hk + ": " + request.headers[hk]);
    }
    console.log('');
    return request;
});  

axios.interceptors.response.use(response => {
    console.log("Response: " + response.status);

    for (var hk in response.headers) {
        console.log("   " + hk + ": " + response.headers[hk]);
    }
    console.log('');
    return response;
});
*/

async function getRealTimeDetails() {
    var sl = await getStationDetails();

    var out = {};

    for (var node of [...sl.data.flow.nodes, ...sl.data.flow.links]) {
        switch (node.description.label) {
            case 'neteco.pvms.KPI.kpiView.electricalLoad':
                out.using = parseFloat(node.description.value.replace(/\s.*/, ''));
                break;
            case 'neteco.pvms.energy.flow.buy.power':
                out.buying = parseFloat(node.description.value.replace(/\s.*/, ''));
                break;
            case 'neteco.pvms.devTypeLangKey.string':
                out.producing = parseFloat(node.description.value.replace(/\s.*/, ''));
                break;
        }
    }

    return out;
}

export const fusionsolar = {
    setCredentials,
    getRealTimeDetails
};