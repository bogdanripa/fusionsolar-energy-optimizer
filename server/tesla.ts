import axios from 'axios'
import Mongo from './mongo.js'
import TeslaAccount from './teslaAccount.js'

class Tesla {
  static m?:Mongo  
  VIN:string
  account:TeslaAccount
  vehicleData?:any
  apiType?:string

  constructor(VIN:string, account:TeslaAccount) {
    this.VIN = VIN
    this.account = account
    this.vehicleData = undefined
    this.apiType = undefined
    if (!Tesla.m)
      Tesla.m = new Mongo('tesla')
  }

  sleep(ms:number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async #request(method:string, uri:string, data:any = {}):Promise<any> {
    await this.authenticate();
  
    if (this.VIN)
     uri = uri.replace("{VIN}", this.VIN);

    let baseUrl = "https://fleet-api.prd.eu.vn.cloud.tesla.com/api/1/";
    if (uri.includes("command")) {
      await this.syncApiType();
      if (this.apiType == "vehicle command") {
        baseUrl = "https://3b231535-317f-4840-869f-df84d4c47540.eu-west-1.cloud.genez.io/api/1";
      }
    }

    const url = baseUrl + uri;

    var headers = {
      Authorization: "Bearer " + this.account.accessToken
    };

    //console.log("Calling " + method + " " + url, data)
  
    try {
      var response = await axios.request({
        method: method,
        url,
        headers,
        data
      })
      //console.log("Response: " + response.status)
    } catch(e:any){
      if (e.response?.status == 401) {
        console.log("Tesla: access token expired");
        // access token expired
        this.account.accessToken = "expired";
        return this.#request(method, uri, data);
      }
      if (e.response?.status == 408) {
        throw new Error("Car is sleeping")
      }
      if (e.response?.status == 403 && url.includes("fleet-api")) {
        // change protocol
        await this.setApiType("vehicle command");
        return this.#request(method, uri, data);
      }
      console.log("Error calling " + uri)
      if (e.response)
        console.log(e.response.status + " / " + e.response.statusText)
      else 
        console.log(e)
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
          this.account.refreshToken = mats.refreshToken
          if (mats.accessToken && mats.accessToken != "expired") {
            this.account.accessToken = mats.accessToken
            return;
          }
        }
      }
    }
  
    try {
      var response = await axios.post("https://auth.tesla.com/oauth2/v3/token", {
        grant_type: 'refresh_token',
        refresh_token: this.account.refreshToken,
        client_id: process.env.TESLA_CLIENT_ID
      });
    
      this.account.accessToken = response.data.access_token;
      this.account.refreshToken = response.data.refresh_token;
    } catch(e:any) {
      console.log("Error refreshing Tesla token")
      console.log(e.response.data);
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
  
    var wakeUpR = await this.#request('POST', '/vehicles/{VIN}/wake_up');  
    console.log(`${this.VIN} is ${wakeUpR.state}`);
    if (wakeUpR.state == 'online') {
      await this.cacheVehicleData();
      return;
    }
  
    await this.sleep(5000);
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
    if (this.vehicleData && this.vehicleData.charge_state.charging_state) return this.vehicleData.charge_state.charging_state
    // retrieve last known position
    if (Tesla.m && this.VIN) {
      const mats = await Tesla.m.getById(this.VIN)
      if(mats && 'charging_state' in mats) {
        return mats.charging_state;
      }
    }
    throw new Error("Cannot retrieve charging state status")
  }

  async setChargeAmps(amps: number) {
    await this.#request("POST", "/vehicles/{VIN}/command/set_charging_amps", {charging_amps: amps});
    await this.cacheVehicleData(true);
  }
  
  async stopCharging() {
    await this.#request("POST", "/vehicles/{VIN}/command/charge_stop");
    await this.cacheVehicleData(true);
  }

  async startCharging() {
    await this.#request("POST", "/vehicles/{VIN}/command/charge_start");
    await this.cacheVehicleData(true);
  }

  async setLock(lock: boolean) {
    await this.#request("POST", "/vehicles/{VIN}/command/door_"+(lock?"":"un")+"lock");
    console.log(`${this.VIN} is ${lock ? "locked" : "unlocked"}`);
    await this.cacheVehicleData(true);
  }

  async flashLights() {
    await this.#request("POST", "/vehicles/{VIN}/command/flash_lights");
    console.log(`${this.VIN} flashed lights`);
  }
  
  async getChargeLimit() {
    return this.vehicleData.charge_state.charge_limit_soc;
  }

  async cacheVehicleData(force:boolean=false) {
    if (force) this.vehicleData = undefined;
    if (!this.vehicleData) {
      const requestedVD = await this.#request("GET", "/vehicles/{VIN}/vehicle_data?endpoints=charge_state%3Blocation_data");
      this.vehicleData = {
          state: requestedVD.state,
          drive_state: {
            latitude: requestedVD.drive_state.latitude,
            logitude: requestedVD.drive_state.longitude
          },
          charge_state: {
            charge_port_door_open: requestedVD.charge_state.charge_port_door_open,
            battery_level: requestedVD.charge_state.battery_level,
            charging_state: requestedVD.charge_state.charging_state,
            charge_limit_soc: requestedVD.charge_state.charge_limit_soc,
            charge_amps: requestedVD.charge_state.charge_amps,
            charge_current_request_max: requestedVD.charge_state.charge_current_request_max
          }
        }
      if (Tesla.m && this.VIN)
        await Tesla.m.upsert(this.VIN, this.vehicleData);
    }
  }

  async getVehicleList() {
    const vehicles = await this.#request("GET", "/products/");
    // Transform the array to only contain the VINs
    const vins = vehicles.map((vehicle:any) => vehicle.vin);
    return vins;
  }
  
  async getPosition() {
    if (this.vehicleData) return this.vehicleData.drive_state;
    if (Tesla.m && this.VIN) {
      const mats:any = await Tesla.m.getById(this.VIN)
      if(mats && mats.drive_state) {
        return mats.drive_state;
      }
    }
  
    throw new Error("Cannot retrieve last position")
  }

  async syncApiType() {
    if (this.apiType) return;
    if (Tesla.m && this.VIN) {
      const mats:any = await Tesla.m.getById(this.VIN)
      if(mats && 'api_type' in mats) {
        this.apiType = mats.api_ype;
      } else {
        this.apiType = "legacy";
      }
    } else {
      throw new Error("Cannot retrieve API type")
    }
  }

  async setApiType(apiType:string) {
    if (Tesla.m && this.VIN) {
      await Tesla.m.upsert(this.VIN, {api_type: apiType});
      this.apiType = apiType;
    } else {
      throw new Error("Cannot set API type")
    }
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