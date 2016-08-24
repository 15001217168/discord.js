const WebSocket = require('ws');
const Constants = require('../../util/Constants');
const EventEmitter = require('events').EventEmitter;

class VoiceConnectionWebSocket extends EventEmitter {
  constructor(voiceConnection, serverID, token, sessionID, endpoint) {
    super();
    this.voiceConnection = voiceConnection;
    this.token = token;
    this.sessionID = sessionID;
    this.serverID = serverID;
    this.ws = new WebSocket(`wss://${endpoint}`, null, { rejectUnauthorized: false });
    this.ws.onopen = () => this._onOpen();
    this.ws.onmessage = e => this._onMessage(e);
    this.ws.onclose = e => this._onClose(e);
    this.ws.onerror = e => this._onError(e);
    this.ws.on('error', console.log);
    this.heartbeat = null;
  }

  send(data) {
    if (this.ws.readyState === WebSocket.OPEN) {
      console.log('sending');
      this.ws.send(JSON.stringify(data), function ack(error) {
        if (error)
          console.log(error);
      });
    }
  }

  _shutdown() {
    if (this.ws) {
      this.ws.close();
    }
    clearInterval(this.heartbeat);
  }

  _onOpen() {
    this.send({
      op: Constants.OPCodes.DISPATCH,
      d: {
        server_id: this.serverID,
        user_id: this.voiceConnection.manager.client.user.id,
        session_id: this.sessionID,
        token: this.token,
      },
    });
  }

  _onClose(e) {
    this.emit('close', e);
  }

  _onError(e) {
    this.emit('error', e);
  }

  _setHeartbeat(interval) {
    this.heartbeat = setInterval(() => {
      this.send({
        op: Constants.VoiceOPCodes.HEARTBEAT,
        d: null,
      });
    }, interval);
    this.send({
      op: Constants.VoiceOPCodes.HEARTBEAT,
      d: null,
    });
  }

  _onMessage(event) {
    let packet;
    try {
      packet = JSON.parse(event.data);
    } catch (error) {
      return this._onError(error);
    }

    switch (packet.op) {
      case Constants.VoiceOPCodes.READY:
        this._setHeartbeat(packet.d.heartbeat_interval);
        this.emit('ready-for-udp', packet.d);
        break;
      case Constants.VoiceOPCodes.SESSION_DESCRIPTION:
        this.encryptionMode = packet.d.mode;
        this.secretKey = new Uint8Array(new ArrayBuffer(packet.d.secret_key.length));
        for (const index in packet.d.secret_key) {
          this.secretKey[index] = packet.d.secret_key[index];
        }
        this.emit('ready', this.secretKey);
        break;
      case Constants.VoiceOPCodes.SPEAKING:
        /*
        { op: 5,
        d: { user_id: '123123', ssrc: 1, speaking: true } }
        */
        this.emit('speaking', packet.d);
        break;
      default:
        this.emit('unknown', packet);
        break;
    }
  }
}

module.exports = VoiceConnectionWebSocket;
