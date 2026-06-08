'use strict';

const fetch = require('node-fetch');
const crypto = require('crypto');

const GATEWAY_REGIONS = {
  EU: 'https://gateway-mg-eu.soimt.com',
  AU: 'https://gateway-mg-au.soimt.com',
  TR: 'https://gateway-mg-tr.soimt.com',
};

const TENANT_ID_EU = '459771';
const API_BASE = '/api.app/v1';
const TOKEN_TTL_MS = 30 * 60 * 1000;

class SaicApiClient {
  constructor({ region = 'EU', countryCode = '46' } = {}) {
    this.baseUrl = GATEWAY_REGIONS[region] || GATEWAY_REGIONS.EU;
    this.countryCode = countryCode;
    this.token = null;
    this.userId = null;
    this.tokenExpiry = 0;
    this._credentials = null;
  }

  _md5(str) {
    return crypto.createHash('md5').update(str, 'utf8').digest('hex');
  }

  _headers(authenticated = false) {
    const h = {
      'Content-Type': 'application/json;charset=UTF-8',
      'APP-LANGUAGE-TYPE': 'en',
      'APP-SEND-DATE': Date.now().toString(),
      'APP-CONTENT-ENCRYPTED': '0',
      'TENANT-ID': TENANT_ID_EU,
    };
    if (authenticated && this.token) {
      h['APP-LOGIN-TOKEN'] = this.token;
      h['APP-USER-ID'] = this.userId;
    }
    return h;
  }

  async _post(path, body, authenticated = false) {
    const res = await fetch(`${this.baseUrl}${API_BASE}${path}`, {
      method: 'POST',
      headers: this._headers(authenticated),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    const code = String(json.code ?? json.returnCode ?? '');
    if (code !== '0' && code !== '') {
      throw new Error(json.message || json.desc || `API error: ${code}`);
    }
    return json.data ?? json;
  }

  async _get(path, authenticated = false) {
    const res = await fetch(`${this.baseUrl}${API_BASE}${path}`, {
      method: 'GET',
      headers: this._headers(authenticated),
    });
    const json = await res.json();
    const code = String(json.code ?? json.returnCode ?? '');
    if (code !== '0' && code !== '') {
      throw new Error(json.message || json.desc || `API error: ${code}`);
    }
    return json.data ?? json;
  }

  async login(username, password) {
    const data = await this._post('/userAccount/appLogin/v2', {
      loginName: username,
      loginPassword: this._md5(password),
      loginType: 2,
      countryCode: this.countryCode,
    });

    this.token = data.token || data.loginToken;
    this.userId = String(data.userId || data.uid || '');
    this.tokenExpiry = Date.now() + TOKEN_TTL_MS;
    this._credentials = { username, password };
    return data;
  }

  async _ensureAuth() {
    if (!this._credentials) throw new Error('Not authenticated — call login() first');
    if (Date.now() > this.tokenExpiry) {
      await this.login(this._credentials.username, this._credentials.password);
    }
  }

  async getVehicleList() {
    await this._ensureAuth();
    const data = await this._get('/vehicle/listVehicle', true);
    return Array.isArray(data) ? data : (data.vinList || data.vehicles || []);
  }

  async getVehicleStatus(vin) {
    await this._ensureAuth();
    const data = await this._post('/vehicle/vehicleStatus', { vinInfo: [{ vin }] }, true);
    const status = Array.isArray(data) ? data[0] : data;
    return this._normalizeStatus(status);
  }

  async getChargingStatus(vin) {
    await this._ensureAuth();
    try {
      const data = await this._post('/vehicle/charging/chargingStatus', { vin }, true);
      return this._normalizeCharging(data);
    } catch {
      return null;
    }
  }

  async startCharging(vin) {
    await this._ensureAuth();
    return this._post('/vehicle/charging/controlCharging', { vin, chargingSwitch: 1 }, true);
  }

  async stopCharging(vin) {
    await this._ensureAuth();
    return this._post('/vehicle/charging/controlCharging', { vin, chargingSwitch: 0 }, true);
  }

  async setChargingLimit(vin, targetSoc) {
    await this._ensureAuth();
    return this._post('/vehicle/charging/setTargetSoc', { vin, targetSoc }, true);
  }

  async lockDoors(vin) {
    await this._ensureAuth();
    return this._post('/vehicle/door/control', { vin, lockControl: 1 }, true);
  }

  async unlockDoors(vin) {
    await this._ensureAuth();
    return this._post('/vehicle/door/control', { vin, lockControl: 0 }, true);
  }

  _normalizeStatus(raw) {
    if (!raw) return null;
    const basic = raw.basicVehicleStatus || raw.vehicleStatus || raw;
    const extended = raw.gpsPosition || {};
    return {
      soc: basic.extendedData1 ?? basic.soc ?? basic.batteryLevel ?? null,
      range: basic.mileageOfDay ?? basic.electricRange ?? basic.range ?? null,
      isLocked: basic.lockStatus === 1 || basic.lockStatus === true,
      isCharging: basic.powerMode === 4 || basic.chargingStatus === 1,
      chargingStatus: basic.chargingStatus ?? null,
      mileage: basic.totalMileage ?? basic.odometer ?? null,
      speed: basic.vehicleSpeed ?? null,
      latitude: extended.wayPoint?.position?.latitude
        ? extended.wayPoint.position.latitude / 1e6
        : null,
      longitude: extended.wayPoint?.position?.longitude
        ? extended.wayPoint.position.longitude / 1e6
        : null,
      raw,
    };
  }

  _normalizeCharging(raw) {
    if (!raw) return null;
    const c = raw.chargingStatus || raw.bmsChargingStatus || raw;
    return {
      isCharging: c.bmsChrgSts === 1 || c.chargingStatus === 1,
      soc: c.bmsPackSOCDsp ?? c.soc ?? null,
      targetSoc: c.bmsTargetSOCDsp ?? c.targetSoc ?? null,
      chargeCurrentLimit: c.bmsChargeCurrentLimit ?? null,
      estimatedRange: c.chargingElecRngToEPT ?? null,
      remainingChargingTime: c.chargingDurationUntilFull ?? null,
      raw,
    };
  }
}

module.exports = SaicApiClient;
