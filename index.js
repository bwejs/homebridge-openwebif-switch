var Service, Characteristic;

const ping = require('./hostportconnectable');
const request = require('request');
const xmlParser = require('xml2js').parseString;
var inherits = require('util').inherits;

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-openwebif-switch", "OpenWebifSwitch", OpenWebifSwitchAccessory);
}

function OpenWebifSwitchAccessory(log, config) {
	this.log = log;

	this.name = config["name"];

	//required
	this.host = config["host"];
	this.port = config["port"] || 80;
	this.checkIntervalSeconds = config["checkIntervalSeconds"] || 120;

	var me = this;
	if (this.checkIntervalSeconds > 0) {
		setInterval(function () {
			ping.checkHostIsReachable(me.host, me.port, function (reachable) {
				if (reachable) {
					me._httpRequest("http://" + me.host + ":" + me.port + "/api/powerstate", '', 'GET', function (error, response, responseBody) {
						try {
							var result = JSON.parse(responseBody);
							var powerOnCurrent = result.instandby === false;
							me.switchService.setCharacteristic(Characteristic.On, powerOnCurrent);
						} catch (error) {
							me.log('Error  %s', powerOn ? 'ON' : 'OFF');
							//dont change Characteristic value						
						}
					});
				}
			});
		}, me.checkIntervalSeconds * 1000);
	}
}

