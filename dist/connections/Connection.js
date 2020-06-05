"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const url_1 = require("url");
const chalk_1 = __importDefault(require("chalk"));
const cli_highlight_1 = __importDefault(require("cli-highlight"));
const utils_1 = require("../utils");
class Connection {
    constructor(config, options, type = 'write') {
        this.config = config;
        this.options = options;
        this.type = type;
        if (!this.options) {
            const props = ['dbName', 'clientUrl', 'host', 'port', 'user', 'password', 'multipleStatements', 'pool'];
            this.options = props.reduce((o, i) => { o[i] = this.config.get(i); return o; }, {});
        }
    }
    async transactional(cb, ctx) {
        throw new Error(`Transactions are not supported by current driver`);
    }
    getConnectionOptions() {
        const ret = {};
        const url = new url_1.URL(this.options.clientUrl || this.config.getClientUrl());
        this.options.host = ret.host = this.config.get('host', url.hostname);
        this.options.port = ret.port = this.config.get('port', +url.port);
        this.options.user = ret.user = this.config.get('user', url.username);
        this.options.password = ret.password = this.config.get('password', url.password);
        this.options.dbName = ret.database = this.config.get('dbName', url.pathname.replace(/^\//, ''));
        return ret;
    }
    getClientUrl() {
        const options = this.getConnectionOptions();
        const url = new url_1.URL(this.config.getClientUrl(true));
        return `${url.protocol}//${options.user}${options.password ? ':*****' : ''}@${options.host}:${options.port}`;
    }
    setMetadata(metadata) {
        this.metadata = metadata;
    }
    async executeQuery(query, cb) {
        const now = Date.now();
        try {
            const res = await cb();
            this.logQuery(query, Date.now() - now);
            return res;
        }
        catch (e) {
            this.logQuery(chalk_1.default.red(query), Date.now() - now, undefined);
            throw e;
        }
    }
    logQuery(query, took, language) {
        if (this.config.get('highlight') && language) {
            query = cli_highlight_1.default(query, { language, ignoreIllegals: true, theme: this.config.getHighlightTheme() });
        }
        let msg = query + (utils_1.Utils.isDefined(took) ? chalk_1.default.grey(` [took ${chalk_1.default.grey(took)} ms]`) : '');
        if (this.config.get('replicas', []).length > 0) {
            msg += chalk_1.default.cyan(` (via ${this.type} connection '${this.options.name || this.config.get('name') || this.options.host}')`);
        }
        this.config.getLogger().log('query', msg);
    }
}
exports.Connection = Connection;
