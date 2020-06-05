"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = __importDefault(require("chalk"));
const CLIHelper_1 = require("./CLIHelper");
const utils_1 = require("../utils");
class MigrationCommandFactory {
    static create(command) {
        return {
            command: `migration:${command}`,
            describe: MigrationCommandFactory.DESCRIPTIONS[command],
            builder: (args) => MigrationCommandFactory.configureMigrationCommand(args, command),
            handler: (args) => MigrationCommandFactory.handleMigrationCommand(args, command),
        };
    }
    static configureMigrationCommand(args, method) {
        if (method === 'create') {
            this.configureCreateCommand(args);
        }
        if (['up', 'down'].includes(method)) {
            this.configureUpDownCommand(args, method);
        }
        return args;
    }
    static configureUpDownCommand(args, method) {
        args.option('t', {
            alias: 'to',
            type: 'string',
            desc: `Migrate ${method} to specific version`,
        });
        args.option('f', {
            alias: 'from',
            type: 'string',
            desc: 'Start migration from specific version',
        });
        args.option('o', {
            alias: 'only',
            type: 'string',
            desc: 'Migrate only specified versions',
        });
    }
    static configureCreateCommand(args) {
        args.option('b', {
            alias: 'blank',
            type: 'boolean',
            desc: 'Create blank migration',
        });
        args.option('d', {
            alias: 'dump',
            type: 'boolean',
            desc: 'Dumps all queries to console',
        });
        args.option('p', {
            alias: 'path',
            type: 'string',
            desc: 'Sets path to directory where to save entities',
        });
    }
    static async handleMigrationCommand(args, method) {
        const options = { pool: { min: 1, max: 1 } };
        const orm = await CLIHelper_1.CLIHelper.getORM(undefined, options);
        const migrator = orm.getMigrator();
        switch (method) {
            case 'create':
                await this.handleCreateCommand(migrator, args, orm.config);
                break;
            case 'list':
                await this.handleListCommand(migrator);
                break;
            case 'pending':
                await this.handlePendingCommand(migrator);
                break;
            case 'up':
            case 'down':
                await this.handleUpDownCommand(args, migrator, method);
        }
        await orm.close(true);
    }
    static async handleUpDownCommand(args, migrator, method) {
        const opts = MigrationCommandFactory.getUpDownOptions(args);
        await migrator[method](opts);
        const message = this.getUpDownSuccessMessage(method, opts);
        CLIHelper_1.CLIHelper.dump(chalk_1.default.green(message));
    }
    static async handlePendingCommand(migrator) {
        const pending = await migrator.getPendingMigrations();
        CLIHelper_1.CLIHelper.dumpTable({
            columns: ['Name'],
            rows: pending.map(row => [row.file.replace(/\.[jt]s$/, '')]),
            empty: 'No pending migrations',
        });
    }
    static async handleListCommand(migrator) {
        const executed = await migrator.getExecutedMigrations();
        CLIHelper_1.CLIHelper.dumpTable({
            columns: ['Name', 'Executed at'],
            rows: executed.map(row => [row.name.replace(/\.[jt]s$/, ''), row.executed_at.toISOString()]),
            empty: 'No migrations executed yet',
        });
    }
    static async handleCreateCommand(migrator, args, config) {
        const ret = await migrator.createMigration(args.path, args.blank);
        if (ret.diff.length === 0) {
            return CLIHelper_1.CLIHelper.dump(chalk_1.default.green(`No changes required, schema is up-to-date`));
        }
        if (args.dump) {
            CLIHelper_1.CLIHelper.dump(chalk_1.default.green('Creating migration with following queries:'));
            CLIHelper_1.CLIHelper.dump(ret.diff.map(sql => '  ' + sql).join('\n'), config, 'sql');
        }
        CLIHelper_1.CLIHelper.dump(chalk_1.default.green(`${ret.fileName} successfully created`));
    }
    static getUpDownOptions(flags) {
        if (!flags.to && !flags.from && flags.only) {
            return { migrations: flags.only.split(/[, ]+/) };
        }
        const ret = {};
        ['from', 'to'].filter(k => flags[k]).forEach(k => ret[k] = flags[k] === '0' ? 0 : flags[k]);
        return ret;
    }
    static getUpDownSuccessMessage(method, options) {
        const msg = `Successfully migrated ${method}`;
        if (method === 'down' && utils_1.Utils.isEmpty(options)) {
            return msg + ' to previous version';
        }
        if (options.to === 0) {
            const v = { down: 'first', up: 'latest' }[method];
            return `${msg} to the ${v} version`;
        }
        if (method === 'up' && utils_1.Utils.isEmpty(options)) {
            return msg + ' to the latest version';
        }
        if (utils_1.Utils.isString(options.to)) {
            return msg + ' to version ' + options.to;
        }
        if (options.migrations && options.migrations.length === 1) {
            return msg + ' to version ' + options.migrations[0];
        }
        return msg;
    }
}
exports.MigrationCommandFactory = MigrationCommandFactory;
MigrationCommandFactory.DESCRIPTIONS = {
    create: 'Create new migration with current schema diff',
    up: 'Migrate up to the latest version',
    down: 'Migrate one step down',
    list: 'List all executed migrations',
    pending: 'List all pending migrations',
};
