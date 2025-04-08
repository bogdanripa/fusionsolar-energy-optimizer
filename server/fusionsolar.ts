import rs from 'jsrsasign'
import Mongo from './mongo.js'
import axios from 'axios'

interface Credentials {
    organizationName: string;
    username: string;
    password: string;
}

interface Out {
    using: number,
    producing: number
}

export default class Fusionsolar {
    credentials?: Credentials
    cookies:any = {}
    signedIn:boolean = false
    m:Mongo
    roarand:string = ''

    constructor(user?:string, pass?:string) {
        if (!user || !pass) {
            console.log("Fusionsolar: credentials not supplied")
            throw "Fusionsolar: credentials not supplied";
        }

        this.credentials = {
            "organizationName": '',
            "username": user,
            "password": pass,
        };

        this.m = new Mongo('fusionsolar')
    }

    private getSecureRandom() {
        let result = ''
        for (let i = 0; i < 15; i++) {
            result += (Math.floor(Math.random() * 256)).toString(16)
        }
    
        return result
    }
    
    private getCookies(domain:string) {
        let cStr = '';
        for (let d in this.cookies) {
            if (domain.indexOf(d) != -1) {
                for (let cName in this.cookies[d]) {
                    if (cStr) cStr += '; ';
                    cStr += cName + '=' + this.cookies[d][cName];
                }            
            }
        }
        return cStr;
    }

    private async request(method:string, url:string, headers?:any, data?:any): Promise<any> {
        //console.log("Fusionsolar: " + method +" " +url)
        if (!headers) headers = {};
        if (this.roarand) {
            headers['roarand'] = this.roarand;
        }
        let domain = url.replace(/^\w+:\/\//, '').replace(/\/.*$/, '');
        headers.cookie = this.getCookies(domain);
        //console.log(headers);
        let response;
        try {
            //console.log(method, url, headers);
            response = await axios.request({
                method: method,
                url: url,
                headers: headers,
                data: data,
                maxRedirects: 0
            });
            //console.log(JSON.stringify(response.data).substr(0, 100));
        } catch(e:any) {
           // console.log(e);
            response = e.response;
        }
    
        if (response && response.headers && response.headers['set-cookie']) {
            let cList = response.headers['set-cookie'];
            for (let cDev of cList) {
                let cName = cDev.replace(/=.*$/, '');
                let cValue = cDev.substr(cName.length + 1).replace(/;.*$/, '');
                let cDomain = cDev.match(/Domain=([^\;]+);/);
                if (cDomain) cDomain = cDomain[1];
                if (!cDomain) cDomain = domain;
    
                if (!this.cookies[cDomain]) this.cookies[cDomain] = {};
                this.cookies[cDomain][cName] = cValue;
            }
        }
    
        if (response && response.headers.location) {
            let newURL = response.headers.location;
            if (newURL.match(/^\//)) {
                newURL = url.replace(/^(\w+:\/\/[^\/]*).*$/, '$1') + newURL;
            }
            //console.log("Redirecting")
            return this.request("GET", newURL, {}, {});
        }
    
        return response;
    }

    async signIn() {
        if (this.signedIn) return;
        if (!this.credentials) throw "Fusionsolar credentials not supplied"
    
        // try getting the cookies from mongo
        try {
            const mongoObj = (await this.m.getById('cookies'));
            this.cookies = mongoObj.cookies;
            this.roarand = mongoObj.roarand;
            return;
        } catch(e) {
            console.log("Fusionsolar: failed reusing cookies from mongo");
        }
        
        let response = await this.request("GET", 'https://eu5.fusionsolar.huawei.com/unisso/pubkey', {}, {});
        let pubKey:rs.RSAKey = rs.KEYUTIL.getKey(response.data.pubKey) as rs.RSAKey;
        let valueEncode = encodeURIComponent(this.credentials.password);
        let encryptValue = "";
        for (let i = 0; i < valueEncode.length / 270; i++) {
            let currntValue = valueEncode.substr(i * 270, 270);
            let encryptValueCurrent = rs.KJUR.crypto.Cipher.encrypt(currntValue, pubKey, "RSAOAEP384"); 
            encryptValue = encryptValue == "" ? "" : encryptValue + "00000001";
            encryptValue = encryptValue + rs.hextob64(encryptValueCurrent);
        }
    
        let encryptedCredentials = {...this.credentials};
        encryptedCredentials.password = encryptValue + response.data.version;
    
        response = await this.request("POST", 'https://eu5.fusionsolar.huawei.com/unisso/v3/validateUser.action?timeStamp=' + response.data.timeStamp + '&nonce=' + this.getSecureRandom(), {}, encryptedCredentials);
        try {
            await this.request("GET", 'https://eu5.fusionsolar.huawei.com' + response.data.respMultiRegionName[1], {}, {})
        } catch(e:any) {
            console.log(e.message)
        }
        const keepAliveResponse = await this.request("GET", "https://uni004eu5.fusionsolar.huawei.com/rest/dpcloud/auth/v1/keep-alive", {}, {});
        this.roarand = keepAliveResponse.data.payload;
        
        console.log("Fusionsolar: saving cookies to mongo");
        await this.m.upsert('cookies', {cookies: this.cookies, roarand: this.roarand})  
        this.signedIn = true;
    }

    async getStationsList(retried:boolean=false): Promise<any[]> {
        await this.signIn();
        let response = await this.request('POST', 'https://uni004eu5.fusionsolar.huawei.com/rest/pvms/web/station/v1/station/station-list', {}, {
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
        this.signedIn = false;
        await this.m.deleteMany();
        this.cookies = {};
        this.roarand = '';
        if (!retried) {
            console.log("Fusionsolar: sign in cookies expired. Retrying.")
            return this.getStationsList(true)
        }
        throw("Fusionsolar: retried singnin failed");    
    }

    private async getStationDetails(stationId:string) {
        await this.signIn();
        let response = await this.request('GET', 'https://uni004eu5.fusionsolar.huawei.com/rest/pvms/web/station/v1/overview/energy-flow?stationDn=' + stationId, {}, {});
        return response.data;
    }

    async getRealTimeDetails(stationId:string, retied = false):Promise<Out> {
        let sl = await this.getStationDetails(stationId);
    
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
            this.signedIn = false;
            await this.m.deleteMany();
            this.cookies = {};
            this.roarand = '';
            if (!retied) {
                console.log("Fusionsolar: sign in cookies expired. Retrying.")
                return this.getRealTimeDetails(stationId, true);
            }
            console.log("Fusionsolar: retried singnin failed");
        }
    
        return out;
    }
}