import axios from 'axios'
import Mongo from './mongo.js'
import TeslaAccount from './teslaAccount.js'

class Tesla {
  static m?:Mongo  
  VIN:string
  account:TeslaAccount
  vehicleData?:any

  constructor(VIN:string, account:TeslaAccount) {
    this.VIN = VIN
    this.account = account
    this.vehicleData = undefined
  }

  sleep(ms:number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setMongoDBUri(uri?:string) {
    if (!uri) return;
    if (!Tesla.m)
      Tesla.m = new Mongo(uri, 'tesla')
  }
  
  async request(method:string, uri:string, data:any = {}):Promise<any> {
    await this.authenticate();
  
    if (this.VIN)
     uri = uri.replace("{VIN}", this.VIN);

    var headers = {
      Authorization: "Bearer " + this.account.accessToken
    };
  
    try {
      var response = await axios.request({
        method: method,
//        url: 'https://owner-api.teslamotors.com/api/1' + uri,
        url: 'https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1' + uri,
        headers: headers,
        data: data
      })
    } catch(e:any){
      if (e.response && e.response.status == 401) {
        console.log("Tesla: access token expired");
        // access token expired
        this.account.accessToken = "expired";
        return this.request(method, uri, data);
      }
      if (e.response && e.response.status == 408) {
        throw new Error("Car is sleeping")
      }
      console.log("Error calling " + uri)
      throw e
    }
    return response.data.response;
  }
  
  async authenticate() {
    if (this.account.accessToken && this.account.accessToken != "expired") return;
  
    if (this.account.accessToken != "expired" && this.VIN) {
      if (Tesla.m) {
        const mats:any = await Tesla.m.getById(this.VIN)
        if (mats) {
          this.account.accessToken = mats.accessToken
          this.account.refreshToken = mats.refreshToken
          return;
        }
      }
    }
  
    try {
      var response = await axios.post("https://auth.tesla.com/oauth2/v3/token", {
        grant_type: 'refresh_token',
        refresh_token: this.account.refreshToken,
        client_id: process.env.tesla_client_id
      });
    
      this.account.accessToken = response.data.access_token;
      this.account.refreshToken = response.data.refresh_token;
    } catch(e:any) {
      console.log(e.message);
      return;
    }
    console.log('Got new Tesla auth token')
    await this.account.cacheTokens()
  }
  
  async wakeUp(maxRetries = 30):Promise<any> {
    if (this.vehicleData) return;
    if (maxRetries == 0) {
      throw new Error("wakeup failed, giving up")
    }
  
    var wakeUpR = await this.request('POST', '/vehicles/{VIN}/wake_up');  
    if (wakeUpR.state == 'online') {
      await this.cacheVehicleData();
      return;
    }
  
    await this.sleep(1000);
    return await this.wakeUp(maxRetries-1);
  }

  async getChargeAmps() {
    return this.vehicleData.charge_state.charge_amps;
  }
  
  /*
  "Complete": the charging session is complete and the battery is fully charged.
  "Charging": the vehicle is currently charging.
  "Disconnected": the charger is not connected to the vehicle.
  "Stopped": charging has stopped due to an error or the user manually stopping the charge.
  "NoPower": the charger is connected but there is no power available.
  "Unknown": the charging state is unknown.
  */
  async getChargeState() {
    return this.vehicleData.charge_state.charging_state
  }

  async setChargeAmps(amps: number) {
    await this.request("POST", "/vehicles/{VIN}/command/set_charging_amps", {charging_amps: amps});
    await this.cacheVehicleData(true);
  }
  
  async stopCharging() {
    await this.request("POST", "/vehicles/{VIN}/command/charge_stop");
    await this.cacheVehicleData(true);
  }

  async startCharging() {
    await this.request("POST", "/vehicles/{VIN}/command/charge_start");
    await this.cacheVehicleData(true);
  }
  
  async getChargeLimit() {
    return this.vehicleData.charge_state.charge_limit_soc;
  }

  async cacheVehicleData(force:boolean=false) {
    if (force) this.vehicleData = undefined;
    if (this.vehicleData) return;
    this.vehicleData = await this.request("GET", "/vehicles/{VIN}/vehicle_data?endpoints=charge_state%3Blocation_data");
    if (Tesla.m && this.VIN)
      await Tesla.m.upsert(this.VIN, {pos: {lat: this.vehicleData.drive_state.latitude, long: this.vehicleData.drive_state.longitude}, charge_port_door_open: this.vehicleData.charge_state.charge_port_door_open})
  }

  async getVehicleList() {
    const vehicles = await this.request("GET", "/products/");
    // Transform the array to only contain the VINs
    const vins = vehicles.map((vehicle:any) => vehicle.vin);
    return vins;
  }
  
  async getPosition() {
    if (this.vehicleData) return {lat: this.vehicleData.drive_state.latitude, long: this.vehicleData.drive_state.longitude};
    if (Tesla.m && this.VIN) {
      const mats:any = await Tesla.m.getById(this.VIN)
      if(mats && mats.pos) {
        return mats.pos;
      }
    }
  
    throw new Error("Cannot retrieve last position")
  }
  
  async isChargePortOpen() {
    if (this.vehicleData && this.vehicleData.charge_state.charge_port_door_open !== null) return this.vehicleData.charge_state.charge_port_door_open
    // retrieve last known position
    if (Tesla.m && this.VIN) {
      const mats = await Tesla.m.getById(this.VIN)
      if(mats && 'charge_port_door_open' in mats) {
        return mats.charge_port_door_open;
      }
    }
    throw new Error("Cannot retrieve charging port status")
  }
}

export default Tesla;