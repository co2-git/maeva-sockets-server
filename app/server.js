import 'babel-polyfill';
import {Server as WSServer} from 'ws';
import maeva from 'maeva';
import _ from 'lodash';

export default class Server extends WSServer {
  static parse(string) {
    return JSON.parse(string);
  }
  static stringify(message) {
    return JSON.stringify(message);
  }
  plugins = [];
  listeners = [];
  constructor(port, plugins = []) {
    super({port});
    this.plugins = plugins;
    this.on('connection', this.onConnection.bind(this));
  }
  sendTo(ws, message) {
    ws.send(JSON.stringify(message));
  }
  onConnection(ws) {
    ws.maeva = {};
    console.log('new connexion');
    ws.on('message', async (messageString) => {
      const message = Server.parse(messageString);
      const {action} = message;
      console.log(require('util').inspect({message}, {depth: null}));

      switch (action) {
      case 'auth': {
        const {auth} = message;
        ws.conn = await this.onAuth(ws, auth);
        console.log('connected to db server', auth);
        this.sendTo(ws, {connected: true});
      } break;

      case 'listen': {
        this.listeners.push({ws, ...message});
        this.sendTo(ws, {message: {addListener: message}});
      } break;

      case 'find':
      case 'insert': {
        const {
          collection,
          get,
          id,
          set,
        } = message;
        try {
          const results = await ws.conn.operations[action]({
            collection,
            get,
            set,
          });
          this.sendTo(ws, {
            id,
            action,
            results,
          });
        } catch (error) {
          console.log(error.stack);
          this.emit('error', error);
          this.sendTo(ws, {
            id,
            action,
            error: {
              message: error.name,
            },
          });
        }
      } break;
      }
    });
  }
  onAuth(ws, auth) {
    return new Promise(async (resolve, reject) => {
      try {
        const {plugin: pluginName} = auth;
        const plugin = _.find(this.plugins, {name: pluginName});
        if (!plugin) {
          throw new Error('Plugin not found');
        }
        const conn = await maeva.connect(plugin.connect(auth.url));
        resolve(conn);
      } catch (error) {
        reject(error);
      }
    });
  }
}
