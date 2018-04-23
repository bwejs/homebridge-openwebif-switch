var Service, Characteristic;

const ping = require('./hostportconnectable');
const request = require('request');
const xmlParser = require('xml2js').parseString;
var inherits = require('util').inherits;

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	inherits(OpenWebifSwitchAccessory.NowPlayingService, Service);

	homebridge.registerAccessory("homebridge-openwebif-switch", "OpenWebifSwitch", OpenWebifSwitchAccessory);
}

function OpenWebifSwitchAccessory(log, config) {
	this.log = log;
	this.config = config
	this.name = config["name"];

	//required
	this.host = config["host"];
	this.port = config["port"] || 80;
	this.checkIntervalSeconds = config["checkIntervalSeconds"] || 120;
	this.excludeSpeakerService = config["excludeSpeakerService"] || false;

	var me = this;
	if (this.checkIntervalSeconds > 0) {
		setInterval(function () {
			me.getPowerState(function (error, value) {
				if (error) {

				} else {
					me.switchService.setCharacteristic(Characteristic.On, value);
				}
			});
			me.getVolume(function (error, value) {
				if (error) {

				} else {
					me.speakerService.setCharacteristic(Characteristic.Volume, value);
				}
			})
		}, me.checkIntervalSeconds * 1000);
	}
}


OpenWebifSwitchAccessory.NowPlayingService = function(name) {
  Service.call(this, name, 'F7138C87-EABF-420A-BFF0-76FC04DD81CD', null);

  // Optional Characteristics
  this.UUID = 'F7138C87-EABF-420A-BFF0-76FC04DD81CD';
};

