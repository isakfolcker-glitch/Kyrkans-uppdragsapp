'use strict';

const Homey = require('homey');
const SaicApiClient = require('../../lib/SaicApiClient');

const POLL_INTERVAL_DEFAULT_MS = 5 * 60 * 1000;

class MgVehicleDevice extends Homey.Device {
  async onInit() {
    this._client = null;
    this._pollTimer = null;

    await this._initClient();
    await this._poll();
    this._startPolling();

    this.registerCapabilityListener('locked', async (value) => {
      if (value) {
        await this._client.lockDoors(this.getData().vin);
      } else {
        await this._client.unlockDoors(this.getData().vin);
      }
    });
  }

  async _initClient() {
    const store = this.getStore();
    const settings = this.getSettings();
    this._client = new SaicApiClient({
      region: settings.region || 'EU',
      countryCode: settings.country_code || '46',
    });
    await this._client.login(store.username, store.password);
  }

  _startPolling() {
    const settings = this.getSettings();
    const intervalMs = (settings.poll_interval || 5) * 60 * 1000;
    this._pollTimer = this.homey.setInterval(() => this._poll(), intervalMs);
  }

  _stopPolling() {
    if (this._pollTimer) {
      this.homey.clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  async _poll() {
    const { vin } = this.getData();
    try {
      const [status, charging] = await Promise.all([
        this._client.getVehicleStatus(vin),
        this._client.getChargingStatus(vin),
      ]);

      await this._applyStatus(status, charging);
    } catch (err) {
      this.error('Poll failed:', err.message);
    }
  }

  async _applyStatus(status, charging) {
    if (!status) return;

    const soc =
      (charging && charging.soc != null ? charging.soc : null) ??
      status.soc;

    if (soc != null) {
      await this.setCapabilityValue('measure_battery', Math.round(soc)).catch(this.error);
    }

    const isCharging =
      (charging ? charging.isCharging : null) ?? status.isCharging ?? false;
    await this.setCapabilityValue('alarm_generic.charging', isCharging).catch(this.error);

    if (status.isLocked != null) {
      await this.setCapabilityValue('locked', status.isLocked).catch(this.error);
    }

    if (status.range != null) {
      await this.setCapabilityValue('measure_range', Math.round(status.range)).catch(this.error);
    }

    if (status.mileage != null) {
      const km = status.mileage > 10000 ? status.mileage / 10 : status.mileage;
      await this.setCapabilityValue('meter_power.odometer', Math.round(km)).catch(this.error);
    }
  }

  async onSettings({ newSettings, changedKeys }) {
    if (
      changedKeys.includes('region') ||
      changedKeys.includes('country_code')
    ) {
      await this._initClient();
    }

    if (changedKeys.includes('poll_interval')) {
      this._stopPolling();
      this._startPolling();
    }
  }

  async onDeleted() {
    this._stopPolling();
    this.log('MG vehicle removed');
  }
}

module.exports = MgVehicleDevice;
