var Service, Characteristic;

var Openwebif = require('./openwebif');
var inherits = require('util').inherits;

module.exports = function (homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-openwebif-switch", "OpenWebifSwitch", OpenWebifSwitchAccessory);
}

function OpenWebifSwitchAccessory(log, config) {
	this.log = log;
	log("startup " + Openwebif.RemoteKey.FAST_FORWARD);
	this.config = config
	this.name = config["name"];

	//required
	this.host = config["host"];
	this.port = config["port"] || 80;
	this.openwebif = new Openwebif(this.host, this.port, this.log);
	this.log("openwebif " + this.openwebif);
	this.checkIntervalSeconds = config["checkIntervalSeconds"] || 120;
	this.excludeSpeakerService = config["excludeSpeakerService"] || false;
	this.bouquets = config["bouquets"] || [];
	var me = this;
	if (this.checkIntervalSeconds > 0) {
		setInterval(function () {
			me.openwebif.getPowerState(function (error, value) {
				if (error) {

				} else {
					me.tvService.setCharacteristic(Characteristic.Active, value);
				}
			});
			if (!me.excludeSpeakerService){
				me.openwebif.getVolumeAndMute(function (error,characteristicValue, mute) {
					if (error) {

					} else {
						me.speakerService.setCharacteristic(Characteristic.Volume, characteristicValue);
						me.speakerService.setCharacteristic(Characteristic.Mute, mute);
					}
				});
			}
		}, me.checkIntervalSeconds * 1000);

	}
}

OpenWebifSwitchAccessory.prototype = {

	generateTVService : function() {
		var me = this;
		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

		this.tvService.getCharacteristic(Characteristic.Active)
		.on('get', this.openwebif.getPowerState.bind(this.openwebif))
		.on('set', this.openwebif.setPowerState.bind(this.openwebif));

		// Identifier of Current Active imput.
		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
		.on('set', (inputIdentifier, callback) => {
			this.log("new input " + inputIdentifier);
			var channel = this.inputChannels[inputIdentifier]
			this.openwebif.setCurrentChannelWithRef(channel.reference, callback);
		})
		.on('get', (callback) => {
			me.log.error("getting dings");
			me.openwebif.getCurrentServiceReference(function(error, ref) {
				for (var i = 0; i < me.inputChannels.length; i++) {
					var channel = me.inputChannels[i];
					if (channel.reference == ref) {
						me.log("found reference with id " + i);
						me.log("current channel is "+ channel.name);
						callback(null, i);
						return;
					}
				}
				callback("no reference found");
			});
		});

		this.tvService.getCharacteristic(Characteristic.RemoteKey)
		.on('set', this.remoteKeyPress.bind(this));
		this.tvService.addCharacteristic(this.makeDiscSpaceCharacteristic())
		.on('get', this.getDiscSpace.bind(this))

		if (this.config["includeIP"] || false) {
			this.tvService.setCharacteristic(this.makeIPCharacteristic(this.host), this.host);
		}
		return this.tvService;
	},
	generateSpeakerService : function() {
		this.speakerService = new Service.TelevisionSpeaker(this.name);
		this.speakerService
		.getCharacteristic(Characteristic.Volume)
		.on('get', this.openwebif.getVolume.bind(this.openwebif))
		.on('set', this.openwebif.setVolume.bind(this.openwebif));
		this.speakerService
		.getCharacteristic(Characteristic.Mute)
		.on('get', this.openwebif.getMute.bind(this.openwebif))
		.on('set', this.openwebif.setMute.bind(this.openwebif));

		this.speakerService.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);

		return this.speakerService;
	},
	generateInputServices : function() {

		if (this.bouquets == undefined || this.bouquets == null || this.bouquets.length <= 0 || Array.isArray(this.bouquets) == false) {
			this.log.error("no Bouquet list or not an array");
			this.openwebif._printBouquets()
			return;
		}

		// TODO load persisted Names

		this.inputServices = new Array();
		this.inputChannels = new Array();
		var counter = 0;
		this.bouquets.forEach((bouquet, i) => {
			bouquet.channels.forEach((channel, i) => {
				this.log("Adding Channel " + channel.name);
				let tmpInput = new Service.InputSource(channel.name, "channelLink" + counter);
				tmpInput
				.setCharacteristic(Characteristic.Identifier, counter)
				.setCharacteristic(Characteristic.ConfiguredName, channel.name)
				.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
				.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.TV)
				.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tmpInput
				.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					// TODO: persist name
					callback()
				});

				this.inputChannels.push(channel);
				this.inputServices.push(tmpInput);
				counter++;
			});
		});
		if (counter == 0){
			this.openwebif._printBouquets()
		}
		return this.inputServices;
	},
	remoteKeyPress : function(remoteKey, callback) {
		this.log('webOS - remote key pressed: %d', remoteKey);
		var command = 0;
		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
			command = Openwebif.RemoteKey.REWIND;
			break;
			case Characteristic.RemoteKey.FAST_FORWARD:
			command = Openwebif.RemoteKey.FAST_FORWARD;
			break;
			case Characteristic.RemoteKey.NEXT_TRACK:
			command = Openwebif.RemoteKey.NEXT_TRACK;
			break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
			command = Openwebif.RemoteKey.PREVIOUS_TRACK;
			break;
			case Characteristic.RemoteKey.ARROW_UP:
			command = Openwebif.RemoteKey.ARROW_UP;
			break;
			case Characteristic.RemoteKey.ARROW_DOWN:
			command = Openwebif.RemoteKey.ARROW_DOWN;
			break;
			case Characteristic.RemoteKey.ARROW_LEFT:
			command = Openwebif.RemoteKey.ARROW_LEFT;
			break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
			command = Openwebif.RemoteKey.ARROW_RIGHT;
			break;
			case Characteristic.RemoteKey.SELECT:
			command = Openwebif.RemoteKey.SELECT;
			break;
			case Characteristic.RemoteKey.BACK:
			command = Openwebif.RemoteKey.BACK;;
			// what is the difference between back and exit?
			break;
			case Characteristic.RemoteKey.EXIT:
			// what is the difference between back and exit?
			command = Openwebif.RemoteKey.EXIT;;
			break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
			command = Openwebif.RemoteKey.PLAY_PAUSE;;
			break;
			case Characteristic.RemoteKey.INFORMATION:
			command = Openwebif.RemoteKey.PLAY_PAUSE;;
			// using menu button here.
			break;
		}
		this.openwebif.sendCommand(command,callback);
	},

	getDiscSpace: function (callback) {
		var me = this;
		this.openwebif.getDiscSpace(callback);
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

		var tvService  = this.generateTVService();
		var services = [informationService, tvService];

		var inputServices = this.generateInputServices();
		inputServices.forEach((service, i) => {
			tvService.addLinkedService(service);
			services.push(service);
		});

		if (!this.excludeSpeakerService){
			this.log("Adding SpeakerService");
			let speakerService = this.generateSpeakerService();
			services.push(speakerService);
			tvService.addLinkedService(speakerService);
		}
		return services;
	},

	/**
	* Custom characteristic for DiscSpace
	*
	* @return {Characteristic} The DiscSpace characteristic
	*/
	makeDiscSpaceCharacteristic : function() {
		var discSpaceChar = function() {
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
		inherits(discSpaceChar, Characteristic);
		return discSpaceChar;
	},
	/**
	* Custom characteristic for Hostname /IP
	*
	* @return {Characteristic} The characteristic
	*/
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
};
