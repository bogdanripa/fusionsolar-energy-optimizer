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
    console.log("Waking up " + this.VIN);
    if (maxRetries == 0) {
      throw new Error("wakeup failed, giving up")
    }
  
    var wakeUpR = await this.#request('POST', '/vehicles/{VIN}/wake_up');  
    console.log(`${this.VIN} is ${wakeUpR.state}`);
    if (wakeUpR.state == 'online') {
      console.log(`${this.VIN} woke up`);
      await this.cacheVehicleData();
      return;
    }
  
    await this.sleep(5000);
    return await this.wakeUp(maxRetries-1);
  }

  async getChargeAmps() {
    return this.vehicleData.charge_state.charge_amps;
  }
  
  async loadVehicleData() {
    if (this.vehicleData) return;
    const mats = await Tesla.m?.getById(this.VIN)
    if (!mats) {
      throw new Error("Cannot retrieve vehicle data")
    }
    this.vehicleData = {
      state: mats.state,
      drive_state: {
        latitude: mats?.drive_state?.latitude,
        logitude: mats?.drive_state?.logitude
      },
      charge_state: {
        charging_state: mats.charge_state?.charging_state,
        charge_port_door_open: mats?.charge_port_door_open,
        battery_level: mats?.battery_level,
        charge_limit_soc: mats?.charge_limit_soc,
        charge_amps: mats?.charge_amps,
        charge_current_request_max: mats?.charge_current_request_max
      }
    }
  }

  async getChargeState() {
    if (this.vehicleData) return this.vehicleData.charge_state.charging_state
    await this.loadVehicleData();
    return this.vehicleData.charge_state.charging_state;
  }

  async setChargeAmps(amps: number) {
    if (!this.vehicleData) await this.loadVehicleData();
    await this.#request("POST", "/vehicles/{VIN}/command/set_charging_amps", {charging_amps: amps});

    this.vehicleData.charge_state.charge_amps = amps;
    this.vehicleData.charge_state.charging_state = "Charging";
    await Tesla.m?.upsert(this.VIN, {state: 'online', charge_state: this.vehicleData.charge_state});
  }
  
  async stopCharging() {
    if (!this.vehicleData) await this.loadVehicleData();
    await this.#request("POST", "/vehicles/{VIN}/command/charge_stop");
    this.vehicleData.charge_state.charging_state = "Stopped";
    await Tesla.m?.upsert(this.VIN, {state: 'online', charge_state: this.vehicleData.charge_state});
  }

  async startCharging(amps: number) {
    if (!this.vehicleData) await this.loadVehicleData();
    // await this.#request("POST", "/vehicles/{VIN}/command/set_charging_amps", {charging_amps: amps});
    const response = await this.#request("POST", "/vehicles/{VIN}/command/charge_start");
    if (!response.result) {
      console.log(response);
      await this.cacheVehicleData();
    } else {
      // this.vehicleData.charge_state.charge_amps = amps;
      this.vehicleData.charge_state.charging_state = "Charging";
      await Tesla.m?.upsert(this.VIN, {state: 'online', charge_state: this.vehicleData.charge_state});
    }
  }

  async setLock(lock: boolean) {
    await this.#request("POST", "/vehicles/{VIN}/command/door_"+(lock?"":"un")+"lock");
    console.log(`${this.VIN} is ${lock ? "locked" : "unlocked"}`);
  }

  async flashLights() {
    await this.#request("POST", "/vehicles/{VIN}/command/flash_lights");
    console.log(`${this.VIN} flashed lights`);
  }
  
  async getChargeLimit() {
    if (!this.vehicleData) await this.loadVehicleData();
    return this.vehicleData.charge_state.charge_limit_soc;
  }

  async cacheVehicleData() {
    const requestedVD = await this.#request("GET", "/vehicles/{VIN}/vehicle_data?endpoints=charge_state%3Blocation_data");
    this.vehicleData = {
        state: requestedVD.state,
        drive_state: {
          latitude: requestedVD.drive_state.latitude,
          longitude: requestedVD.drive_state.longitude
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
    await Tesla.m?.upsert(this.VIN, this.vehicleData);
  }

  async getVehicleList() {
    const vehicles = await this.#request("GET", "/products/");
    // Transform the array to only contain the VINs
    const vins = vehicles.map((vehicle:any) => vehicle.vin);
    return vins;
  }
  
  async getCachedPosition() {
    if (!this.vehicleData) await this.loadVehicleData();
    return this.vehicleData.drive_state;
  }

  async syncApiType() {
    if (this.apiType) return;
    if (Tesla.m && this.VIN) {
      const mats:any = await Tesla.m.getById(this.VIN)
      if(mats && 'api_type' in mats) {
        this.apiType = mats.api_type;
      } else {
        this.apiType = "legacy";
      }
    } else {
      throw new Error("Cannot retrieve API type")
    }
  }

  async setApiType(apiType:string) {
    await Tesla.m?.upsert(this.VIN, {api_type: apiType});
    this.apiType = apiType;
  }
  
  async isChargePortOpen() {
    if (!this.vehicleData) await this.loadVehicleData();
    return this.vehicleData.charge_state.charge_port_door_open
  }
}

export default Tesla;