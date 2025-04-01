import axios from 'axios'
import Mongo from './mongo.js'

class TeslaAccount {
  id:string
  static m?:Mongo
  refreshToken?:string
  accessToken?:string

  constructor(id:string) {
    this.id=id;
  }

  async obtainRefreshToken(client_id?:string, client_secret?:string, code?:string) {
    if (!client_id) throw("Client ID not provided");
    if (!client_secret) throw("Client Secret not provided");
    const AUDIENCE = "https://fleet-api.prd.eu.vn.cloud.tesla.com";
    const tokenUrl = 'https://auth.tesla.com/oauth2/v3/token';
      
    let data:any = {
        'client_id': client_id,
        'client_secret': client_secret,
        'audience': AUDIENCE
    };
    
    if (code !== undefined) {
        data.grant_type = 'authorization_code';
        data.code = code;
        data.redirect_uri = 'https://v3nbfm65nmaem2b5axu2b7vgte0qcmxg.lambda-url.us-east-1.on.aws/FusionsolarEnergyOptimizer/redirect';
        //data.redirect_uri = 'http://localhost:8083/FusionsolarEnergyOptimizer/redirect';
    } else {
        data.scope = 'openid vehicle_device_data vehicle_cmds vehicle_charging_cmds';
        data.grant_type = 'client_credentials';
    }

    try {
        const response = await axios.post(tokenUrl,
            data,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            }
        );

        this.accessToken = response.data.access_token;
        this.refreshToken = response.data.refresh_token;

        if (TeslaAccount.m) {
            console.log("Saving tesla refresh token to mongo")
            await TeslaAccount.m.upsert(this.id, {accessToken: this.accessToken, refreshToken: this.refreshToken})
        }
    } catch (e:any) {
        throw(e.message)
    }
  }

  setMongoDBUri(uri?:string) {
    if (!uri) return;
    if (!TeslaAccount.m)
        TeslaAccount.m = new Mongo(uri, 'tesla_accounts')
  }
  
  async request(method:string, uri:string, data:any = {}):Promise<any> {
    await this.authenticate();
  
    var headers = {
      Authorization: "Bearer " + this.accessToken
    };
  
    try {
      var response = await axios.request({
        method: method,
        url: 'https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1' + uri,
        headers: headers,
        data: data
      })
    } catch(e:any){
      if (e.response.status == 401) {
        console.log("Tesla: access token expired!");
        // access token expired
        this.accessToken = "expired";
        return this.request(method, uri, data);
      }
      console.log("Error calling " + uri)
      throw e
    }
    return response.data.response;
  }
  
  async authenticate() {
    if (this.accessToken && this.accessToken != "expired") return;
  
    if (this.accessToken != "expired") {
      if (TeslaAccount.m) {
        const mats:any = await TeslaAccount.m.getById(this.id)
        if (mats) {
          this.accessToken = mats.accessToken
          this.refreshToken = mats.refreshToken
          return;
        }
      }
    }
  
    try {
      console.log('POST http://auth.tesla.com/oauth2/v3/token')
      console.log('grant_type=refresh_token')
      console.log('refresh_token=' + this.refreshToken)
      console.log('client_id=' + process.env.TESLA_CLIENT_ID)
      var response = await axios.post("https://auth.tesla.com/oauth2/v3/token", {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
        client_id: process.env.TESLA_CLIENT_ID
      });
    
      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;
    } catch(e:any) {
      console.log("Error refreshing Tesla token")
      console.log(e.message);
      return;
    }
    console.log('Got new Tesla auth token')
    if (TeslaAccount.m && this.id)
      await TeslaAccount.m.upsert(this.id, {accessToken: this.accessToken, refreshToken: this.refreshToken})
  }
  
  async getVehicleList() {
    const vehicles = await this.request("GET", "/products/");
    // Transform the array to only contain the VINs
    const vins = vehicles.map((vehicle:any) => vehicle.vin);
    return vins;
  }

  async getAllAccounts() {
    if (TeslaAccount.m) {
      return await TeslaAccount.m.getAll()
    } else {
      throw("MongoDB not set")
    }
  }

  async cacheTokens() {
    if (TeslaAccount.m)
      await TeslaAccount.m.upsert(this.id, {accessToken: this.accessToken, refreshToken: this.refreshToken})
  }

}

export default TeslaAccount;