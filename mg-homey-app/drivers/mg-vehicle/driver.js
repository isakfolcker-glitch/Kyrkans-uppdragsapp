'use strict';

const Homey = require('homey');
const SaicApiClient = require('../../lib/SaicApiClient');

class MgVehicleDriver extends Homey.Driver {
  async onInit() {
    this.log('MG Vehicle driver ready');
  }

  async onPair(session) {
    let client = null;

    session.setHandler('login', async ({ username, password }) => {
      const region = 'EU';
      const countryCode = '46';
      client = new SaicApiClient({ region, countryCode });
      await client.login(username, password);
      return true;
    });

    session.setHandler('list_devices', async () => {
      if (!client) throw new Error('Not logged in');
      const vehicles = await client.getVehicleList();

      return vehicles.map((v) => ({
        name: [v.brandName, v.modelName, v.modelYear].filter(Boolean).join(' ') || v.vin,
        data: {
          vin: v.vin,
          id: v.vin,
        },
        store: {
          username: client._credentials.username,
          password: client._credentials.password,
        },
        settings: {
          poll_interval: 5,
          region: 'EU',
          country_code: '46',
        },
        icon: '/assets/icon.svg',
      }));
    });
  }
}

module.exports = MgVehicleDriver;