OpenWebifSwitchAccessory.prototype = {

	setPowerState: function (powerOn, callback) {
		powerOn = powerOn ? true : false; //number to boolean
		var me = this;
		me.log('Power state change request: ', powerOn);
		me.getPowerState(function (error, powerOnCurrent) {
			if(error){
				callback(null, powerOn ? false : true); //totally off ->
			} else {
				if (powerOnCurrent == powerOn) {
					//state like expected. nothing to do
					me.log('setPowerState() - nothing to do');
					callback(null, powerOn);
				} else { //State setzen
					me._httpXMLGetForMethod("/web/powerstate?newstate=0", function (error,data) {
						if (error){
							me.log('setPowerState() failed: %s', error.message);
							callback(error)
						} else {
							me.log('setPowerState() succeded');
							var xmlValue = data.e2powerstate.e2instandby[0];
							var powerOn = xmlValue == "false";
							me.log('power is currently %s', powerOn ? 'ON' : 'OFF');
							callback(null, powerOn);
						}
					});
				} //if
			}
		});
	},

	getPowerState: function (callback) {
		var me = this;
		this._httpXMLGetForMethod("/web/powerstate", function (error,data) {
			if (error){
				callback(error)
			} else {
				var xmlValue = data.e2powerstate.e2instandby[0];
				var powerOn = xmlValue == "false";
				var characteristicValue = powerOn;
				callback(null, characteristicValue);
			}
		});
	},

	setVolume: function (value, callback) {
		var me = this;
		var targetValue = parseInt(value);
		this.log("setVolume" + value);
		this._httpXMLGetForMethod("/web/vol?set=set" + targetValue, function (error,data) {
			if (error){
				me.log('getVolume() failed: %s', error.message);
				callback(error)
			} else {
				callback(null, targetValue);

			}
		});
	},
	setMute: function (value, callback) {
		var me = this;
		var	tagetValue = value ? true : false; //number to boolean
		me.getMute(function (error, muteCurrent) {
			if(error){
				callback(null, targetValue ? false : true); //totally off ->
			} else {
				if (muteCurrent == tagetValue) {
					//state like expected. nothing to do
					me.log('setMute() - nothing to do');
					callback(null, targetValue);
				} else { //State setzen
					me._httpXMLGetForMethod("/web/vol?set=mute", function (error,data) {
						if (error){
							me.log('setMute() failed: %s', error.message);
							callback(error)
						} else {
							me.log('setMute() succeded');
							callback(null, tagetValue);
						}
					});
				} //if
			}
		});
	},
	getMute: function (callback) {
		var me = this;
		this.getVolumeAndMute(function (error,characteristicValue, mute) {
			if (error){
				callback(error)
			} else {
				callback(null, mute);
			}
		});
	},
	getVolume: function (callback) {
		var me = this;
		this.getVolumeAndMute(function (error,characteristicValue, mute) {
			if (error){
				callback(error)
			} else {
				callback(null, characteristicValue);
			}
		});
	},
	getVolumeAndMute: function (callback) {
		var me = this;
		this._httpXMLGetForMethod("/web/vol", function (error,data) {
			if (error){
				callback(error)
			} else {
				var xmlValue = data.e2volume.e2current[0];
				var xmlMuteValue = data.e2volume.e2ismuted[0];
				var percentage = parseFloat(xmlValue);
				var boolMute = xmlMuteValue == "True";
				var characteristicValue = percentage;// (percentage / 5.0) - 10.0; //auf 20 runterrechnen und auf -10 bis 10 ummappen.
				me.log("received volume from vusolo: " + xmlValue + " mapped to " + characteristicValue);
				callback(null, characteristicValue, boolMute);
			}
		});
	},

	getDiscSpace: function (callback) {
		var me = this;
		this._httpXMLGetForMethod("/web/about", function (error,data) {
			if (error){
				callback(error)
			} else {
				var freexmlValue = data.e2abouts.e2about[0].e2hddinfo[0].free;
				var freeDouble = parseFloat(freexmlValue);
				var capacityxmlValue = data.e2abouts.e2about[0].e2hddinfo[0].capacity;
				var capacityDouble = parseFloat(capacityxmlValue);
				var percentage = (freeDouble / capacityDouble) * 100;
				var characteristicValue = percentage;// (percentage / 5.0) - 10.0; //auf 20 runterrechnen und auf -10 bis 10 ummappen.
				me.log("received volume from vusolo: " + freexmlValue + " mapped to " + characteristicValue);
				callback(null, characteristicValue);
			}
		});
	},
	getCurrentService: function (callback) {
		var me = this;
		this._httpXMLGetForMethod("/web/getcurrent", function (error,data) {
			if (error){
				callback(error)
			} else {
				var title = data.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventservicename;
				callback(null, String(title));
			}
		});
	},
	
	getCurrentTitle: function (callback) {
		var me = this;
		this._httpXMLGetForMethod("/web/getcurrent", function (error,data) {
			if (error){
				callback(error)
			} else {
				var title = data.e2currentserviceinformation.e2eventlist[0].e2event[0].e2eventtitle;
				callback(null, String(title));
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
		.addCharacteristic(this.makeDiscSpaceCharacteristic())
		.on('get', this.getDiscSpace.bind(this))
		
		
		

		if (this.config["includeIP"] || false) {
			this.switchService.setCharacteristic(this.makeIPCharacteristic(this.host), this.host);
		}
		var services = [informationService, this.switchService];
		
		if (true){
			this.nowPlayingService = new OpenWebifSwitchAccessory.NowPlayingService(this.name);
						
			this.nowPlayingService.addCharacteristic(this.makeNowPlayingTitleeCharacteristic())
			.on('get', this.getCurrentTitle.bind(this));
			
			this.nowPlayingService.addCharacteristic(this.makeNowPlayingAlbumCharacteristic())
			.on('get', this.getCurrentService.bind(this));

			services.push(this.nowPlayingService);
		}
		
		
		if (!this.excludeSpeakerService){
			this.speakerService = new Service.Speaker(this.name);
			this.speakerService
			.getCharacteristic(Characteristic.Volume)
			.on('get', this.getVolume.bind(this))
			.on('set', this.setVolume.bind(this));
			this.speakerService
			.getCharacteristic(Characteristic.Mute)
			.on('get', this.getMute.bind(this))
			.on('set', this.setMute.bind(this));
			services.push(this.speakerService);
		}
		return services;
	},

	/**
	* Custom characteristic for DiscSpace
	*
	* @return {Characteristic} The DiscSpace characteristic
	*/
	makeDiscSpaceCharacteristic : function() {

		var volumeCharacteristic = function() {
			Characteristic.call(this, 'DiscSpace', 'B795302F-FFBA-41D9-9076-337986B81D27');
			this.setProps({
				format: Characteristic.Formats.INT,
				unit: Characteristic.Units.PERCENTAGE,
				maxValue: 100,
				minValue: 0,
				minStep: 1,
				perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
			});
			this.value = 0;
		};

		inherits(volumeCharacteristic, Characteristic);
		return volumeCharacteristic;
	},


	makeNowPlayingTitleeCharacteristic : function() {
		var generated = function() {
			Characteristic.call(this, 'Title', '00003001-0000-1000-8000-135D67EC4377');
			this.setProps({
				format: Characteristic.Formats.STRING,
				perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
			});
			this.value = "";
		};
		inherits(generated, Characteristic);
		return generated;
	},
	makeNowPlayingAlbumCharacteristic : function() {
		var generated = function() {
			Characteristic.call(this, 'Sender', '00003002-0000-1000-8000-135D67EC4377');
			this.setProps({
				format: Characteristic.Formats.STRING,
				perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
			});
			this.value = "";
		};

		inherits(generated, Characteristic);
		return generated;
	},


	makeIPCharacteristic : function(ip) {
		var volumeCharacteristic = function() {
			Characteristic.call(this, 'IP', 'B795302F-FFBA-41D9-9076-337986B81D29');
			this.setProps({
				format: Characteristic.Formats.STRING,
				perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
			});
			this.value = ip;
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

	_httpXMLGetForMethod: function (method, callback) {
		if (!this.host) {
			callback(new Error("No host defined."));
		}
		if (!this.port) {
			callback(new Error("No port defined."));
		}

		var me = this;
		ping.checkHostIsReachable(me.host, me.port, function (reachable) {
			if (reachable) {
				me._httpRequest("http://" + me.host + ":" + me.port + method , '', 'GET', function (error, response, responseBody) {
					if (error) {
						me.log('%s() failed: %s', method, error.message);
						callback(error, null);
					} else {
						try {
							var result = xmlParser(responseBody, function(err, data) {
								if (err) {
									callback(err, null);
									me.log('error parsing: ' + err);
								} else {
									me.log('parsed xml for method %s', method);
									callback(null, data);
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

};
