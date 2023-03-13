"use strict"

import axios from 'axios'
import mongoose from 'mongoose'

var refreshToken
var accessToken
var vID
var chargeState
var MONGO_DB_URI
var MatModel

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setRefreshToken(token) {
  //console.log("Tesla: setRefreshToken");
  refreshToken = token;
}

function setMongoDBUri(uri) {
  MONGO_DB_URI=uri
}

async function initMongo() {
  if (!MatModel) {
    //console.log("Tesla: init mongo connection")
    await mongoose.connect(MONGO_DB_URI);
    MatModel = mongoose.models.tesla || mongoose.model('tesla', new mongoose.Schema({accessToken: {type: String, required: true}, vID: {type: String, required: true}}));
  }
}

async function request(method, uri, data = {}, retried = false) {
  await authenticate();

  var newUri = uri.replace("{vID}", vID);
  var headers = {
    Authorization: "Bearer "+accessToken
  };

  //console.log("Tesla: " + method + " " + newUri);

  try {
    var response = await axios.request({
      method: method,
      url: 'https://owner-api.teslamotors.com/api/1' + newUri,
      headers: headers,
      data: data
    })
  } catch(e){
    if (e.response.status == 401 && !retried) {
      console.log("Tesla: access token expired");
      // access token expired
      accessToken = undefined;
      await MatModel.deleteMany();
      return request(method, uri, data, true);
    }
    console.log("Error calling " + newUri)
    console.log(e.message);
  }
  return response.data.response;
}

async function authenticate() {
  if (!refreshToken) throw "Refresh token not provided, giving up.";
  if (accessToken) return;

  // try getting the access token from mongo
  await initMongo();
  const mats = await MatModel.find()
  if(mats[0]) {
    //console.log("Tesla: reusing token from mongo");
    accessToken = mats[0].accessToken
    vID = mats[0].vID
    return;
  }

  //console.log("Tesla: authenticating");
  
  var response = await axios.post("https://auth.tesla.com/oauth2/v3/token", {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: 'ownerapi',
    scope: 'openid email offline_access'
  });

  accessToken = response.data.access_token;

  if (!vID)
    vID = (await request('GET', '/vehicles', {}, true))[0].id;

  console.log("Tesla: saving token to mongo");
  await MatModel.deleteMany()
  await MatModel.create({accessToken: accessToken, vID: vID})
  
}

async function wakeUp(maxRetries = 30) {
  chargeState = undefined;
  if (maxRetries == 0) {
    throw "wakeup failed, giving up";
  }

  var wakeUpR = await request('POST', '/vehicles/{vID}/wake_up');  
  if (wakeUpR.state == 'online') return;

  await sleep(1000);
  return await wakeUp(maxRetries-1);
}

async function cacheChargeState() {
  if (chargeState) return;
  chargeState = await request("GET", "/vehicles/{vID}/data_request/charge_state");
}

async function getChargeAmps() {
  await cacheChargeState();
  return chargeState.charge_amps;
}

/*
"Complete": the charging session is complete and the battery is fully charged.
"Charging": the vehicle is currently charging.
"Disconnected": the charger is not connected to the vehicle.
"Stopped": charging has stopped due to an error or the user manually stopping the charge.
"NoPower": the charger is connected but there is no power available.
"Unknown": the charging state is unknown.
*/
async function getChargeState() {
  await cacheChargeState();
  return chargeState.charging_state;
}

async function setChargeAmps(amps) {
  await request("POST", "/vehicles/{vID}/command/set_charging_amps", {charging_amps: amps});
  chargeState = undefined;
  await cacheChargeState();
}

async function stopCharging(amps) {
  await request("POST", "/vehicles/{vID}/command/charge_stop");
  chargeState = undefined;
  await cacheChargeState();
}

async function startCharging(amps) {
  await request("POST", "/vehicles/{vID}/command/charge_start");
  chargeState = undefined;
  await cacheChargeState();
}

async function getChargeLimit() {
  await cacheChargeState();
  return chargeState.charge_limit_soc;
}

async function getPosition() {
  var vState = await request("GET", "/vehicles/{vID}/vehicle_data");
  return {lat: vState.drive_state.latitude, long: vState.drive_state.longitude};  
}

async function isAwake() {
  return false;
}

export const tesla = {
  setRefreshToken,
  setMongoDBUri,
  wakeUp,
  getChargeAmps,
  setChargeAmps,
  getChargeState,
  startCharging,
  stopCharging,
  getChargeLimit,
  getPosition,
  isAwake
};