OpenWebifSwitchAccessory.prototype = {

	setPowerState: function (powerOn, callback) {
		powerOn = powerOn ? true : false; //number to boolean
		if (!this.host) {
			callback(new Error("No host defined."));
		}
		if (!this.port) {
			callback(new Error("No port defined."));
		}

		var me = this;
		me.log('Power state change request: ', powerOn);

		ping.checkHostIsReachable(me.host, me.port, function (reachable) {
			if (reachable) {
				//Check Standby-State				
				me._httpRequest("http://" + me.host + ":" + me.port + "/api/powerstate", '', 'GET', function (error, response, responseBody) {
					var result = JSON.parse(responseBody);
					var powerOnCurrent = result.instandby === false;
					me.log('setPowerState() - currentState: ' + powerOnCurrent);

					//{"instandby": false, "result": true}
					if (powerOnCurrent == powerOn) {
						//state like expected. nothing to do
						me.log('setPowerState() - nothing to do');
						callback(null, powerOn);
					} else { //State setzen

						me._httpRequest("http://" + me.host + ":" + me.port + "/api/powerstate?newstate=" + (powerOn ? "0" : "0"), '', 'GET', function (error, response, responseBody) {
							if (error) {
								me.log('setPowerState() failed: %s', error.message);
								callback(error, false);
							} else {
								try {
									me.log('setPowerState() succeded');
									var result = JSON.parse(responseBody);
									var powerOn = result.inStandby == "false";

									me.log('power is currently %s', powerOn ? 'ON' : 'OFF');
									callback(null, powerOn);
								} catch (e) {
									me.log('Error  %s', powerOn ? 'ON' : 'OFF');
									callback(e, null);
								}
							}
						}.bind(this));
					} //if
				});
			} else {
				callback(null, powerOn ? false : true); //totally off ->
			}
		});

	},

	getPowerState: function (callback) {
		if (!this.host) {
			callback(new Error("No host defined."));
		}
		if (!this.port) {
			callback(new Error("No port defined."));
		}

		var me = this;

		ping.checkHostIsReachable(me.host, me.port, function (reachable) {
			if (reachable) {
				me._httpRequest("http://" + me.host + ":" + me.port + "/api/statusinfo", '', 'GET', function (error, response, responseBody) {
					if (error) {
						me.log('getPowerState() failed: %s', error.message);
						callback(error);
					} else {
						try {
							var result = JSON.parse(responseBody);
							var powerOn = result.inStandby == "false";
							me.log('power is currently %s', powerOn ? 'ON' : 'OFF');
							callback(null, powerOn);
						} catch (e) {
							callback(e, null);
							me.log('error parsing: ' + e);
						}
					}
				}.bind(this));
			} else {
				callback(null, false); //totally off
			}
		});
	},

	setVolume: function (value, callback) {
		this.log("setVolume" + value);
		var targetValue = parseInt(value);

		if (!this.host) {
			callback(new Error("No host defined."));
		}
		if (!this.port) {
			callback(new Error("No port defined."));
		}

		var me = this;
		ping.checkHostIsReachable(me.host, me.port, function (reachable) {
			if (reachable) {
				me._httpRequest("http://" + me.host + ":" + me.port + "/web/vol?set=set" + targetValue, '', 'GET', function (error, response, responseBody) {
					if (error) {
						me.log('getVolume() failed: %s', error.message);
						callback(error);
					} else {
						callback(null, targetValue);
					}
				}.bind(this));
			} else {
				callback(new Error("device is off"), null); //totally off
			}
		});
	},

	getVolume: function (callback) {
		if (!this.host) {
			callback(new Error("No host defined."));
		}
		if (!this.port) {
			callback(new Error("No port defined."));
		}

		var me = this;
		ping.checkHostIsReachable(me.host, me.port, function (reachable) {
			if (reachable) {
				me._httpRequest("http://" + me.host + ":" + me.port + "/web/vol?get", '', 'GET', function (error, response, responseBody) {
					if (error) {
						me.log('getVolume() failed: %s', error.message);
						callback(error);
					} else {
						try {
							var result = xmlParser(responseBody, function(err, data) {
								if (err) {
									callback(err, null);
									me.log('error parsing: ' + err);
								} else {
									var xmlValue = data.e2volume.e2current[0];
									var percentage = parseFloat(xmlValue);
									var characteristicValue = percentage;// (percentage / 5.0) - 10.0; //auf 20 runterrechnen und auf -10 bis 10 ummappen.
									me.log("received volume from vusolo: " + xmlValue + " mapped to " + characteristicValue);
									callback(null, characteristicValue);
								}
							});
						} catch (e) {
							callback(e, null);
							me.log('error parsing: ' + e);
						}
					}
				}.bind(this));
			} else {
				callback(new Error("device is off"), null); //totally off
			}
		});
	},

	identify: function (callback) {
		this.log("Identify requested!");
		callback();
	},

	getServices: function () {
		var informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Manufacturer, "alex224")
			.setCharacteristic(Characteristic.Model, "OpenWebifSwitch")
			.setCharacteristic(Characteristic.SerialNumber, "OpenWebifSwitch Serial Number");

		this.switchService = new Service.Switch(this.name);
		this.switchService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

			
		this.switchService
			.addCharacteristic(this.makeVolumeCharacteristic())
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));

		return [informationService, this.switchService ];
	},

	/**
	 * Custom characteristic for volume
	 *
	 * @return {Characteristic} The volume characteristic
	 */
	makeVolumeCharacteristic : function() {
	
		var volumeCharacteristic = function() {
			Characteristic.call(this, 'Volume', '91288267-5678-49B2-8D22-F57BE995AA00');
			this.setProps({
				format: Characteristic.Formats.INT,
				unit: Characteristic.Units.PERCENTAGE,
				maxValue: 100,
				minValue: 0,
				minStep: 1,
				perms: [Characteristic.Perms.READ, Characteristic.Perms.WRITE, Characteristic.Perms.NOTIFY]
			});
			//this.value = this.getDefaultValue();
			this.value = 50;
		};
	
		inherits(volumeCharacteristic, Characteristic);
		return volumeCharacteristic;
	},

	_httpRequest: function (url, body, method, callback) {
		request({
			url: url,
			body: body,
			method: method,
			rejectUnauthorized: false
		},
			function (error, response, body) {
				callback(error, response, body);
			});
	},
};